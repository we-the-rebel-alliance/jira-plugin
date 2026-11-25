// Account wiring: the mcp mechanism's one vendor server per alias, the alias profile's `site`, and the status signals
// read from each server's state.
//
// A user may already have an entry named `jira` (or `jira-<alias>`). When it points at Atlassian's endpoint with the
// `?tools=all` query it is adopted unchanged: the plugin adds nothing and never touches it. Any other entry is a
// conflict, and the plugin adds nothing for that alias. Of the user's entry only its `type` and `url` are read, never
// its headers.
import type { Plugin } from "@opencode/plugin"
import { accountsOf, registerAccounts, type AccountProfile, type AccountSignal } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { serverOf } from "@we-the-rebel-alliance/plugin-contract/access"
import type { Manifest } from "@we-the-rebel-alliance/plugin-contract/manifest"
import {
  conflictUrl,
  displayUrl,
  ENDPOINT,
  PLUGIN,
  sameServer,
  serverConfig,
  type ServerEntry,
} from "./provider/atlassian.ts"
import { safeReason } from "./redact.ts"

/** The markers that turn an expected skip (an adopted entry or a conflict) into a problem the plugin filters out. */
export const ADOPTED = "jira:account-adopted"
export const CONFLICT = "jira:account-conflict"

/** One MCP server as OpenCode reports it, and its state as the contract names it. */
export type ServerInfo = Awaited<ReturnType<Plugin.Context["mcp"]["list"]>>["data"][number]

/** The aliases and profiles the options declare, or why they cannot be read. */
export function accountPlan(manifest: Manifest, options: Readonly<Record<string, unknown>>) {
  return accountsOf(manifest, options)
}

/** The alias's MCP server name, through the contract's one derivation. */
export function serverName(alias: string, aliases: readonly string[]): string {
  const name = serverOf(PLUGIN, alias, aliases)
  if (!name.ok) throw new Error(`jira: ${name.problems.join("; ")}`)
  return name.value
}

/** Each alias's server name, in the options' order. */
export function serverNames(aliases: readonly string[]): ReadonlyMap<string, string> {
  return new Map(aliases.map((alias) => [alias, serverName(alias, aliases)]))
}

/** The `site` cloud id an alias's profile names, or undefined when it reads every site. */
export function siteOf(options: Readonly<Record<string, unknown>>, alias: string): string | undefined {
  const accounts = options.accounts
  if (typeof accounts !== "object" || accounts === null || Array.isArray(accounts)) return undefined
  const profile = (accounts as Record<string, unknown>)[alias]
  if (typeof profile !== "object" || profile === null || Array.isArray(profile)) return undefined
  const site = (profile as Record<string, unknown>).site
  return typeof site === "string" && site.trim() !== "" ? site.trim() : undefined
}

/**
 * What each alias's server entry is before the plugin registers anything: ours (no entry), the user's own at the same
 * address (adopted), or another server entirely (conflict). The transform replays on a config reload, so the map is
 * rewritten each time and stays current for the server factory that runs after it.
 */
export async function classifyServers(ctx: Pick<Plugin.Context, "mcp">, names: ReadonlyMap<string, string>, found: Map<string, ServerEntry>): Promise<void> {
  await ctx.mcp.transform((editor) => {
    for (const name of names.values()) {
      try {
        const existing = editor.get(name)
        if (existing === undefined) {
          found.set(name, { kind: "plugin" })
          continue
        }
        if (existing.type !== "remote") {
          found.set(name, { kind: "conflict", url: "a local command" })
          continue
        }
        found.set(name, sameServer(existing.url, ENDPOINT) ? { kind: "adopted", url: displayUrl(existing.url) } : { kind: "conflict", url: conflictUrl(existing.url, ENDPOINT) })
      } catch {
        // An entry the host will not read is not ours to call: leave it out and let status name the alias as unavailable.
        found.set(name, { kind: "conflict", url: "an unreadable entry" })
      }
    }
  })
}

/** What registering the accounts did, with the expected skips taken out of `problems`. */
export interface AccountsResult {
  readonly accounts: readonly { readonly alias: string; readonly name: string }[]
  readonly problems: readonly string[]
}

/**
 * Register one vendor MCP server per alias. An adopted entry stays as it is; a conflict adds nothing. Both are skipped
 * by refusing to set the entry, which `registerAccounts` records and this function removes from the problems the status
 * reports. The endpoint is named only in the provider's `serverConfig`.
 */
export async function registerJiraAccounts(
  ctx: Pick<Plugin.Context, "integration" | "mcp">,
  request: {
    readonly manifest: Manifest
    readonly options: Readonly<Record<string, unknown>>
    readonly servers: ReadonlyMap<string, ServerEntry>
  },
): Promise<AccountsResult> {
  const result = await registerAccounts(ctx, {
    manifest: request.manifest,
    options: request.options,
    server: (_account: AccountProfile, name: string) => {
      const entry = request.servers.get(name)
      if (entry?.kind === "conflict") throw new Error(`${CONFLICT} ${entry.url ?? "an unknown address"}`)
      if (entry?.kind === "adopted") throw new Error(`${ADOPTED} ${entry.url ?? "the same address"}`)
      return serverConfig()
    },
  })
  return {
    accounts: result.accounts,
    problems: result.problems.filter((problem) => !problem.includes(ADOPTED) && !problem.includes(CONFLICT)),
  }
}

/** The signal one alias's server state gives status, and the watcher: no server yet is a sign-in still to do. */
export function signalOf(state: ServerInfo["status"] | undefined): { readonly state: "ready" | "needs_sign_in" | "error"; readonly reason?: string } {
  if (state === undefined) return { state: "needs_sign_in" }
  if (state.status === "connected") return { state: "ready" }
  if (state.status === "needs_auth") return { state: "needs_sign_in" }
  if (state.status === "failed") return { state: "error", reason: `the MCP server failed: ${safeReason(state.error)}` }
  if (state.status === "disabled") return { state: "error", reason: "the MCP server is disabled" }
  return { state: "error", reason: "the MCP server is still connecting" }
}

/** Every alias's signal for status: its server's state, its conflict, and the owner a probe last read. */
export async function accountSignals(
  ctx: Pick<Plugin.Context["mcp"], "list">,
  aliases: readonly string[],
  names: ReadonlyMap<string, string>,
  servers: ReadonlyMap<string, ServerEntry>,
  owners: { get(alias: string): { readonly id: string; readonly label: string } | undefined },
): Promise<Record<string, AccountSignal>> {
  const list = await ctx.list().catch(() => undefined)
  const signals: Record<string, AccountSignal> = {}
  for (const alias of aliases) {
    const name = names.get(alias) ?? alias
    const entry = servers.get(name)
    const state = entry?.kind === "conflict" ? { state: "error" as const, reason: `mcp.servers.${name} is set to another address (${entry.url ?? "an unknown address"})` } : signalOf(list?.data.find((server: ServerInfo) => server.name === name)?.status)
    const owner = owners.get(alias)
    signals[alias] = { ...state, ...(owner === undefined ? {} : { owner }) }
  }
  return signals
}
