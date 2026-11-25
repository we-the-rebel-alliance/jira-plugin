import type { Plugin } from "@opencode/plugin"
import { signalOf } from "./accounts.ts"

/** The state the `account` bus event carries: the contract's three account states. */
export type AccountState = "ready" | "needs_sign_in" | "error"

/** How setup emits an account nudge: `registration.bus.emit`, so a lost nudge never throws into the watcher. */
export type AccountEmit = (event: "account", data: { readonly account: string; readonly state: AccountState }) => Promise<unknown>

export interface WatchOptions {
  readonly aliases: readonly string[]
  readonly names: ReadonlyMap<string, string>
  /** How long to wait before subscribing again when the stream ends; tests shorten it. */
  readonly resubscribeMs?: number
}

const defaultPause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal.removeEventListener("abort", done)
      resolve()
    }
    signal.addEventListener("abort", done, { once: true })
  })

/**
 * Emits `account` when an alias's MCP server changes state: the server's name is the alias's (contract §3), so the
 * event is the person's sign-in nudge. It never emits `changed`: every write is the vendor's own pass-through tool and
 * this plugin cannot see it. A repeated state is not emitted again. Returns a cleanup that stops the subscription.
 */
export function watchAccountStatus(ctx: Pick<Plugin.Context, "event" | "mcp">, emit: AccountEmit, options: WatchOptions) {
  const byServer = new Map([...options.names].map(([alias, name]) => [name, alias]))
  const last = new Map<string, AccountState>()
  const stopped = new AbortController()

  const run = (async () => {
    while (!stopped.signal.aborted) {
      try {
        for await (const event of ctx.event.subscribe({ types: ["mcp.status.changed"], signal: stopped.signal })) {
          if (stopped.signal.aborted) break
          if (event.type !== "mcp.status.changed") continue
          const alias = byServer.get(event.data.server)
          if (alias === undefined) continue
          let list: Awaited<ReturnType<typeof ctx.mcp.list>>
          try {
            list = await ctx.mcp.list()
          } catch {
            // A list that cannot be read says nothing about the account: no nudge, and never a false sign-out.
            continue
          }
          const entry = list.data.find((server) => server.name === event.data.server)
          if (entry === undefined) continue
          const state = signalOf(entry.status).state
          if (last.get(alias) === state) continue
          last.set(alias, state)
          await emit("account", { account: alias, state }).catch(() => undefined)
        }
      } catch {
        // The stream failed; subscribe again.
      }
      if (!stopped.signal.aborted) await defaultPause(options.resubscribeMs ?? 1_000, stopped.signal)
    }
  })()

  return {
    stop: async () => {
      stopped.abort()
      await run
    },
  }
}
