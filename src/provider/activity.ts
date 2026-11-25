// Jira's activity walk: the domain logic that predates the contract and still earns its place.
//
// `events_list` lists the work items the signed-in person is part of (assignee, reporter or watcher) on every Jira
// site the account reaches, one event per work item each time a read finds it updated. Jira's search sees only a work
// item's last update, so several updates between two reads are one event, for the latest. A work item is listed once it
// was updated at least SETTLE_MS ago, so Jira's search index has caught up.
//
// The cursor holds, per site, the (update time, work item id) of the last item listed. JQL dates are read in the
// signed-in person's Jira time zone and rounded to the minute, so the search names its window in minutes before now
// (`updated >= "-<n>m"`), opens a little before the cursor and keeps only what comes after the cursor's exact position.
//
// Nothing here names a provider endpoint: the read function is the provider client's aliased call.
import {
  eventsListResult,
  fitPage,
  makeEvent,
  parseEventsListInput,
  probeResult,
  screenEvents,
  type EventsListResult,
  type EventsOwner,
  type ProbeResult,
  type SourceEvent,
} from "@we-the-rebel-alliance/plugin-contract/events"
import { decodeBoundCursor, encodeBoundCursor, type CursorBinding } from "@we-the-rebel-alliance/plugin-contract/cursor"
import { PLUGIN, ProviderError } from "./atlassian.ts"
import { oneLine } from "../redact.ts"

/** The source's name in `events_list` and in a cursor binding, and its declared id. */
export const SOURCE = "jira"
export const SOURCE_ID = "jira.activity"
/** The package name every page names. */
export const PACKAGE = "@we-the-rebel-alliance/jira-plugin"

/** The three Atlassian reads the source makes, by their vendor tool names. */
export const IDENTITY_TOOL = "atlassianUserInfo"
export const SITES_TOOL = "getAccessibleAtlassianResources"
export const SEARCH_TOOL = "searchJiraIssuesUsingJql"

/** A work item is listed once it was updated this long ago, when Jira's search index has it. */
export const SETTLE_MS = 5 * 60_000
/** A listing without `since` starts this many hours before now: the plugin's own default. */
export const FIRST_RUN_HOURS = 24
/** How many minutes before the cursor the search window opens: room for the clocks of this machine and Atlassian's. */
export const MARGIN_MINUTES = 2
/** Work items per search page, Atlassian's most. */
export const SEARCH_PAGE = 100
/** The most search pages one call reads per site; a larger burst is passed with a `gap`, never by failing every call. */
export const SEARCH_PAGES = 100
/** How far past a jammed read's latest update its position moves: the window's margin and its rounding minute. */
export const JAM_STEP_MS = (MARGIN_MINUTES + 1) * 60_000
/** The most sites one cursor holds a position for (a cursor is at most 1024 characters). */
export const MAX_SITES = 8
/** The work items a person is part of: the source never reads a whole site. */
export const INVOLVES = "(assignee = currentUser() OR reporter = currentUser() OR watcher = currentUser())"
/** What an event needs, and nothing more. */
export const FIELDS = ["summary", "updated", "assignee", "reporter", "status", "issuetype", "priority"]
/** An event's url is kept only on Atlassian's own cloud hosts: the source's `urlHosts`. */
const CLOUD_HOST = /^[a-z0-9][a-z0-9-]*\.atlassian\.net$/
const CLOUD_ID = /^[A-Za-z0-9-]{1,64}$/
const ACCOUNT_ID = /^[A-Za-z0-9:_-]{1,128}$/

type Data = Record<string, unknown>

/** One read through the provider: the vendor tool's name and its input, answered by Atlassian. */
export type Read = (tool: string, input: Readonly<Record<string, unknown>>) => Promise<unknown>

const isRecord = (value: unknown): value is Data => typeof value === "object" && value !== null && !Array.isArray(value)
const record = (value: unknown): Data => (isRecord(value) ? value : {})
const text = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined)

/** Atlassian's answers come as `{ data: … }` through some hosts and bare through others. */
const unwrap = (answer: unknown): Data => {
  const data = record(answer)
  return isRecord(data.data) ? (data.data as Data) : data
}

const fail = (code: "UNAVAILABLE" | "INPUT_INVALID" | "SOURCE_UNKNOWN" | "CURSOR_INVALID" | "OPTIONS_INVALID", what: string, next: string) =>
  new ProviderError(code, what, next)

/** Jira's time, such as `2026-11-13T10:00:00.123+0100`, in epoch milliseconds. */
export function jiraTime(value: unknown): number | undefined {
  const raw = text(value)
  if (raw === undefined) return undefined
  const parsed = Date.parse(raw.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"))
  return Number.isFinite(parsed) ? parsed : undefined
}

const unreadable = (tool: string, method = "events_list") =>
  fail("UNAVAILABLE", `Atlassian's ${tool} answered in a shape ${method} does not read`, `Call ${tool} directly to see Atlassian's answer, and run /jira.`)

// ── Who is signed in ────────────────────────────────────────────────────

/** Who is signed in on an alias: the owner every page and probe names. Nothing else of the answer is read. */
export interface SignedIn {
  readonly owner: EventsOwner
}

/**
 * The signed-in person from `atlassianUserInfo`: their account id (`accountId`, or `account_id` as Atlassian's `/me`
 * writes it), and, when the answer names one, their display name for the label. No email address is read.
 */
export function signedInOf(answer: unknown, method = "events_list"): SignedIn {
  const data = unwrap(answer)
  const user = isRecord(data.user) ? (data.user as Data) : data
  const id = text(user.accountId) ?? text(user.account_id)
  if (id === undefined || !ACCOUNT_ID.test(id)) throw unreadable(IDENTITY_TOOL, method)
  const name = text(user.displayName) ?? text(user.name) ?? text(user.nickname)
  const label = oneLine(name ?? id)
  return { owner: { id: `atlassian:${id}`, label: label === "" ? id : label } }
}

// ── Sites ───────────────────────────────────────────────────────────────

/** A Jira site the sign-in reaches: its cloud id, and its address for links. */
export interface Site {
  readonly cloudId: string
  readonly url?: string
}

/** The Jira sites from `getAccessibleAtlassianResources`, by cloud id; a site with no Jira product is left out. */
export function sitesOf(answer: unknown): Site[] {
  const data = unwrap(answer)
  const list = Array.isArray(answer) ? answer : Array.isArray(data.resources) ? data.resources : Array.isArray(data.sites) ? data.sites : undefined
  if (list === undefined) throw unreadable(SITES_TOOL)
  const sites = new Map<string, Site>()
  for (const item of list) {
    const entry = record(item)
    const cloudId = text(entry.cloudId) ?? text(entry.id)
    if (cloudId === undefined || !CLOUD_ID.test(cloudId)) continue
    const products = Array.isArray(entry.products) ? entry.products.map((product) => (text(record(product).id) ?? text(product) ?? "").toLowerCase()) : undefined
    const scopes = Array.isArray(entry.scopes) ? entry.scopes.map((scope) => String(scope).toLowerCase()) : undefined
    if (products !== undefined && !products.some((product) => product.includes("jira"))) continue
    if (products === undefined && scopes !== undefined && !scopes.some((scope) => scope.includes("jira"))) continue
    const url = text(entry.url)?.replace(/\/+$/, "")
    sites.set(cloudId, { cloudId, ...(url === undefined ? {} : { url }) })
  }
  return [...sites.values()].sort((a, b) => (a.cloudId < b.cloudId ? -1 : a.cloudId > b.cloudId ? 1 : 0))
}

/** The sites this call reads: the alias profile's one site, or all of them. A configured site must be reachable. */
export function readSites(answer: unknown, alias: string, site: string | undefined): Site[] {
  const sites = sitesOf(answer)
  if (site === undefined) return sites
  const found = sites.find((entry) => entry.cloudId === site)
  if (found === undefined) {
    throw fail(
      "OPTIONS_INVALID",
      `The ${alias} account's site ${JSON.stringify(site)} is not a Jira site this sign-in reaches`,
      `Correct options.accounts.${alias}.site, or remove it to read every Jira site.`,
    )
  }
  return [found]
}

// ── Work items ──────────────────────────────────────────────────────────

/** Where a site's feed stands: the update time and id of the last work item listed. */
export interface Position {
  readonly t: number
  readonly i: string
}

/** Work item ids are numbers as text: a shorter one is smaller; any other id falls back to text order. */
const compareIds = (a: string, b: string) => (/^\d+$/.test(a) && /^\d+$/.test(b) && a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0)
export const comparePositions = (a: Position, b: Position) => a.t - b.t || compareIds(a.i, b.i)
const isAfter = (a: Position, b: Position) => comparePositions(a, b) > 0

/** A person Jira names: an account id and a display name; no email address is kept. */
function actor(role: string, value: unknown) {
  const data = record(value)
  const id = text(data.accountId) ?? text(data.account_id)
  if (id === undefined || !ACCOUNT_ID.test(id)) return []
  const name = text(data.displayName) ?? text(data.name)
  return [{ role, id: `atlassian:${id}`, ...(name === undefined ? {} : { name }) }]
}

const named = (value: unknown) => text(value) ?? text(record(value).name)

/** A label as the contract keeps one: lowercase words joined by `-`. */
const label = (prefix: string, value: string | undefined) => (value === undefined ? [] : [`${prefix}:${value.toLowerCase().replace(/\s+/g, "-")}`])

/** One work item at its update time. */
export interface Change {
  readonly site: string
  readonly at: Position
  readonly event: SourceEvent
}

/** One event for one work item at its update time, or undefined for an entry without an id, a key or a time. */
export function issueChange(alias: string, site: Site, item: unknown): Change | undefined {
  const data = record(item)
  const fields = record(data.fields)
  const id = text(data.id)
  const key = text(data.key)
  const updated = jiraTime(fields.updated ?? data.updated)
  if (id === undefined || key === undefined || updated === undefined) return undefined
  const summary = text(fields.summary) ?? ""
  const status = named(fields.status)
  const category = named(record(fields.status).statusCategory)
  const type = named(fields.issuetype)
  const priority = named(fields.priority)
  const facts = [status && `Status: ${status}.`, type && `Type: ${type}.`, priority && `Priority: ${priority}.`].filter(Boolean).join(" ")
  const url = site.url
  const host = url === undefined ? "" : (() => { try { return new URL(url).hostname } catch { return "" } })()
  const event = makeEvent({
    source: SOURCE,
    account: alias,
    external_id: `${site.cloudId}/${id}@${new Date(updated).toISOString()}`,
    kind: "issue",
    occurred_at: updated,
    thread: `jira-issue:${site.cloudId}/${id}`,
    actors: [...actor("assignee", fields.assignee), ...actor("reporter", fields.reporter)],
    title: summary === "" ? key : `${key}: ${summary}`,
    text: facts,
    url: CLOUD_HOST.test(host) && /^[A-Z][A-Z0-9_]*-\d+$/.test(key) ? `https://${host}/browse/${key}` : null,
    labels: [...label("type", type), ...label("status", category)],
  })
  return { site: site.cloudId, at: { t: updated, i: id }, event }
}

/** One search page: its work items, the next page's token, and whether it is the last. */
function searchPage(answer: unknown) {
  const data = unwrap(answer)
  const issues = data.issues
  if (!Array.isArray(issues)) throw unreadable(SEARCH_TOOL)
  const next = text(data.nextPageToken)
  return { issues, next, last: data.isLast === true || next === undefined }
}

/** What one site's search gave: its work items after the cursor, oldest first, and how far it is complete. */
interface SiteRead {
  readonly changes: Change[]
  /** Every listable work item of the site is here: none is waiting on a later page. */
  readonly exhausted: boolean
  /** Not exhausted: the time from which this read is incomplete. Every work item updated before it is here. */
  readonly boundary: number
  /** A burst too large to split; the latest update time the read saw, which the position moves past with a gap. */
  readonly jammed?: number
}

/** The search for one site, opened at a position: the window names whole minutes before now, plus the margin. */
const searchJql = (from: Position, now: number) =>
  `${INVOLVES} AND updated >= "-${Math.max(1, Math.ceil((now - from.t) / 60_000)) + MARGIN_MINUTES}m" ORDER BY updated ASC, key ASC`

/**
 * The work items of one site updated after `from`, oldest first, up to `end`, until at least `need` are complete.
 *
 * Each search answers its first page as one snapshot, so the read prefers fresh searches: after a page, the next
 * search opens at the last complete position, and no `nextPageToken` is followed while that makes progress. A page's
 * last update time may have more work items on the next page, so only those before it are complete.
 */
async function siteChanges(read: Read, alias: string, site: Site, from: Position, now: number, end: number, need: number): Promise<SiteRead> {
  const found = new Map<string, Change>()
  let at = from
  let token: string | undefined
  let walking = false
  let current = new Map<string, Change>()
  const sorted = () => [...found.values()].sort((a, b) => comparePositions(a.at, b.at))
  for (let pages = 0; pages < SEARCH_PAGES; pages++) {
    const input = { cloudId: site.cloudId, jql: searchJql(at, now), maxResults: SEARCH_PAGE, fields: FIELDS, view: "evidence", ...(token === undefined ? {} : { nextPageToken: token }) }
    const { issues, next, last } = searchPage(await read(SEARCH_TOOL, input))
    let latest = Number.NEGATIVE_INFINITY
    let readable = 0
    for (const item of issues) {
      // A work item Jira sends without an id, a key or an update time cannot be placed: it is left out, not the read.
      const change = issueChange(alias, site, item)
      if (change === undefined) continue
      readable++
      latest = Math.max(latest, change.at.t)
      const kept = current.get(change.at.i)
      if (kept === undefined || kept.at.t < change.at.t) current.set(change.at.i, change)
    }
    if (issues.length > 0 && readable === 0) throw unreadable(SEARCH_TOOL)
    const listable = [...current.values()].filter((change) => isAfter(change.at, from) && change.at.t <= end)
    if (last || latest > end) {
      for (const change of listable) found.set(change.at.i, change)
      return { changes: sorted(), exhausted: true, boundary: Number.POSITIVE_INFINITY }
    }
    const complete = listable.filter((change) => change.at.t < latest)
    for (const change of complete) found.set(change.at.i, change)
    if (found.size >= need) return { changes: sorted(), exhausted: false, boundary: latest }
    const progress = complete.filter((change) => isAfter(change.at, at)).sort((a, b) => comparePositions(a.at, b.at)).at(-1)
    if (!walking && progress !== undefined) {
      at = progress.at
      current = new Map()
      token = undefined
      continue
    }
    walking = true
    if (next === undefined || next === token) break
    token = next
  }
  if (found.size > 0) return { changes: sorted(), exhausted: false, boundary: Math.max(...[...current.values()].map((change) => change.at.t)) }
  return { changes: [], exhausted: false, boundary: Number.POSITIVE_INFINITY, jammed: Math.max(from.t, ...[...current.values()].map((change) => change.at.t)) }
}

// ── The cursor ──────────────────────────────────────────────────────────

/** What a cursor is bound to: this plugin, its one source and the account alias. */
export const bindingOf = (alias: string): CursorBinding => ({ plugin: PLUGIN, source: SOURCE, account: alias })

/** The cursor's state: where a site seen for the first time starts, and each site's position. */
export interface CursorState {
  readonly start: number
  readonly sites: Map<string, Position>
}

const START_AGAIN = "Read again without a cursor, or with since, to start again."

/** The positions a cursor holds for `alias`: CURSOR_INVALID for anything that is not this source's bound cursor for it. */
export function stateOf(cursor: string, alias: string): CursorState {
  const decoded = decodeBoundCursor(bindingOf(alias), cursor)
  if (!decoded.ok) {
    throw fail(
      "CURSOR_INVALID",
      decoded.reason === "foreign" ? `The cursor belongs to another source, account or scope, not to ${alias}` : "The cursor is not one Jira's events_list issued",
      START_AGAIN,
    )
  }
  const state = decoded.state
  const start = state.f
  const raw = state.p
  if (typeof start !== "number" || !Number.isSafeInteger(start) || !isRecord(raw)) {
    throw fail("CURSOR_INVALID", "The cursor was not issued by Jira's events_list for this account", START_AGAIN)
  }
  const sites = new Map<string, Position>()
  for (const [cloudId, value] of Object.entries(raw)) {
    if (!CLOUD_ID.test(cloudId) || !Array.isArray(value) || value.length !== 2 || !Number.isSafeInteger(value[0]) || typeof value[1] !== "string" || value[1].length > 64) {
      throw fail("CURSOR_INVALID", "The cursor was not issued by Jira's events_list for this account", START_AGAIN)
    }
    sites.set(cloudId, { t: value[0] as number, i: value[1] })
  }
  return { start, sites }
}

function encodeState(alias: string, state: CursorState): string {
  const p = Object.fromEntries([...state.sites].sort(([a], [b]) => (a < b ? -1 : 1)).map(([cloudId, at]) => [cloudId, [at.t, at.i]]))
  return encodeBoundCursor(bindingOf(alias), { f: state.start, p })
}

// ── The listing ─────────────────────────────────────────────────────────

/** The request, or INPUT_INVALID naming each problem, or SOURCE_UNKNOWN. */
function eventsRequest(input: unknown) {
  const parsed = parseEventsListInput(input)
  if (!parsed.ok) {
    throw fail("INPUT_INVALID", `The events_list input is invalid: ${parsed.problems.join("; ")}`, "Pass only since, cursor, limit (1 to 500) and source, as events_list's schema describes them.")
  }
  if (parsed.value.source !== undefined && parsed.value.source !== SOURCE) {
    throw fail("SOURCE_UNKNOWN", `This plugin lists only the source "${SOURCE}"`, `Leave "source" out, or pass "${SOURCE}".`)
  }
  return parsed.value
}

/**
 * Lists what changed in Jira for the signed-in person after the request's cursor, or since its `since` (24 hours ago by
 * default): one event per work item they are part of each time a read finds it updated, oldest first, at most `limit`,
 * on the sites this call reads. The cursor holds each site's last listed position, so a later call never skips or
 * repeats a work item, and an older cursor lists the same events again.
 */
export async function readActivity(read: Read, alias: string, input: unknown, now: number, site: string | undefined): Promise<EventsListResult> {
  const request = eventsRequest(input)
  const who = signedInOf(await read(IDENTITY_TOOL, {}))
  const start = request.since ?? now - FIRST_RUN_HOURS * 3_600_000
  const state: CursorState = request.cursor === undefined ? { start, sites: new Map() } : stateOf(request.cursor, alias)

  const sites = readSites(await read(SITES_TOOL, {}), alias, site)
  if (sites.length > MAX_SITES) {
    throw fail(
      "UNAVAILABLE",
      `The Atlassian sign-in reaches ${sites.length} Jira sites, more than the ${MAX_SITES} one cursor follows`,
      "Set options.accounts.<alias>.site to the one site to read, or read the others with searchJiraIssuesUsingJql.",
    )
  }
  const end = now - SETTLE_MS
  const need = request.limit + 1
  const reads: { site: Site; from: Position; result: SiteRead }[] = []
  for (const entry of sites) {
    const from = state.sites.get(entry.cloudId) ?? { t: state.start, i: "" }
    reads.push({ site: entry, from, result: await siteChanges(read, alias, entry, from, now, end, need) })
  }

  // Oldest first across the sites, up to the earliest time a site's read is incomplete, so no page lists a work item
  // newer than one a later page still has to list.
  const boundary = Math.min(...reads.map((entry) => entry.result.boundary))
  const merged = reads
    .flatMap((entry) => entry.result.changes)
    .filter((change) => change.at.t < boundary)
    .sort((a, b) => a.at.t - b.at.t || (a.site < b.site ? -1 : a.site > b.site ? 1 : 0) || comparePositions(a.at, b.at))
  const screened = screenEvents(merged.map((change) => change.event))
  const refusedIds = new Map(screened.refused.map((entry) => [entry.external_id, entry]))
  const fits = fitPage(screened.events, request.limit, 65_536)
  const listed: Change[] = []
  // Every site read keeps its position, a new one its start. A site missing from this answer keeps its position too, so
  // when it comes back nothing is listed again; only past MAX_SITES positions is the oldest unseen one dropped.
  const positions = new Map(reads.map((entry) => [entry.site.cloudId, entry.from]))
  for (const [cloudId, at] of state.sites) if (!positions.has(cloudId) && positions.size < MAX_SITES) positions.set(cloudId, at)
  // A site jammed by a burst moves on past it, and the page says what may be missing from where.
  const jammed = reads.filter((entry) => entry.result.jammed !== undefined)
  for (const entry of jammed) {
    const at = entry.result.jammed
    if (at !== undefined) positions.set(entry.site.cloudId, { t: at + JAM_STEP_MS, i: "" })
  }
  const gap = jammed.length === 0 ? undefined : { reason: "window-truncated" as const, since: new Date(Math.min(...jammed.map((entry) => entry.from.t))).toISOString() }
  let consumed = 0
  for (const change of merged) {
    const refused = refusedIds.has(change.event.external_id)
    if (!refused && listed.length === fits) break
    if (!refused) listed.push(change)
    positions.set(change.site, change.at)
    consumed++
  }
  const refused = merged.slice(0, consumed).flatMap((change) => refusedIds.get(change.event.external_id) ?? [])
  const more = consumed < merged.length || reads.some((entry) => !entry.result.exhausted)
  const cursor = encodeState(alias, { start: state.start, sites: positions })
  return eventsListResult({ source: SOURCE, account: alias, owner: who.owner }, listed.map((change) => change.event), cursor, more, {
    refused,
    ...(gap === undefined ? {} : { gap }),
    plugin: PACKAGE,
    asOf: new Date(now).toISOString(),
  })
}

// ── The probe ───────────────────────────────────────────────────────────

/**
 * `probe`: who is signed in on the alias, and nothing it reads. One `atlassianUserInfo` read, the source's one identity
 * operation; the owner id is `atlassian:` and the account id, the label their display name.
 */
export async function readProbe(read: Read, alias: string, input: unknown): Promise<ProbeResult> {
  if (input !== undefined && input !== null && !isRecord(input)) {
    throw fail("INPUT_INVALID", "The probe input is not an object", 'Pass an empty object, or only "source".')
  }
  const source = isRecord(input) ? input["source"] : undefined
  if (source !== undefined && source !== SOURCE) {
    throw fail("SOURCE_UNKNOWN", `This plugin lists only the source "${SOURCE}"`, `Leave "source" out, or pass "${SOURCE}".`)
  }
  const who = signedInOf(await read(IDENTITY_TOOL, {}), "probe")
  return probeResult({ source: SOURCE, account: alias, owner: who.owner })
}
