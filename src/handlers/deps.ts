import type { Plugin } from "@opencode/plugin"
import type { AccountProfile } from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { Manifest } from "@we-the-rebel-alliance/plugin-contract/manifest"
import type { ExecutorContext, Provider, ServerEntry } from "../provider/atlassian.ts"
import type { MethodCall } from "@we-the-rebel-alliance/plugin-contract/register"
import type { OwnerCache } from "../owners.ts"

/** What the handler table is built from, all resolved in setup. Nothing is filled after `register` returns. */
export interface HandlerDeps {
  readonly manifest: Manifest
  readonly version: string
  readonly hostVersion: string
  readonly profiles: readonly AccountProfile[]
  readonly aliases: readonly string[]
  readonly names: ReadonlyMap<string, string>
  readonly servers: ReadonlyMap<string, ServerEntry>
  readonly options: Readonly<Record<string, unknown>>
  readonly provider: Provider
  readonly owners: OwnerCache
  readonly mcp: Pick<Plugin.Context["mcp"], "list">
  /** Why registering the accounts was not complete; status names it. */
  readonly problems: () => readonly string[]
  /** The clock; tests fix it. */
  readonly now: () => number
}

/** One read of a vendor tool for the call's alias. */
export type Read = (tool: string, input: Readonly<Record<string, unknown>>) => Promise<unknown>

export function readerFor(deps: HandlerDeps, call: MethodCall): Read {
  return (tool, input) => deps.provider.call(call.account, tool, input, call as unknown as ExecutorContext)
}

/** A method's input with no fields: `status` takes nothing. */
export const EMPTY_INPUT = { type: "object", properties: {}, additionalProperties: false } as const
