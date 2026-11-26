import { STATUS_SCHEMA } from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { MethodCall } from "@we-the-rebel-alliance/plugin-contract/register"
import { buildStatus } from "../status.ts"
import { EMPTY_INPUT, type HandlerDeps } from "./deps.ts"

/**
 * `status`: the whole answer from what the handler knows. It reads each alias's MCP server state, never the provider's
 * content, and reports the owner a probe last read. The agents come from `call.unguardedAgents()`, whose result (agents
 * or an error) `statusAnswer` turns into the answer.
 */
export function statusHandler(deps: HandlerDeps) {
  return {
    description: "Read Jira's plugin state, its host range, every account alias and the one next step.",
    input: EMPTY_INPUT,
    output: STATUS_SCHEMA,
    async run(_input: unknown, call: MethodCall) {
      return buildStatus(deps, await call.unguardedAgents())
    },
  }
}
