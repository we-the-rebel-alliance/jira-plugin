# Security

## What leaves the machine

- Every Jira call goes to Atlassian's MCP server at `https://mcp.atlassian.com/v2/mcp?tools=all`, through OpenCode's
  own MCP transport. The plugin sends the vendor tool's own input — a JQL query, an issue key, a comment or an
  attachment the model asked for — and nothing else.
- The plugin itself makes no HTTP request, reads no local file for a call, and uploads nothing. `events_list` and
  `probe` read through the same MCP tools as any other call.
- An attachment download is the vendor's tool: it mints a short-lived signed link and returns a local download command.
  That content leaves the provider, not this machine's files.
- A page's links point only at `*.atlassian.net` hosts. A link elsewhere is dropped from the event.

## Scopes

The sign-in pins six scopes:

```
read:me read:account offline_access read:jira:agent-interface write:jira:agent-interface search:jira:agent-interface
```

Atlassian's 401 names no scope, and its protected-resource metadata lists every scope the account may hold, including
delete and administration groups. Without the pin OpenCode would request all of them, and the grant itself would cover
deletes and project settings. Pinned, Atlassian does not load the delete or administration tools, and the generated
access rules are the second lock.

The plugin does not change the scopes on an MCP server entry the person configured themselves. If that entry requests
more, its own grant covers it; the access rules still apply.

## Redaction

- A refusal and a status reason are one line, at most 160 characters for a status reason, with URL query values,
  `Bearer`/`Basic` credentials, JWTs and token-shaped words replaced by the contract's redactor.
- The plugin never reads an MCP entry's headers, so a token there is never copied, logged or shown.
- A server address in status is its origin and path only; any query other than the known `?tools=all` is dropped
  because a query can hold a signature.
- An event that holds a credential is refused for good and listed in the page's `refused[]`; the cursor moves past it.
  `screenEvents` does the screening before the page is answered.
- Status and logs carry no Jira content. `probe` reads the owner and no content. Event text is marked
  `trust: "untrusted"`.

## No plan and no commit

This plugin declares no actions and no plan/commit methods. Every write is a pass-through tool of Atlassian's own
server: its schema and its call belong to that server, and the plugin cannot see the call to plan, preview or emit a
`changed` nudge for it. What the plugin controls is the classification and the access rules:

- `ask-changes` asks before every write, send, delete, admin and export tool, per alias.
- `read-only` denies them, and a non-read RPC method is refused even with a confirmation.
- A grant or rule for one alias never reaches another alias's tools.

The write workflow is the skill's: say what the change reaches before making it, and never make a change the person did
not ask for.
