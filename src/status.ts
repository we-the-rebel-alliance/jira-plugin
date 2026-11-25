import { accountStatuses, statusAnswer, type StatusAnswer } from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { UnguardedAgentsResult } from "@we-the-rebel-alliance/plugin-contract/access"
import { accountSignals } from "./accounts.ts"
import type { HandlerDeps } from "./handlers/deps.ts"
import { safeReason } from "./redact.ts"

/**
 * The one assembly of the `status` answer: each alias's server signal, the owner a probe last read, the account problems
 * and what `call.unguardedAgents()` answered. The handler passes that answer straight through; `statusAnswer` appends a
 * failed agent list to `problems` and writes an empty list. Nothing here calls the provider for content.
 */
export async function buildStatus(deps: HandlerDeps, unguardedAgents: UnguardedAgentsResult): Promise<StatusAnswer> {
  const { signals, problem } = await accountSignals(deps.mcp, deps.aliases, deps.names, deps.servers, deps.owners)
  const problems = [...deps.problems(), ...(problem === undefined ? [] : [problem])].map((entry) => safeReason(entry, 200))
  return statusAnswer({
    manifest: deps.manifest,
    version: deps.version,
    hostVersion: deps.hostVersion,
    accounts: accountStatuses(deps.profiles, signals),
    problems,
    unguardedAgents,
  })
}
