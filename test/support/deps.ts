import type { Plugin } from "@opencode/plugin"
import type { Bus } from "@we-the-rebel-alliance/plugin-contract/bus"
import type { AccessRegistration } from "@we-the-rebel-alliance/plugin-contract/access"
import type { MethodCall } from "@we-the-rebel-alliance/plugin-contract/register"
import { accountPlan, serverNames } from "../../src/accounts.ts"
import { createHandlers } from "../../src/handlers/index.ts"
import type { HandlerDeps } from "../../src/handlers/deps.ts"
import { manifest, version } from "../../src/manifest.ts"
import { OwnerCache } from "../../src/owners.ts"
import type { ServerEntry } from "../../src/provider/atlassian.ts"
import { FakeJira, NOW } from "./fake-jira.ts"

/** The two synthetic accounts the conformance fixture records: `work` reads one of its two sites. */
export const TEST_OPTIONS: Readonly<Record<string, unknown>> = {
  access: "all",
  accounts: { work: { site: "cloud-work-1" }, personal: {} },
}

export type Statuses = Readonly<Record<string, "connected" | "needs_auth" | "pending" | "disabled" | "failed">>

/** The real handler table over the fake boundary, with the real manifest and a fixed clock. */
export function handlerDeps(fake: FakeJira = new FakeJira(), options: Readonly<Record<string, unknown>> = TEST_OPTIONS, statuses: Statuses = {}, problems: readonly string[] = []) {
  const plan = accountPlan(manifest, options)
  if (!plan.ok) throw new Error(plan.problems.join("; "))
  const profiles = plan.value.accounts
  const aliases = profiles.map((profile) => profile.alias)
  const names = serverNames(aliases)
  const servers = new Map<string, ServerEntry>(aliases.map((alias) => [names.get(alias) ?? alias, { kind: "plugin" }]))
  const owners = new OwnerCache()
  const deps: HandlerDeps = {
    manifest,
    version,
    hostVersion: "2.4.1",
    profiles,
    aliases,
    names,
    servers,
    options,
    provider: fake.provider(statuses),
    owners,
    mcp: { list: async () => fake.mcpList(statuses) } as unknown as Pick<Plugin.Context["mcp"], "list">,
    problems: () => problems,
    now: () => NOW,
  }
  return { deps, handlers: createHandlers(deps), owners, fake, aliases, profiles }
}

/** One call as `register` builds it, with the account resolved. */
export function methodCall(account: string, overrides: Partial<MethodCall> = {}): MethodCall {
  return {
    sessionID: "ses_test",
    agent: "build",
    messageID: "msg_test",
    id: "call_test",
    signal: new AbortController().signal,
    progress: async () => {},
    account,
    door: "rpc",
    bus: { emit: async () => ({ ok: true }) } as unknown as Bus,
    access: { level: "all", aliases: [], rules: [], problems: [], dispose: async () => {} } satisfies AccessRegistration,
    unguardedAgents: async () => [],
    ...overrides,
  }
}
