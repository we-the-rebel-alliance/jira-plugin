# Architecture

## Layers

| Layer | Does |
|---|---|
| `src/index.ts` | the one `Plugin.define` and `setup`: host gate, accounts, provider, handlers and skills, then one `register` call |
| `src/handlers/` | one handler per declared method: `status`, `probe`, `events_list` |
| `src/provider/` | the provider client (`atlassian.ts`) and Jira's activity walk (`activity.ts`) |
| `src/accounts.ts` | the mcp servers, the `site` profile and status signals |
| `src/status.ts`, `src/command.ts` | the status answer assembly and the `/jira` text |
| `src/watch.ts` | the `mcp.status.changed` watcher that emits `account` |
| `src/manifest.ts` | reads `capabilities` from the installed `package.json` |

`src/index.ts` is one `Plugin.define({ id: manifest.plugin.name, setup })` value. Setup calls `assertHost`, finds each
alias's server entry, registers one vendor MCP server per alias through the contract's `accounts` module, builds the
handlers, and makes one `register` call. `register` owns every door: the agent tool, Code Mode and the RPC method. The
plugin never calls `ctx.tool.add`, `ctx.rpc.register` or `ctx.permission.assert` itself.

## The provider client

`src/provider/atlassian.ts` is the only file that names the endpoint
(`https://mcp.atlassian.com/v2/mcp?tools=all`) and the six pinned OAuth scopes. It does not call HTTP itself: every
read runs through OpenCode's own executor for an MCP tool, so the vendor's server holds the credential, the transport
and its schema.

- The alias resolves through the contract's `serverOf`: `jira` for `default`, `jira-<alias>` otherwise.
- The host's tool id resolves through `toolAction(server, tool)`, so a vendor tool such as
  `searchJiraIssuesUsingJql` on `jira-work` is `jira-work_searchJiraIssuesUsingJql`.
- An executor answer may be structured (`output`) or JSON text (`content`); both are read. A vendor failure is
  `RATE_LIMITED` or `UNAVAILABLE`, and a server that is missing, still connecting, disabled or needs a sign-in gives the
  contract's code with a next step.
- A user entry that is not Atlassian's server is a conflict: the provider refuses before it looks up any tool, so it can
  never call another server's tool.

`src/provider/activity.ts` is Jira's domain logic: the JQL window, the per-site page walk, the settlement delay, the
merged oldest-first page, and the cursor that holds each site's last position. It reads through the provider and never
names the endpoint.

## What is cached

- **Per-alias owner.** The last `atlassianUserInfo` owner a `probe` or an `events_list` page read, in memory, for
  `status`. Status never calls Atlassian. A page always reads the owner itself, so the cache can label status but never
  an event.
- **No content.** Work items, pages and cursors are not cached: the cursor is the consumer's, and every read asks the
  provider.
- **No credential.** The plugin never holds one.

## OpenCode APIs used

| API | Why |
|---|---|
| `ctx.app.version` | the host gate and status |
| `ctx.options` | the `access` and `accounts` options |
| `ctx.mcp.transform`, `ctx.mcp.list` | one server per alias, its state, and adopting or refusing an existing entry |
| `ctx.tool.list` | the vendor tool executors the provider calls |
| `ctx.agent.transform` | the generated access rules (through `register`) |
| `ctx.agent.list` | the agents status checks when the call asks |
| `ctx.event.subscribe` | `mcp.status.changed` for the `account` nudge |
| `ctx.command.transform`, `ctx.session.synthetic` | the `/jira` status message |
| `ctx.permission`, `ctx.rpc`, `ctx.session` | the doors and the permission gate (through `register`) |

No private OpenCode module is imported, and no per-request hook is used.
