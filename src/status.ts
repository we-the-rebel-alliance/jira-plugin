import { accountStatuses, statusAnswer, type StatusAnswer } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { accountSignals } from "./accounts.ts"
import { safeReason } from "./redact.ts"
import type { HandlerDeps } from "./handlers/deps.ts"

/** The agent question's answer, with the reason when the host could not read the list. */
export interface AgentsAnswer {
  readonly agents: readonly string[]
  readonly problem?: string
}

/**
 * The one assembly of the `status` answer: each alias's server signal, the owner a probe last read, the account problems
 * and the agents whose rules no longer apply. The handler passes `call.unguardedAgents()`'s answer; the `/jira` command
 * asks the same question through the host. Nothing here calls the provider for content.
 */
export async function buildStatus(deps: HandlerDeps, agents: AgentsAnswer): Promise<StatusAnswer> {
  const signals = await accountSignals(deps.mcp, deps.aliases, deps.names, deps.servers, deps.owners)
  const problems = [...deps.problems(), ...(agents.problem === undefined ? [] : [agents.problem])].map((problem) => safeReason(problem, 200))
  return statusAnswer({
    manifest: deps.manifest,
    version: deps.version,
    hostVersion: deps.hostVersion,
    accounts: accountStatuses(deps.profiles, signals),
    problems,
    unguardedAgents: agents.agents,
  })
}
