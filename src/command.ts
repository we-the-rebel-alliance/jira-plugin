import type { Plugin } from "@opencode/plugin"
import { unguardedAgents, type PermissionRule } from "@we-the-rebel-alliance/plugin-contract/access"
import type { StatusAnswer } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { safeReason } from "./redact.ts"
import type { AgentsAnswer } from "./status.ts"

/**
 * The agents whose rules no longer give every generated rule its effect, asked through the host for the `/jira` command.
 * The status handler asks the same question through `call.unguardedAgents()`; only the question's source differs.
 */
export async function agentsFromHost(ctx: Pick<Plugin.Context, "agent">, rules: readonly PermissionRule[]): Promise<AgentsAnswer> {
  try {
    return { agents: unguardedAgents((await ctx.agent.list()).data, rules) }
  } catch (error) {
    // An unreadable agent list is unknown, never zero.
    return { agents: [], problem: `the agent list could not be read: ${safeReason(error)}` }
  }
}

/** The status answer as `/jira` prints it: states and the one next step, never provider content. */
export function formatStatus(answer: StatusAnswer): string {
  const lines = [
    `Jira ${answer.version} on OpenCode ${answer.host.version} (${answer.host.range}).`,
    `State: ${answer.state}.`,
  ]
  for (const account of answer.accounts) lines.push(`- ${account.alias}: ${account.state}${account.reason === undefined ? "" : ` (${account.reason})`}`)
  lines.push(answer.unguardedAgents.length === 0 ? "Agents without the access rules: none." : `Agents without the access rules: ${answer.unguardedAgents.join(", ")}.`)
  lines.push(answer.nextStep === null ? "Next step: nothing to do." : `Next step: ${answer.nextStep}`)
  return lines.join("\n")
}

/** `/jira`: the same status answer the `status` method gives, in one message in the current session. */
export function registerJiraCommand(
  ctx: { readonly command: Pick<Plugin.Context["command"], "transform">; readonly session: Pick<Plugin.Context["session"], "synthetic"> },
  read: () => Promise<StatusAnswer>,
) {
  return ctx.command.transform((editor) => {
    editor.add({
      name: "jira",
      description: "Show Jira's state, every account alias and the next step",
      async execute({ sessionID }) {
        const text = await read().then(
          formatStatus,
          (error: unknown) => `UNAVAILABLE: Jira's status could not be read (${safeReason(error)}). Next step: read the status method.`,
        )
        await ctx.session.synthetic({ sessionID, text, description: "Jira status", resume: false })
      },
    })
  })
}
