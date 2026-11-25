import type { HandlerTable, MethodHandler } from "@we-the-rebel-alliance/plugin-contract/register"
import { eventsHandler } from "./events.ts"
import { probeHandler } from "./probe.ts"
import { statusHandler } from "./status.ts"
import type { HandlerDeps } from "./deps.ts"

export type { HandlerDeps } from "./deps.ts"

/** The plugin's own methods, all required: the register refuses a declared method with no handler. */
export interface JiraHandlers extends HandlerTable {
  readonly status: MethodHandler
  readonly probe: MethodHandler
  readonly events_list: MethodHandler
}

/** The plugin's one handler table: `status`, `probe` and `events_list`. Pass-through MCP tools have no handler. */
export function createHandlers(deps: HandlerDeps): JiraHandlers {
  return {
    status: statusHandler(deps),
    probe: probeHandler(deps),
    events_list: eventsHandler(deps),
  }
}
