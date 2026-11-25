// The one provider client: every Jira call runs through OpenCode's own executor for an MCP tool of the account's
// server. The plugin holds no credential, and this module is the only place the Atlassian endpoint is named.
//
// One vendor MCP server per alias (`jira`, `jira-work`, …): the alias selects the server, and OpenCode keys that
// server's OAuth separately. A call names the vendor tool (such as `searchJiraIssuesUsingJql`) and the provider
// derives the host's tool id from the server name with the contract's `toolAction`, never by hand.
import type { Plugin } from "@opencode/plugin"
import { serverOf, toolAction } from "@we-the-rebel-alliance/plugin-contract/access"
import type { ErrorCode } from "@we-the-rebel-alliance/plugin-contract/events"
import { safeReason, upstreamText } from "../redact.ts"

/** The plugin's name, as contract §3 derives it, and the vendor's endpoint. */
export const PLUGIN = "jira"
export const ENDPOINT = "https://mcp.atlassian.com/v2/mcp?tools=all"
/**
 * The scopes the sign-in asks for: the plugin's second deny list. Atlassian's 401 names no scope and its protected
 * resource metadata lists every scope it offers, including delete and administration; without this pin OpenCode would
 * request all of them, and the grant itself would cover deletes and project settings. Pinned, the sign-in is Jira read,
 * write and search, and Atlassian loads no delete or project-setting tool at all.
 */
export const OAUTH_SCOPE =
  "read:me read:account offline_access read:jira:agent-interface write:jira:agent-interface search:jira:agent-interface"

/** A remote MCP server config, as `ctx.mcp.transform` takes it. The scope is pinned for every alias. */
export function serverConfig() {
  return { type: "remote" as const, url: ENDPOINT, oauth: { scope: OAUTH_SCOPE } }
}

const parsed = (url: string) => {
  try {
    return new URL(url)
  } catch {
    return undefined
  }
}

const pathOf = (url: URL) => url.pathname.replace(/\/+$/, "")
/** A query as a comparable string; an absent query and an empty one are the same. */
const queryOf = (url: URL) => new URLSearchParams([...url.searchParams].sort(([a], [b]) => a.localeCompare(b))).toString()

/** The query this server's identity rests on: `tools=all` makes the vendor send one named tool per Jira tool. */
const TOOL_LIST_QUERY = "tools=all"

/**
 * Origin, path and query: the same server. A trailing slash still matches, and so does a reordered query; a missing or
 * different `?tools=all` does not, because that is another server's tool list.
 */
export function sameServer(url: string, expected: string): boolean {
  const left = parsed(url)
  const right = parsed(expected)
  return left !== undefined && right !== undefined && left.origin === right.origin && pathOf(left) === pathOf(right) && queryOf(left) === queryOf(right)
}

/**
 * A server's address for status: origin and path, and the query only when it is the one this server's identity rests
 * on. Any other query can hold a token, so it never reaches status.
 */
export function displayUrl(url: string): string {
  const target = parsed(url)
  if (target === undefined) return "an invalid URL"
  const base = `${target.origin}${pathOf(target)}`
  return queryOf(target) === TOOL_LIST_QUERY ? `${base}?${TOOL_LIST_QUERY}` : base
}

/**
 * A conflicting server's address for status. Another origin shows only its origin, because its path can hold a secret,
 * as some servers' URLs do. Atlassian's own origin keeps its path and its `?tools=all`, so a wrong path or a missing
 * query there is visible.
 */
export function conflictUrl(url: string, expected: string): string {
  const target = parsed(url)
  const expectedUrl = parsed(expected)
  if (target === undefined || expectedUrl === undefined) return "an invalid URL"
  if (target.origin === expectedUrl.origin) return displayUrl(url)
  return pathOf(target) === "" ? target.origin : `${target.origin}/…`
}

/** A flight of the failure that stops a read; the handler maps it to the contract's refusal. */
export class ProviderError extends Error {
  readonly code: ErrorCode
  readonly next: string
  constructor(code: ErrorCode, what: string, next: string) {
    super(what)
    this.name = "ProviderError"
    this.code = code
    this.next = next
  }
}

/** What an alias's server entry is: ours, the user's own at the same address (adopted), or another server entirely. */
export interface ServerEntry {
  readonly kind: "plugin" | "adopted" | "conflict"
  readonly url?: string
}

export interface ProviderOptions {
  /** The declared aliases, in the options' order. */
  readonly aliases: readonly string[]
  /** Each alias server's entry, keyed by the server name, as the setup found it. */
  readonly servers: ReadonlyMap<string, ServerEntry>
}

/** One tool executor and the context a host tool waits for. Both are structural: the provider never imports host code. */
export type ToolExecutor = Awaited<ReturnType<Plugin.Context["tool"]["list"]>>[number]
export type ExecutorContext = Parameters<ToolExecutor["execute"]>[1]

/** The provider the handlers call: one aliased read, and the alias server's state for refusals. */
export interface Provider {
  /** Read one vendor tool through the alias's MCP server, with the caller's session and signal. */
  call(alias: string, tool: string, input: Readonly<Record<string, unknown>>, context: ExecutorContext): Promise<unknown>
  /** The MCP server's state as OpenCode reports it, or undefined when no server has that name. */
  serverState(alias: string): Promise<{ readonly status: string; readonly error?: string } | undefined>
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

const RATE_LIMIT = /rate.?limit|too many requests|\b429\b/i

/** The server name of an alias, through the contract's one derivation. */
export function serverName(alias: string, aliases: readonly string[]): string {
  const name = serverOf(PLUGIN, alias, aliases)
  if (!name.ok) throw new Error(`jira: ${name.problems.join("; ")}`)
  return name.value
}

/** The text an MCP result carries, when the server answered JSON as text instead of structured content. */
function resultJson(result: unknown, tool: string): unknown {
  const value = isRecord(result) ? result : {}
  if (isRecord(value.output) || Array.isArray(value.output)) return value.output
  const content = typeof value.content === "string"
    ? value.content
    : Array.isArray(value.content)
      ? value.content.flatMap((part) => (isRecord(part) && part.type === "text" && typeof part.text === "string" ? [part.text] : [])).join("\n")
      : ""
  const text = typeof value.output === "string" ? value.output : content
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ProviderError("UNAVAILABLE", `Atlassian's ${tool} answered in a shape this plugin cannot read`, "Call the tool directly to see Atlassian's answer, and run /jira.")
  }
}

export function createProvider(ctx: Pick<Plugin.Context, "tool" | "mcp">, options: ProviderOptions): Provider {
  const state = async (alias: string) => {
    const name = serverName(alias, options.aliases)
    const servers = await ctx.mcp.list().catch(() => undefined)
    const entry = servers?.data.find((server) => server.name === name)
    if (entry === undefined) return undefined
    const status = entry.status
    return { status: status.status, ...("error" in status && typeof status.error === "string" ? { error: status.error } : {}) }
  }

  /** Why a tool of this alias cannot be called now, as the contract's code and a next step. */
  const cannotCall = async (alias: string, tool: string): Promise<ProviderError> => {
    const name = serverName(alias, options.aliases)
    const entry = options.servers.get(name)
    if (entry?.kind === "conflict") {
      return new ProviderError(
        "UNAVAILABLE",
        `The ${name} MCP server is set to another address (${entry.url ?? "an unknown address"}), so this plugin does not call it`,
        `Set mcp.servers.${name} to Atlassian's Jira server, or remove it, then reload OpenCode.`,
      )
    }
    const found = await state(alias)
    if (found === undefined) {
      return new ProviderError("UNAVAILABLE", `The ${name} MCP server is not registered`, "Reload OpenCode, then run /jira.")
    }
    if (found.status === "needs_auth") {
      return new ProviderError("NEEDS_SIGN_IN", `The ${name} MCP server needs a sign-in before ${tool} can run`, `Run /connect and choose Jira (${alias}), then call it again.`)
    }
    if (found.status === "connected") {
      return new ProviderError(
        "UNAVAILABLE",
        `The ${name} MCP server is connected and OpenCode does not list ${tool} for it`,
        `The sign-in may not grant that tool; sign in again as ${alias}, or use a method this account may read, then run /jira.`,
      )
    }
    const why = found.status === "pending" ? "is still connecting" : found.status === "disabled" ? "is disabled" : `failed (${safeReason(found.error ?? "no reason given")})`
    return new ProviderError("UNAVAILABLE", `The ${name} MCP server ${why}`, "Run /jira, follow its next step, then call it again.")
  }

  return {
    async call(alias, tool, input, context) {
      context.signal.throwIfAborted()
      const name = serverName(alias, options.aliases)
      if (options.servers.get(name)?.kind === "conflict") throw await cannotCall(alias, tool)
      const id = toolAction(name, tool)
      const executor = (await ctx.tool.list()).find((entry) => entry.id === id)
      if (executor === undefined) throw await cannotCall(alias, tool)
      let result: Awaited<ReturnType<ToolExecutor["execute"]>>
      try {
        result = await executor.execute(input as never, context)
      } catch (error) {
        if (context.signal.aborted) throw error
        if (error instanceof Error && error.message.startsWith(`MCP server "${name}" `)) throw await cannotCall(alias, tool)
        // OpenCode's Tool.Error for a call the vendor refused (MCP isError) has no cause; a refused permission check has one.
        if (isRecord(error) && error._tag === "Tool.Error" && error.error === undefined) {
          const reason = upstreamText(String(error.message ?? ""))
          if (RATE_LIMIT.test(reason)) {
            throw new ProviderError("RATE_LIMITED", `Atlassian's ${tool} is rate-limited: ${reason}`, "Wait a minute, then call it again with the same cursor.")
          }
          throw new ProviderError("UNAVAILABLE", `Atlassian's ${tool} failed: ${reason}`, "Run /jira, then call it again.")
        }
        throw error
      }
      return resultJson(result, tool)
    },

    serverState: state,
  }
}
