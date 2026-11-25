import { Plugin } from "@opencode/plugin"
import { assertHost, register } from "@we-the-rebel-alliance/plugin-contract/register"
import { accountPlan, classifyServers, entriesByAlias, registerJiraAccounts, serverNames } from "./accounts.ts"
import { agentsFromHost, registerJiraCommand } from "./command.ts"
import { createHandlers, type HandlerDeps } from "./handlers/index.ts"
import { manifest, version } from "./manifest.ts"
import { OwnerCache } from "./owners.ts"
import { createProvider, type Provider, type ServerEntry } from "./provider/atlassian.ts"
import { buildStatus } from "./status.ts"
import { watchAccountStatus } from "./watch.ts"

/** The test seam: a provider can be replaced without a host. Everything else is OpenCode's own context. */
export interface JiraSeam {
  readonly provider?: Provider | undefined
  readonly now?: (() => number) | undefined
}

/** Why an alias's entry made it unavailable, in the words status shows: one line, no headers, no query string. */
function conflictProblems(names: ReadonlyMap<string, string>, servers: ReadonlyMap<string, ServerEntry>): string[] {
  const problems: string[] = []
  for (const [alias, name] of names) {
    const entry = servers.get(alias)
    if (entry?.kind === "conflict") problems.push(`mcp.servers.${name} is set to another address (${entry.url ?? "an unknown address"}), so the ${alias} account is unavailable`)
  }
  return problems
}

/**
 * The plugin: assert the host, register one vendor MCP server per alias, build the provider and handlers, then wire the
 * doors with one `register` call. The bus writer comes from that registration; the status command and the account
 * watcher are the only things set up after it.
 */
export function createJiraPlugin(seam: JiraSeam = {}) {
  return Plugin.define({
    id: manifest.plugin.name,
    async setup(ctx: Plugin.Context) {
      assertHost(ctx, manifest)
      const options = (ctx.options ?? {}) as Readonly<Record<string, unknown>>
      const plan = accountPlan(manifest, options)
      if (!plan.ok) throw new Error(`OPTIONS_INVALID: ${plan.problems.join("; ")}. Next step: fix the plugin's accounts option.`)
      const profiles = plan.value.accounts
      const aliases = profiles.map((profile) => profile.alias)
      const names = serverNames(aliases)

      // What each alias's server entry already is, before this plugin adds one.
      const found = new Map<string, ServerEntry>()
      await classifyServers(ctx, names, found)
      const servers = entriesByAlias(names, found)
      const accounts = await registerJiraAccounts(ctx, { manifest, options, servers })
      const problems = [...accounts.problems, ...conflictProblems(names, servers)]

      const deps: HandlerDeps = {
        manifest,
        version,
        hostVersion: ctx.app.version,
        profiles,
        aliases,
        names,
        servers,
        options,
        provider: seam.provider ?? createProvider(ctx, { aliases, servers }),
        owners: new OwnerCache(),
        mcp: ctx.mcp,
        problems: () => problems,
        now: seam.now ?? (() => Date.now()),
      }
      const handlers = createHandlers(deps)
      const registration = await register(ctx, manifest, handlers)

      const watcher = watchAccountStatus(ctx, (event, data) => registration.bus.emit(event, data), { aliases, names })
      const command = await registerJiraCommand(ctx, async () => buildStatus(deps, await agentsFromHost(ctx, registration.access.rules)))

      return async () => {
        await watcher.stop()
        await command.dispose()
        await registration.dispose()
      }
    },
  })
}
