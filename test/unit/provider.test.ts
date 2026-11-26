import type { Plugin } from "@opencode/plugin"
import { describe, expect, test } from "vitest"
import { conflictUrl, createProvider, displayUrl, ENDPOINT, ProviderError, sameServer, serverConfig, serverName, type ServerEntry } from "../../src/provider/atlassian.ts"
import { FakeJira } from "../support/fake-jira.ts"

const servers = (entry?: ServerEntry) =>
  new Map<string, ServerEntry>([
    ["jira-work", entry ?? { kind: "plugin" }],
    ["jira-personal", { kind: "plugin" }],
  ])

function provider(tools: { id: string; execute: (input: unknown, context: never) => Promise<unknown> }[], mcp: FakeJira, entry?: ServerEntry) {
  const ctx = {
    tool: { list: async () => tools },
    mcp: { list: async () => mcp.mcpList() },
  } as unknown as Pick<Plugin.Context, "tool" | "mcp">
  return createProvider(ctx, { aliases: ["work", "personal"], servers: servers(entry) })
}

const call = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({ sessionID: "ses_test", agent: "build", messageID: "msg_test", id: "call_test", signal: new AbortController().signal, progress: async () => {}, ...overrides }) as never

describe("the server name per alias", () => {
  test("default is jira, another alias is jira-<alias>", () => {
    expect(serverName("default", ["default"])).toBe("jira")
    expect(serverName("work", ["work", "personal"])).toBe("jira-work")
    expect(() => serverName("nobodyhere", ["work", "personal"])).toThrow(/is not one this plugin declares/)
  })

  test("the endpoint is named once and the sign-in asks the pinned scope", () => {
    expect(ENDPOINT).toBe("https://mcp.atlassian.com/v2/mcp?tools=all")
    const config = serverConfig() as { type: string; url: string; oauth: { scope: string } }
    expect(config.url).toBe(ENDPOINT)
    expect(config.oauth.scope.split(" ")).toEqual([
      "read:me",
      "read:account",
      "offline_access",
      "read:jira:agent-interface",
      "write:jira:agent-interface",
      "search:jira:agent-interface",
    ])
  })
})

describe("adopting or refusing a user's own server entry", () => {
  test("the same URL, with a trailing slash and a reordered query, is the same server", () => {
    expect(sameServer(ENDPOINT, ENDPOINT)).toBe(true)
    expect(sameServer("https://mcp.atlassian.com/v2/mcp/?x=1&tools=all", ENDPOINT)).toBe(false)
    expect(sameServer("https://mcp.atlassian.com/v2/mcp?tools=all&x=1", ENDPOINT)).toBe(false)
    expect(sameServer("https://mcp.atlassian.com/v2/mcp", ENDPOINT)).toBe(false)
  })

  test("status shows a token-free address", () => {
    expect(displayUrl("https://mcp.atlassian.com/v2/mcp?token=secret&tools=all")).toBe("https://mcp.atlassian.com/v2/mcp")
    expect(conflictUrl("https://elsewhere.example.com/a/secret?token=x", ENDPOINT)).toBe("https://elsewhere.example.com/…")
    expect(conflictUrl("https://mcp.atlassian.com/v2/mcp?tools=all", ENDPOINT)).toBe("https://mcp.atlassian.com/v2/mcp?tools=all")
  })
})

describe("calling a vendor tool through an alias's server", () => {
  test("work and personal map to their own server's executor", async () => {
    const seen: string[] = []
    const tools = ["jira-work_getJiraIssue", "jira-personal_getJiraIssue"].map((id) => ({
      id,
      execute: async () => {
        seen.push(id)
        return { output: { key: "OPS-42" } }
      },
    }))
    const providerUnderTest = provider(tools, new FakeJira())
    await expect(providerUnderTest.call("work", "getJiraIssue", { cloudId: "cloud-work-1", issueIdOrKey: "OPS-42" }, call())).resolves.toEqual({ key: "OPS-42" })
    await expect(providerUnderTest.call("personal", "getJiraIssue", {}, call())).resolves.toEqual({ key: "OPS-42" })
    expect(seen).toEqual(["jira-work_getJiraIssue", "jira-personal_getJiraIssue"])
  })

  test("a JSON answer sent as text is read", async () => {
    const tools = [{ id: "jira-work_atlassianUserInfo", execute: async () => ({ content: [{ type: "text", text: '{"accountId":"acc-work-ana"}' }] }) }]
    await expect(provider(tools, new FakeJira()).call("work", "atlassianUserInfo", {}, call())).resolves.toEqual({ accountId: "acc-work-ana" })
  })

  test("a connected server that does not list the tool is UNAVAILABLE", async () => {
    const error = await provider([], new FakeJira()).call("work", "getJiraIssue", {}, call()).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(ProviderError)
    expect((error as ProviderError).code).toBe("UNAVAILABLE")
    expect((error as ProviderError).message).toContain("does not list getJiraIssue")
  })

  test("a server that needs a sign-in is NEEDS_SIGN_IN", async () => {
    const fake = new FakeJira()
    const ctx = { tool: { list: async () => [] }, mcp: { list: async () => fake.mcpList({ work: "needs_auth" }) } } as unknown as Pick<Plugin.Context, "tool" | "mcp">
    const providerUnderTest = createProvider(ctx, { aliases: ["work", "personal"], servers: servers() })
    const error = await providerUnderTest.call("work", "getJiraIssue", {}, call()).catch((cause: unknown) => cause)
    expect((error as ProviderError).code).toBe("NEEDS_SIGN_IN")
    expect((error as ProviderError).next).toContain("/connect")
  })

  test("a conflicting entry is refused before any executor is called", async () => {
    const seen: string[] = []
    const tools = [
      {
        id: "jira-work_getJiraIssue",
        execute: async () => {
          seen.push("called")
          return { output: {} }
        },
      },
    ]
    const providerUnderTest = provider(tools, new FakeJira(), { kind: "conflict", url: "https://elsewhere.example.com/…" })
    const error = await providerUnderTest.call("work", "getJiraIssue", {}, call()).catch((cause: unknown) => cause)
    expect((error as ProviderError).code).toBe("UNAVAILABLE")
    expect((error as ProviderError).message).toContain("another address")
    expect(seen).toEqual([])
  })

  test("the vendor's rate limit is RATE_LIMITED", async () => {
    const tools = [
      {
        id: "jira-work_searchJiraIssuesUsingJql",
        execute: async () => {
          throw Object.assign(new Error("429 too many requests"), { _tag: "Tool.Error" })
        },
      },
    ]
    const error = await provider(tools, new FakeJira()).call("work", "searchJiraIssuesUsingJql", {}, call()).catch((cause: unknown) => cause)
    expect((error as ProviderError).code).toBe("RATE_LIMITED")
  })

  test("an MCP server that is not registered is UNAVAILABLE", async () => {
    const _fake = new FakeJira()
    const ctx = { tool: { list: async () => [] }, mcp: { list: async () => ({ data: [] }) } } as unknown as Pick<Plugin.Context, "tool" | "mcp">
    const providerUnderTest = createProvider(ctx, { aliases: ["work", "personal"], servers: servers() })
    const error = await providerUnderTest.call("work", "getJiraIssue", {}, call()).catch((cause: unknown) => cause)
    expect((error as ProviderError).code).toBe("UNAVAILABLE")
    expect((error as ProviderError).message).toContain("not registered")
  })
})
