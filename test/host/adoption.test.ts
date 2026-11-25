// The real 2.4.1 host with a person's own `mcp.servers.jira`: the plugin adopts an entry at Atlassian's endpoint and
// refuses another address, and neither status nor an answer ever carries the entry's header token.
import "./isolate.ts"
import { describe, expect, test } from "vitest"
import { startSdkHost } from "./sdk-host.ts"

type Host = Awaited<ReturnType<typeof startSdkHost>>
type Status = { readonly state?: string; readonly accounts?: readonly { alias: string }[]; readonly nextStep?: unknown }

async function status(host: Host): Promise<Status> {
  const sessionID = (await host.client.sessions.create({ agent: "build", location: host.location })).id
  const answer = await host.client.rpc.call({ rpcID: "jira", method: "status", location: host.location, input: { sessionID, input: {} } })
  expect(answer.output, "status answered no output").toBeDefined()
  return answer.output as Status
}

const SECRET = ["header", "secret", "token"].join("-")

describe("a person's own mcp.servers.jira entry on the real 2.4.1 host", () => {
  test(
    "is adopted at Atlassian's endpoint, and its header never appears",
    { timeout: 120_000 },
    async () => {
      const host = await startSdkHost({
        mcp: {
          servers: {
            jira: {
              type: "remote",
              url: "https://mcp.atlassian.com/v2/mcp?tools=all",
              oauth: false,
              headers: { Authorization: `Bearer ${SECRET}` },
            },
          },
        },
      })
      try {
        const answer = await status(host)
        const text = JSON.stringify(answer)
        expect(text).not.toContain(SECRET)
        expect(text).not.toContain("Bearer")
        expect(answer.accounts?.map((account) => account.alias)).toContain("default")
        expect(String(answer.nextStep ?? "")).not.toContain("another address")
      } finally {
        await host.close()
      }
    },
  )

  test(
    "at another address is a conflict, and its address and header never appear",
    { timeout: 120_000 },
    async () => {
      const host = await startSdkHost({
        mcp: {
          servers: {
            jira: {
              type: "remote",
              url: "https://elsewhere.example.com/mcp?token=topsecret",
              oauth: false,
              headers: { Authorization: `Bearer ${SECRET}` },
            },
          },
        },
      })
      try {
        const answer = await status(host)
        const text = JSON.stringify(answer)
        expect(text).not.toContain(SECRET)
        expect(text).not.toContain("topsecret")
        expect(text).not.toContain("Bearer")
        expect(answer.state).toBe("error")
        expect(String(answer.nextStep ?? "")).toContain("another address")
      } finally {
        await host.close()
      }
    },
  )
})
