// Item 0c: a plugin that loads its tools and skills but never registers its MCP server looks healthy and is useless.
// On the real 2.4.1 host, a default plugin must register `jira`, and a two-account plugin must register one server per
// alias. The connection status may be needs_auth/pending/failed against the real endpoint; presence and name are the
// assertion.
import "./isolate.ts"
import { describe, expect, test } from "vitest"
import { startSdkHost } from "./sdk-host.ts"

type Host = Awaited<ReturnType<typeof startSdkHost>>

async function serverNames(host: Host): Promise<string[]> {
  const { data } = await host.client.mcp.list({ location: host.location })
  return data
    .map((server: { name: string }) => server.name)
    .filter((name: string) => name === "jira" || name.startsWith("jira-"))
    .sort()
}

describe("MCP server registration on the real 2.4.1 host", () => {
  test(
    "the default account registers jira",
    { timeout: 120_000 },
    async () => {
      const host = await startSdkHost({})
      try {
        expect(await serverNames(host)).toEqual(["jira"])
      } finally {
        await host.close()
      }
    },
  )

  test(
    "two accounts register jira-work and jira-personal",
    { timeout: 120_000 },
    async () => {
      const host = await startSdkHost({}, { accounts: { work: {}, personal: {} } })
      try {
        expect(await serverNames(host)).toEqual(["jira-personal", "jira-work"])
      } finally {
        await host.close()
      }
    },
  )
})
