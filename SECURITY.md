# Security policy

## Reporting a vulnerability

Report a security issue privately through the repository's **Security** tab ("Report a vulnerability") or to the
maintainers listed in `.github/CODEOWNERS`. Do not open a public issue. Include what you ran, what happened, and the
version (`package.json` or the release tag). We aim to answer within five working days.

## Supported versions

Only the latest `0.0.x` release is supported while the plugin is pre-1.0. A fix ships as a new patch release and a
`CHANGELOG.md` entry.

## Scope

The plugin is a connector, not a credential store:

- Jira credentials are held by Atlassian's MCP server and OpenCode's MCP sign-in. The plugin never reads a token, a
  header or a local credential file.
- The sign-in pins six scopes (`read:me read:account offline_access read:jira:agent-interface
  write:jira:agent-interface search:jira:agent-interface`); the plugin does not request delete or administration
  scopes.
- A page's text is untrusted data, marked `trust: "untrusted"`. The plugin never follows it as an instruction, never
  puts it in status, and never uses it to choose a tool or a recipient.
- Status reasons and refusals are redacted and cut to one line; an event carrying a credential is refused and listed in
  `refused[]`.
- A user MCP entry at another address is a conflict: the plugin does not call it and does not read its headers.

## What to include

A report needs the plugin version, the OpenCode release, the alias, the method (or the vendor tool), and the exact
error text with any credential removed. Never paste a token, a signed URL or a full server URL with a query string.
