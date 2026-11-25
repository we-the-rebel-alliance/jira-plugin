// The real OpenCode 2.4.1 host, through the kit's harness: the built dist/ loads, the plugin's own methods are tools and
// RPC methods, and the two-account refusals and status answer hold on the real host.
import { fileURLToPath } from "node:url"
import { createHost } from "@we-the-rebel-alliance/plugin-contract/kit"
import { describe, expect, test } from "vitest"

const root = fileURLToPath(new URL("../..", import.meta.url))

describe("the built plugin on OpenCode 2.4.1", () => {
  test(
    "loads, refuses a missing and an unknown account, and answers a valid status",
    { timeout: 120_000 },
    async () => {
      const run = await createHost({
        directory: root,
        version: "2.4.1",
        pluginId: "jira",
        options: { access: "all", accounts: { work: {}, personal: {} } },
      })
      try {
        expect(run.failure).toBeUndefined()
        expect(run.refusal).toBeUndefined()
        expect(run.definition?.id).toBe("jira")
        expect(run.tools.map((tool) => tool.id).sort()).toEqual(["jira_events_list", "jira_probe", "jira_status"])
        expect([...(run.rpc?.methods ?? [])].sort()).toEqual(["events_list", "probe", "status"])
        expect(run.rpc?.events).toEqual(["account"])

        const missing = await run.call("events_list", {})
        expect(missing).toMatchObject({ ok: false, code: "ACCOUNT_REQUIRED" })

        const unknown = await run.call("events_list", { account: "nobodyhere" })
        expect(unknown).toMatchObject({ ok: false, code: "ACCOUNT_UNKNOWN" })

        const answer = await run.call("status", {})
        expect(answer.ok).toBe(true)
        if (!answer.ok) return
        expect(answer.output).toMatchObject({
          name: "jira",
          version: "0.0.0",
          host: { version: "2.4.1", range: ">=2.4.1 <2.5.0", tested: ["2.4.1"] },
          unguardedAgents: [],
        })
        expect((answer.output as { accounts: { alias: string }[] }).accounts.map((account) => account.alias)).toEqual(["work", "personal"])
      } finally {
        await run.close()
      }
    },
  )
})
