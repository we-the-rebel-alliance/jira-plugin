# Configuration

The plugin's options, generated from `capabilities.options`.

<!-- generated:configuration -->
| Option | Type | Default | Description |
|---|---|---|---|
| `access` | `all` \| `ask-changes` \| `read-only` | `"all"` | How much the plugin's methods and the account's MCP tools may do. |
| `accounts` | object | — | One profile per account alias. |
| `allowUntestedHost` | boolean | `false` | Start outside the tested OpenCode range. |
<!-- /generated:configuration -->

## Example

```json
{
  "plugins": [
    {
      "package": "github:we-the-rebel-alliance/jira-plugin#v0.0.0",
      "options": {
        "access": "ask-changes",
        "accounts": { "work": { "site": "2f1c9a3e-4b2d-4c1a-9f7e-8d6b5a4c3e21" }, "personal": {} }
      }
    }
  ]
}
```

An empty profile reads every Jira site the sign-in reaches. With no `accounts` option the plugin serves one `default`
account, the MCP server `jira`.

## Access

`options.access` is the person's ceiling. A method's class decides what the level does; the plugin declares no `effect`
on any method, so nothing narrows the table further.

| Class | `all` | `ask-changes` | `read-only` |
|---|---|---|---|
| `read` | allow | allow | allow |
| `write` | allow | ask | deny |
| `send` | allow | ask | deny |
| `share` | allow | ask | deny |
| `delete` | allow | ask | deny |
| `export` | allow | ask | deny |
| `admin` | allow | ask | deny |

The pass-through MCP tools follow the same table, per alias: a rule for `work` never matches `personal`'s tools. A
`read-only` plugin also refuses a non-read method over RPC, even with a confirmation.

A person's own agent rules come after the generated block and still win for one method; status names the agents whose
later rules widen a generated `ask` or `deny`.
