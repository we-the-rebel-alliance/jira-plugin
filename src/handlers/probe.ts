import { PROBE_SCHEMA } from "@we-the-rebel-alliance/plugin-contract/events"
import type { MethodCall } from "@we-the-rebel-alliance/plugin-contract/register"
import { readProbe } from "../provider/activity.ts"
import { refusalFor } from "../errors.ts"
import { type HandlerDeps, readerFor } from "./deps.ts"

const PROBE_INPUT = {
  type: "object",
  properties: {
    source: { type: "string", description: 'The source to probe: "jira", the only one' },
  },
  additionalProperties: false,
} as const

const DESCRIPTION =
  "For a consumer binding Jira's activity source, not for answering questions: who is signed in on the account, from one " +
  "atlassianUserInfo read, and nothing else. Pass account (the alias) when the plugin serves several."

/** `probe`: the signed-in owner of an alias, read through that alias's MCP server. */
export function probeHandler(deps: HandlerDeps) {
  return {
    description: DESCRIPTION,
    input: PROBE_INPUT,
    output: PROBE_SCHEMA,
    async run(input: Readonly<Record<string, unknown>>, call: MethodCall) {
      try {
        const answer = await readProbe(readerFor(deps, call), call.account, input)
        deps.owners.set(call.account, answer.owner)
        return answer
      } catch (error) {
        throw refusalFor(error, "probe", "Sign the account in again, then probe it.")
      }
    },
  }
}
