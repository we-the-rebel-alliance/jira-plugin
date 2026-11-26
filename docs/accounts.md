# Accounts

Jira accounts are held by the **mcp** mechanism: Atlassian's MCP server keeps the OAuth credential, and OpenCode keys
it per server. The plugin holds no token and adds no header.

<!-- generated:accounts -->
Accounts are held by the **mcp** mechanism: the vendor's MCP server holds them.

| Field | Type | Required |
|---|---|---|
| `site` | string | no |
<!-- /generated:accounts -->

## One server per alias

| Alias | MCP server | Sign-in |
|---|---|---|
| `default` | `jira` | `/connect`, Jira |
| `work` | `jira-work` | `/connect`, Jira (work) |
| `personal` | `jira-personal` | `/connect`, Jira (personal) |

The derivation is the contract's: `<name>` for `default`, `<name>-<alias>` otherwise. Every alias is a separate OAuth
sign-in; one alias's token never reads another's sites or reaches another's pass-through tools.

## The `site` profile

`site` is optional and is a Jira site's cloud id, as `getAccessibleAtlassianResources` names it. When it is set,
`events_list` reads that site only; the read fails with `OPTIONS_INVALID` if the sign-in does not reach it. When it is
unset, `events_list` reads every Jira site the sign-in reaches, up to eight. Pass-through tools are not narrowed by
`site`: their own `cloudId` input decides what they read.

## Picking an account

Pass `account` as the alias on `events_list` and `probe`. With two aliases and none named, the call is refused with
`ACCOUNT_REQUIRED`; an alias the plugin does not serve is `ACCOUNT_UNKNOWN`. A cursor issued for one alias is refused
for another with `CURSOR_INVALID`. `status` takes no account and lists every alias.

The pass-through MCP tools take no `account`: the alias is the server. A call to `work`'s server cannot reach
`personal`'s tools, and the access rules are generated per alias.

## A server entry the person already has

If `mcp.servers` already holds an entry named `jira` or `jira-<alias>`:

- at Atlassian's endpoint (`https://mcp.atlassian.com/v2/mcp?tools=all`, a trailing slash still matches), the plugin
  adopts it unchanged and adds nothing;
- any other address, a local command, or a different query (a plain `/v2/mcp` entry is the meta-tool server, whose tools
  this plugin does not describe) is a conflict: the plugin adds nothing for that alias, and status says `error` with the
  address it found.

The plugin reads only the entry's type and URL, never its headers, so a token in a header is never copied, logged or
shown.
