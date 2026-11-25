import { STATUS_SCHEMA } from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { MethodCall } from "@we-the-rebel-alliance/plugin-contract/register"
import { buildStatus } from "../status.ts"
import { safeReason } from "../redact.ts"
import { EMPTY_INPUT, type HandlerDeps } from "./deps.ts"

/**
 * The agents whose rules no longer give every generated rule its effect. The contract's freeze turns
 * `unguardedAgents()` into `{ ok, agents | error }`; only this function changes.
 */
export async function unguardedAgentsOf(call: MethodCall): Promise<{ readonly agents: readonly string[]; readonly problem?: string }> {
  try {
    return { agents: await call.unguardedAgents() }
  } catch (error) {
    // An unreadable agent list is unknown, never zero: status says error, with a redacted reason.
    return { agents: [], problem: `the agent list could not be read: ${safeReason(error)}` }
  }
}

/**
 * `status`: the whole answer from what the handler knows. It reads each alias's MCP server state, never the provider's
 * content, and reports the owner a probe last read. It keeps no state: the registration fills `call`, and
 * `statusAnswer` assembles the answer.
 */
export function statusHandler(deps: HandlerDeps) {
  return {
    description: "Read Jira's plugin state, its host range, every account alias and the one next step.",
    input: EMPTY_INPUT,
    output: STATUS_SCHEMA,
    async run(_input: unknown, call: MethodCall) {
      return buildStatus(deps, await unguardedAgentsOf(call))
    },
  }
}
