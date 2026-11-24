# Jira for OpenCode

Read and change your Jira work items from OpenCode — keys such as `PROJ-42`, JQL, comments, logged time, boards,
sprints, versions and filters — through Atlassian's official MCP server. OpenCode owns the connection, the sign-in and
the stored credentials; this plugin registers the server, adds default permission rules, a status command, a status
dialog, two skills and a tools RPC for scripts, and contributes the `jira.activity` source.

Every tool is allowed by default. A change, a delete or an attachment download runs without a prompt unless you
restrict it; [Permissions](#permissions) shows the option that does.

Unofficial; not affiliated with Atlassian. Jira is a trademark of Atlassian Pty Ltd; this unofficial plugin is not
endorsed by them.

## Requirements

- OpenCode `>=2.4.1 <2.5.0`, tested on 2.4.1. Outside that range the plugin does not start, unless you set
  `allowUntestedHost`.
- A Jira Cloud site on a plan whose Atlassian Administration allows the Atlassian MCP server.
- An organisation admin who allows **Read**, **Search** and **Write** for Atlassian MCP in Atlassian Administration,
  Connectors, Atlassian MCP server, Permissions.
- Your own Jira permissions decide what you can see and change. A site admin can also block access by IP address.
- The tools are Atlassian's, and Atlassian may change them without notice. A tool Atlassian adds is allowed at once
  under `access: "all"`, and is counted as unknown until a release knows it.

## Install

Install from a release: `opencode plugin add github:we-the-rebel-alliance/jira-plugin#v<version>`, then run
`opencode reload`.

The first release on plugin-contract is `v0.0.0` (phase 4b). Until it is cut, there is no release to install:
the repository carries no `dist/`, and OpenCode runs no build when it installs from Git.

## Sign in

Run `/connect` and choose **Jira** (it is listed under MCP). In the terminal UI, press `o` or Enter to open the link
to Atlassian's sign-in page in your browser, sign in, and approve the access. No API token is needed or used.

From a terminal, run `opencode mcp auth jira` instead. Run it from the project folder where the plugin is installed; if
it answers `MCP server not found: jira`, OpenCode is still opening that folder: wait a few seconds and run it again.
`/mcps` also offers the same sign-in.

The plugin pins the access it asks for: Jira read, write and search, plus your account name and an offline token. It does
not ask for delete, for project or screen administration, or for Confluence, and because the request is pinned,
Atlassian cannot grant more than that: it then does not load those tools at all.

One sign-in may reach **several sites**. Every call names a site, and the model asks which one, once per session, when
you belong to more than one, then names it before every change.

To sign out, or to switch account, run `opencode mcp logout jira` from the project folder where the plugin is installed, or remove the account in `/connect` → **Jira**. If it answers `MCP server not found: jira`, OpenCode is still opening that folder: wait a few seconds and run it again. Then sign in again. To sign out before you remove the plugin, see
[Uninstall](#uninstall).

## Use

Ask, for example:

- "What's the status of PROJ-123?"
- "My open items in PROJ."
- "What moved to In Review this week?"
- "How many are in progress on the board?"
- "Log 30 minutes on PROJ-42."
- "Comment that the PR is up and mention Sam."
- "Create three items from these notes."

Every change can email people, so the model says whom it reaches before it makes the call.

| Command | What it does |
| --- | --- |
| `/jira-status` | Posts the status report into the session: connection, account, access, sites, tools, agents without the default rules, the OpenCode check and the next step. |
| `/jira`, or "Jira: Status" in the command palette | Opens the same report in a dialog. Press `r` to refresh it and `Esc` to close it. |

The Account row comes from a read through the tools RPC or from a probe, and the Sites row from a read through the tools
RPC; the model's own calls fill neither. Status makes no Atlassian call of its own, and shows a display name and site
names only: never an email address, an account id or a cloud id.

Two skills teach the model to use Jira well:

- `jira`: finding a work item, JQL, boards, sprints, versions, filters, attachments, choosing the site, and the rules
  for other people's words and data.
- `jira-write`: whom each change reaches, saying so before the call, naming the operation for the sprint and version
  tools, and leaving the yes to OpenCode's permission prompt.

### Jira as a source

`package.json`'s `sources` declares `jira.activity`, which a collector reads with no model, in Code Mode
or through the tools RPC. `events_list` (`jira_events_list`) lists what changed for you since a cursor, oldest first:
one event per work item each time a read finds it updated, for every work item you are assigned, reported or watching,
on each Jira site your sign-in reaches, with metadata only — the key and summary, the update time, the assignee and
reporter, the status, type and priority, and the link. `probe` (`jira_probe`, a tools RPC method) names who is signed
in, from one `atlassianUserInfo` read. A listing needs no probe before it. Jira text is untrusted data, never
instructions.

### Scripts

An OpenCode automation or a shell script can call every known Jira tool with no model, through `opencode api`. It runs
as a session and its agent, under that agent's permission rules and the session's own. `describe` lists every method
with its class, and every Jira call needs a `cloudId` from `getAccessibleAtlassianResources`.

```sh
opencode api post /api/rpc/jira.issues.tools/getAccessibleAtlassianResources \
  -H "x-opencode-directory:$PWD" \
  -d '{"input":{"sessionID":"ses_…","input":{}}}'
```

See [Scripting](https://github.com/we-the-rebel-alliance/jira-plugin/blob/master/docs/scripting.md).

## Permissions

**Every tool is allowed by default.** The plugin adds one block to every agent, right after the agent's base rule that
allows everything, and that block allows Jira's tools: reads, writes, deletes, project settings and attachment
downloads alike.

There are three ways to restrict it: the `access` option (`all`, `ask-changes` or `read-only`), a rule in an agent's
own `permissions`, and a per-tool rule in the top-level `permissions`. The last matching rule wins.

| `access` | What runs |
| --- | --- |
| `all` (the default) | every Jira tool runs without a prompt |
| `ask-changes` | a read runs; every other tool asks, including one Atlassian adds later |
| `read-only` | a read runs; every other tool is denied, and hidden from the model |

A later rule still wins: an agent's own stricter rules, your top-level `permissions`, and your saved "Always allow"
answers. In an unattended run such as `opencode run`, a tool that asks is refused.

`jira_downloadJiraIssueAttachment` is the export class, not a read: it mints a short-lived signed URL and a curl
command, which is a file credential. Its output belongs in your chat only. Every change can email people: a project's
notification scheme decides, and the safe assumption is that watchers, the assignee, the reporter and everyone
mentioned get an email.

[docs/configuration.md](https://github.com/we-the-rebel-alliance/jira-plugin/blob/master/docs/configuration.md#permissions)
has the whole block, permission recipes and the agents that miss it.

## Configure

Set options with the object form of the plugin entry:

```json
{
  "plugins": [{ "package": "github:we-the-rebel-alliance/jira-plugin#v<version>", "options": { "access": "ask-changes" } }]
}
```

| Option | Values | Default | Effect |
| --- | --- | --- | --- |
| `access` | `"all"`, `"ask-changes"` or `"read-only"` | `"all"` | How much the default rules restrict; see [Permissions](#permissions). |
| `allowUntestedHost` | `true` or `false` | `false` | Starts on an OpenCode version outside `>=2.4.1 <2.5.0`, with a warning in status. |

[docs/configuration.md](https://github.com/we-the-rebel-alliance/jira-plugin/blob/master/docs/configuration.md) has the
details, including your own `mcp.servers.jira` entry, an API-token entry for a headless machine and every error.

## Errors

Every error reads `CODE: What happened. Next step: What to do.` The codes are the plugin's own one table. `setup` and
`status` codes come from the plugin; `rpc` codes are a refusal from the tools RPC for scripts, which
[Scripting](https://github.com/we-the-rebel-alliance/jira-plugin/blob/master/docs/scripting.md#errors) explains in detail.

| Code | Surface | When |
| --- | --- | --- |
| `HOST_UNTESTED` | setup | OpenCode is outside the supported range and `allowUntestedHost` is not set. |
| `OPTIONS_INVALID` | setup | An option is unknown or has a wrong value. |
| `SKILLS_INVALID` | setup | A skill file is missing or broken; the plugin still starts. |
| `SERVER_NOT_REGISTERED` | setup | The `jira` server could not be registered. |
| `RULES_NOT_ADDED` | setup | The default permission rules could not be added. |
| `STATUS_UNAVAILABLE` | status | The status could not be read, or the plugin is not running. |
| `SESSION_UNKNOWN` | rpc | The session does not exist in this location. |
| `SESSION_AGENT_REQUIRED` | rpc | The session names no agent, or one that does not exist. |
| `PERMISSION_DENIED` | rpc | The last matching rule is an `ask` or a `deny`; refused before dispatch. |
| `SERVER_CONFLICT` | rpc | `mcp.servers.jira` is defined at another URL. |
| `AUTH_REQUIRED` | rpc | The `jira` server needs a sign-in. |
| `CONNECTING` | rpc | The `jira` server is still connecting. |
| `CONNECTION_FAILED` | rpc | The `jira` server could not connect. |
| `DISABLED` | rpc | The `jira` server is disabled. |
| `NOT_REGISTERED` | rpc | The `jira` server is not registered. |
| `TOOL_UNAVAILABLE` | rpc | The server is connected but OpenCode does not list the tool. |
| `UPSTREAM_ERROR` | rpc | Atlassian answered with an error, such as an invalid input or a rate limit. |
| `CANCELLED` | rpc | The request was cancelled. |

The status RPC's own error is `unavailable`, with a next step, when the status cannot be read.

## Troubleshooting

Run `/jira-status` first. Its last line is the next step.

| Status or error | What to do |
| --- | --- |
| Connection: sign-in required | Run `/connect` and choose Jira, then press `o` or Enter to open the link. In a terminal, `opencode mcp auth jira` opens it automatically: run it from the project folder, and if it answers `MCP server not found: jira`, wait a few seconds and run it again. |
| Connection: connecting | Wait a few seconds, then run `/jira-status` again. |
| Connection: failed | Check your network, then run `/jira-status` again. With your own `mcp.servers.jira` that has `"oauth": false`, check the API token in its headers. |
| Connection: disabled | Enable `jira` in `/mcps`, or remove `"disabled": true` from `mcp.servers.jira` in `opencode.json`. |
| Connection: not configured | An organisation policy (`mcp.use`) or another plugin removes the `jira` server. Ask your administrator, then restart OpenCode. |
| Connection: conflict | Your config has an `mcp.servers.jira` entry with a URL other than `https://mcp.atlassian.com/v2/mcp?tools=all`. A plain `/v2/mcp` is the meta-tool server, not this one. Point it at the plugin's URL or remove it, then restart OpenCode. |
| Tools: none listed yet | Jira connected moments ago and is still listing its tools. Run `/jira-status` again, or press `r` in the dialog, in a few seconds. |
| Tools: 0 available | An organisation admin has not allowed Read and Search for Atlassian MCP. See [Requirements](#requirements). |
| Tools: not granted by scope | The three workflow and screen reads sit in Atlassian's `manage_jira` group, which this plugin does not request. Nothing is wrong. |
| Tools: unknown | Atlassian added tools the plugin does not know yet. Under `access: "all"` they run at once, `ask-changes` asks, and `read-only` denies them. |
| Rate limited | Atlassian publishes `Retry-After` and `X-RateLimit-*`. Wait the seconds it names, and make fewer calls at once. |
| Signed in to the wrong Atlassian account | Remove the account in `/connect` → Jira, or run `opencode mcp logout jira` from the project folder; if it answers `MCP server not found: jira`, wait a few seconds and run it again. Then sign in again. |
| A skill seems ignored, and status names a skill to rename or move | A skill of yours with the same id, such as `jira`, replaces the plugin's. Rename or move it. |
| `/jira` is missing | The plugin did not start. Run `/plugins` to see the error. |

## Known limits

- **The tool table comes from Atlassian's docs.** Each class is a judgement from Atlassian's description of the tool. A
  tool Atlassian adds is allowed at once and counted as unknown. `npm run drift` compares a saved list with the table,
  and `CONTRIBUTING.md` has the steps.
- **A script's read can cross projects.** A script's session may belong to another directory than the OpenCode server
  answering it, and the read then runs under the serving location's agent rules; only a `deny` is refused in between.
  Run scripts in the project whose agent you mean. This is in the module shared with the other plugins, not in this
  one.
- Updates are not automatic for a Git install, and `opencode plugin update` and `opencode plugin check` do not work on
  one: remove the old entry and add the new one.

## Uninstall

Sign out while the plugin is still installed: once it is removed, OpenCode no longer knows the `jira` server and the
sign-in stays in OpenCode's credential store.

1. Sign out: remove the account in `/connect` → **Jira**, or run `opencode mcp logout jira` from the project folder
   where the plugin is installed. If it answers `MCP server not found: jira`, OpenCode is still opening that folder:
   wait a few seconds and run it again.
2. Check: `opencode auth list` no longer lists **Jira**.
3. Remove the plugin: `opencode plugin remove github:we-the-rebel-alliance/jira-plugin#v<version>`, then `opencode reload`.
   `opencode mcp list` no longer lists `jira`.
4. Remove any Jira rules you copied into your agents' own `permissions`.

An organisation admin can also turn Atlassian MCP off for the whole organisation.

## Links

- [Configuration](https://github.com/we-the-rebel-alliance/jira-plugin/blob/master/docs/configuration.md)
- [Scripting](https://github.com/we-the-rebel-alliance/jira-plugin/blob/master/docs/scripting.md)
- [Architecture](https://github.com/we-the-rebel-alliance/jira-plugin/blob/master/docs/architecture.md)
- [Contributing](https://github.com/we-the-rebel-alliance/jira-plugin/blob/master/CONTRIBUTING.md)
- [Security](https://github.com/we-the-rebel-alliance/jira-plugin/blob/master/SECURITY.md)
- [Changelog](https://github.com/we-the-rebel-alliance/jira-plugin/blob/master/CHANGELOG.md)
- [MIT license](https://github.com/we-the-rebel-alliance/jira-plugin/blob/master/LICENSE)
- [Atlassian's supported tools](https://support.atlassian.com/atlassian-ai-gateway/docs/supported-tools/)
