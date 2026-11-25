import type { Plugin } from "@opencode/plugin"
import { describe, expect, test, vi } from "vitest"
import type { StatusAnswer } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { agentsFromHost, formatStatus } from "../../src/command.ts"
import { createHandlers } from "../../src/handlers/index.ts"
import { watchAccountStatus } from "../../src/watch.ts"
import { FakeJira } from "../support/fake-jira.ts"
import { handlerDeps, methodCall } from "../support/deps.ts"

describe("the status answer", () => {
  test("is ready with each alias's owner once a probe answered, and reads no provider content", async () => {
    const { handlers, fake } = handlerDeps()
    await handlers.probe.run({ source: "jira" }, methodCall("work"))
    await handlers.probe.run({ source: "jira" }, methodCall("personal"))
    fake.calls.length = 0
    const answer = (await handlers.status.run({}, methodCall("work"))) as StatusAnswer
    expect(answer).toEqual({
      name: "jira",
      version: "0.0.0",
      host: { version: "2.4.1", range: ">=2.4.1 <2.5.0", tested: ["2.4.1"] },
      state: "ready",
      accounts: [
        { alias: "work", state: "ready", owner: { id: "atlassian:acc-work-ana", label: "Ana Silva" } },
        { alias: "personal", state: "ready", owner: { id: "atlassian:acc-personal-ana", label: "Ana Silva" } },
      ],
      unguardedAgents: [],
      nextStep: null,
    })
    expect(fake.calls).toEqual([])
  })

  test("an alias that needs a sign-in makes the plugin needs_sign_in", async () => {
    const { handlers } = handlerDeps(new FakeJira(), undefined, { personal: "needs_auth" })
    const answer = (await handlers.status.run({}, methodCall("work"))) as StatusAnswer
    expect(answer.state).toBe("needs_sign_in")
    expect(answer.accounts.find((entry) => entry.alias === "personal")).toEqual({ alias: "personal", state: "needs_sign_in" })
    expect(answer.nextStep).toContain("Sign in")
  })

  test("a setup problem makes the plugin error and is the next step, redacted", async () => {
    const { handlers } = handlerDeps(new FakeJira(), undefined, {}, ["mcp.servers.jira-work is set to another address (https://elsewhere.example.com/…), so the work account is unavailable"])
    const answer = (await handlers.status.run({}, methodCall("work"))) as StatusAnswer
    expect(answer.state).toBe("error")
    expect(answer.nextStep).toContain("another address")
  })

  test("an unreadable MCP server list is an error, not a sign-in guess", async () => {
    const { deps } = handlerDeps()
    const handlers = createHandlers({
      ...deps,
      mcp: {
        list: async () => {
          throw new Error("the host would not list MCP servers")
        },
      } as never,
    })
    const answer = (await handlers.status.run({}, methodCall("work"))) as StatusAnswer
    expect(answer.state).toBe("error")
    expect(answer.accounts.map((account) => account.state)).toEqual(["error", "error"])
    expect(answer.nextStep).toContain("MCP server list could not be read")
  })

  test("an unreadable agent list is unknown, never zero", async () => {
    const { handlers } = handlerDeps()
    const answer = (await handlers.status.run(
      {},
      methodCall("work", {
        unguardedAgents: async () => ({ ok: false, error: "the agent list could not be read: the host would not list agents" }),
      }),
    )) as StatusAnswer
    expect(answer.state).toBe("error")
    expect(answer.unguardedAgents).toEqual([])
    expect(answer.nextStep).toContain("agent list could not be read")
  })

  test("unguarded agents are named", async () => {
    const { handlers } = handlerDeps()
    const answer = (await handlers.status.run({}, methodCall("work", { unguardedAgents: async () => ({ ok: true, agents: ["explore"] }) }))) as StatusAnswer
    expect(answer.unguardedAgents).toEqual(["explore"])
    expect(answer.state).toBe("ready")
  })
})

describe("the /jira command's agent question", () => {
  test("passes a result, and an unreadable list is an error rather than an empty list", async () => {
    const listed = await agentsFromHost({ agent: { list: async () => ({ data: [] }) } } as never, [])
    expect(listed).toEqual({ ok: true, agents: [] })
    const failed = await agentsFromHost(
      {
        agent: {
          list: async () => {
            throw new Error("the host would not list agents")
          },
        },
      } as never,
      [],
    )
    expect(failed.ok).toBe(false)
    if (!failed.ok) expect(failed.error).toContain("agent list could not be read")
  })
})

describe("the /jira text", () => {
  test("names each alias and the next step", async () => {
    const { handlers } = handlerDeps(new FakeJira(), undefined, { personal: "needs_auth" })
    await handlers.probe.run({ source: "jira" }, methodCall("work"))
    const answer = (await handlers.status.run({}, methodCall("work"))) as StatusAnswer
    expect(formatStatus(answer)).toBe(
      ["Jira 0.0.0 on OpenCode 2.4.1 (>=2.4.1 <2.5.0).", "State: needs_sign_in.", "- work: ready", "- personal: needs_sign_in", "Agents without the access rules: none.", "Next step: Sign in to the account that needs it, then read status again."].join("\n"),
    )
  })
})

describe("the account watcher", () => {
  test("emits account when an alias's MCP server changes state, and ignores other servers", async () => {
    const fake = new FakeJira()
    const emitted: { account: string; state: string }[] = []
    const subscribe = ({ signal }: { signal: AbortSignal }) =>
      (async function* () {
        yield { type: "mcp.status.changed", data: { server: "jira-work" } }
        yield { type: "mcp.status.changed", data: { server: "another-plugin" } }
        yield { type: "mcp.status.changed", data: { server: "jira-personal" } }
        await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))
      })()
    const ctx = {
      event: { subscribe },
      mcp: { list: async () => fake.mcpList({ work: "needs_auth", personal: "connected" }) },
    } as unknown as Pick<Plugin.Context, "event" | "mcp">
    const watcher = watchAccountStatus(ctx, async (event, data) => {
      expect(event).toBe("account")
      emitted.push(data)
    }, { aliases: ["work", "personal"], names: new Map([["work", "jira-work"], ["personal", "jira-personal"]]) })
    await vi.waitFor(() => expect(emitted).toHaveLength(2))
    await watcher.stop()
    expect(emitted).toEqual([
      { account: "work", state: "needs_sign_in" },
      { account: "personal", state: "ready" },
    ])
  })

  test("a repeated state is not emitted twice", async () => {
    const fake = new FakeJira()
    const emitted: { account: string; state: string }[] = []
    const subscribe = ({ signal }: { signal: AbortSignal }) =>
      (async function* () {
        yield { type: "mcp.status.changed", data: { server: "jira-work" } }
        yield { type: "mcp.status.changed", data: { server: "jira-work" } }
        await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))
      })()
    const ctx = {
      event: { subscribe },
      mcp: { list: async () => fake.mcpList({ work: "connected" }) },
    } as unknown as Pick<Plugin.Context, "event" | "mcp">
    const watcher = watchAccountStatus(ctx, async (_event, data) => void emitted.push(data), { aliases: ["work"], names: new Map([["work", "jira-work"]]) })
    await vi.waitFor(() => expect(emitted).toHaveLength(1))
    await watcher.stop()
    expect(emitted).toEqual([{ account: "work", state: "ready" }])
  })
})
