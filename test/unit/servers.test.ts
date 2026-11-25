import type { Plugin } from "@opencode/plugin"
import { describe, expect, test } from "vitest"
import { classifyServers, registerJiraAccounts, serverNames, siteOf } from "../../src/accounts.ts"
import type { ServerEntry } from "../../src/provider/atlassian.ts"
import { manifest } from "../../src/manifest.ts"
import { ENDPOINT, OAUTH_SCOPE } from "../../src/provider/atlassian.ts"

const names = serverNames(["work", "personal"])

/** A context whose MCP editor holds the entries the test gives it, and records every set. */
function mcpContext(existing: Readonly<Record<string, unknown>> = {}) {
  const sets: { name: string; config: unknown }[] = []
  const ctx = {
    mcp: {
      transform: async (callback: (editor: unknown) => void) => {
        callback({
          get: (name: string) => existing[name],
          set: (name: string, config: unknown) => void sets.push({ name, config }),
        })
        return { dispose: async () => {} }
      },
    },
    integration: { transform: async () => ({ dispose: async () => {} }) },
  } as unknown as Pick<Plugin.Context, "integration" | "mcp">
  return { ctx, sets }
}

describe("what an alias's server entry is", () => {
  test("no entry is ours, the same address is adopted, and another address or a command is a conflict", async () => {
    const found = new Map<string, ServerEntry>()
    const { ctx } = mcpContext({
      "jira-work": { type: "remote", url: "https://mcp.atlassian.com/v2/mcp/?tools=all", oauth: { scope: OAUTH_SCOPE }, headers: { Authorization: "Bearer never-read" } },
      "jira-personal": { type: "remote", url: "https://elsewhere.example.com/mcp?token=secret", oauth: false },
    })
    await classifyServers(ctx, names, found)
    expect(found.get("jira-work")).toEqual({ kind: "adopted", url: "https://mcp.atlassian.com/v2/mcp?tools=all" })
    expect(found.get("jira-personal")).toEqual({ kind: "conflict", url: "https://elsewhere.example.com/…" })
  })

  test("a local command is a conflict", async () => {
    const found = new Map<string, ServerEntry>()
    const { ctx } = mcpContext({ "jira-work": { type: "local", command: ["jira-mcp"] } })
    await classifyServers(ctx, names, found)
    expect(found.get("jira-work")).toEqual({ kind: "conflict", url: "a local command" })
  })
})

describe("registering one server per alias", () => {
  test("a new alias gets the pinned endpoint and scope, and a conflict adds nothing", async () => {
    const servers = new Map<string, ServerEntry>([
      ["work", { kind: "plugin" }],
      ["personal", { kind: "conflict", url: "https://elsewhere.example.com/…" }],
    ])
    const { ctx, sets } = mcpContext()
    const result = await registerJiraAccounts(ctx, { manifest, options: { access: "all", accounts: { work: {}, personal: {} } }, servers })
    expect(sets).toEqual([
      {
        name: "jira-work",
        config: { type: "remote", url: ENDPOINT, oauth: { scope: OAUTH_SCOPE } },
      },
    ])
    expect(result.problems).toEqual([])
    expect(result.accounts.map((account) => account.alias)).toEqual(["work", "personal"])
  })

  test("an adopted entry is left as the person wrote it: nothing is set", async () => {
    const servers = new Map<string, ServerEntry>([["work", { kind: "adopted", url: "https://mcp.atlassian.com/v2/mcp?tools=all" }]])
    const { ctx, sets } = mcpContext()
    const result = await registerJiraAccounts(ctx, { manifest, options: { access: "all", accounts: { work: {} } }, servers })
    expect(sets).toEqual([])
    expect(result.problems).toEqual([])
  })

  test("a conflict's address is not reported as a problem, so it never reaches status", async () => {
    const servers = new Map<string, ServerEntry>([["work", { kind: "conflict", url: "https://elsewhere.example.com/…" }]])
    const { ctx } = mcpContext()
    const result = await registerJiraAccounts(ctx, { manifest, options: { access: "all", accounts: { work: {} } }, servers })
    expect(result.problems).toEqual([])
    expect(JSON.stringify(result)).not.toContain("Bearer")
  })
})

describe("the site profile", () => {
  test("reads the alias's cloud id, and ignores an empty or missing profile", () => {
    const options = { accounts: { work: { site: " cloud-work-1 " }, personal: {}, other: { site: "" } } }
    expect(siteOf(options, "work")).toBe("cloud-work-1")
    expect(siteOf(options, "personal")).toBeUndefined()
    expect(siteOf(options, "other")).toBeUndefined()
    expect(siteOf({}, "work")).toBeUndefined()
  })
})
