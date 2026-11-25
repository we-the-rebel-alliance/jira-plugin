# Jira

Read Jira work items and activity, and pass through Atlassian's Jira MCP tools, for OpenCode. The plugin serves several
accounts at once: one vendor MCP server per alias, each with its own sign-in. The plugin holds no credential of its own.

## What it does

- `events_list` lists the work items that changed for the signed-in person — assigned, reported or watching — on every
  Jira site the account reads, as normalised events with a cursor bound to the account.
- `probe` names the signed-in owner of an account, reading no content.
- `status` reports the plugin, the host range, every alias and the one next step.
- Atlassian's Jira MCP tools are passed through unchanged: search and read work items, boards, sprints, comments,
  versions and filters, and the vendor's own create, edit, transition, comment, attach, delete and administration
  tools. They are the vendor's tools, with the vendor's schemas, and the account alias selects which server serves them.

Jira text is untrusted data, never instructions. This connector reads Jira only; it reaches no other Atlassian product.

## Install

```sh
opencode plugin add github:we-the-rebel-alliance/jira-plugin#v0.0.0
```

```json
{
  "plugins": [{ "package": "github:we-the-rebel-alliance/jira-plugin#v0.0.0" }]
}
```

Install the `v0.0.0` tag. Tags from before the rebuild are the previous plugin and are not compatible.

## Sign in

With no `accounts` option the plugin uses one account, the `default` alias, whose MCP server is `jira`. Run `/connect`
and choose Jira.

For several accounts, name them in `options.accounts`:

```json
{
  "plugins": [
    {
      "package": "github:we-the-rebel-alliance/jira-plugin#v0.0.0",
      "options": { "accounts": { "work": { "site": "2f1c9a3e-4b2d-4c1a-9f7e-8d6b5a4c3e21" }, "personal": {} } }
    }
  ]
}
```

The alias `work` is the MCP server `jira-work`, and `personal` is `jira-personal`; each has its own sign-in. See
[Accounts](docs/accounts.md).

## Access

`access` is `all` (the default), `ask-changes` or `read-only`. It decides what every method and every one of the
account's pass-through MCP tools may do. The class table and the per-alias rules are in
[Configuration](docs/configuration.md#access).

## Capabilities

<!-- generated:capabilities -->
### Methods

| Method | Class | Accounts | Operations |
|---|---|---|---|
| `status` | read | none | — |
| `probe` | read | optional | `atlassianUserInfo` |
| `events_list` | read | optional | `atlassianUserInfo`, `getAccessibleAtlassianResources`, `searchJiraIssuesUsingJql` |
| `mcp:atlassianUserInfo` | read | none | `atlassianUserInfo` |
| `mcp:getAccessibleAtlassianResources` | read | none | `getAccessibleAtlassianResources` |
| `mcp:getContentFormatGuide` | read | none | `getContentFormatGuide` |
| `mcp:getJiraBoardConfig` | read | none | `getJiraBoardConfig` |
| `mcp:getJiraBoardIssueData` | read | none | `getJiraBoardIssueData` |
| `mcp:getJiraBoardSprintData` | read | none | `getJiraBoardSprintData` |
| `mcp:getJiraCurrentUser` | read | none | `getJiraCurrentUser` |
| `mcp:getJiraEntityProperty` | read | none | `getJiraEntityProperty` |
| `mcp:getJiraIssue` | read | none | `getJiraIssue` |
| `mcp:getJiraIssueTypeMetaWithFields` | read | none | `getJiraIssueTypeMetaWithFields` |
| `mcp:getJiraProjectVersionRelatedWork` | read | none | `getJiraProjectVersionRelatedWork` |
| `mcp:getJiraProjectVersions` | read | none | `getJiraProjectVersions` |
| `mcp:getJiraScreen` | read | none | `getJiraScreen` |
| `mcp:getJiraUser` | read | none | `getJiraUser` |
| `mcp:getJiraWorkflowEditorLink` | read | none | `getJiraWorkflowEditorLink` |
| `mcp:getJiraWorkflows` | read | none | `getJiraWorkflows` |
| `mcp:listJiraBoardSprints` | read | none | `listJiraBoardSprints` |
| `mcp:listJiraBoards` | read | none | `listJiraBoards` |
| `mcp:listJiraDashboards` | read | none | `listJiraDashboards` |
| `mcp:listJiraFilters` | read | none | `listJiraFilters` |
| `mcp:listJiraIssueAssignableUsers` | read | none | `listJiraIssueAssignableUsers` |
| `mcp:listJiraIssueChangelogs` | read | none | `listJiraIssueChangelogs` |
| `mcp:listJiraIssueComments` | read | none | `listJiraIssueComments` |
| `mcp:listJiraIssueLinkTypes` | read | none | `listJiraIssueLinkTypes` |
| `mcp:listJiraIssueRemoteIssueLinks` | read | none | `listJiraIssueRemoteIssueLinks` |
| `mcp:listJiraIssueTransitions` | read | none | `listJiraIssueTransitions` |
| `mcp:listJiraIssueWorklogs` | read | none | `listJiraIssueWorklogs` |
| `mcp:listJiraProjectComponents` | read | none | `listJiraProjectComponents` |
| `mcp:listJiraProjectIssueTypesMetadata` | read | none | `listJiraProjectIssueTypesMetadata` |
| `mcp:listJiraProjects` | read | none | `listJiraProjects` |
| `mcp:listJiraStatuses` | read | none | `listJiraStatuses` |
| `mcp:lookupJiraAccountId` | read | none | `lookupJiraAccountId` |
| `mcp:searchJiraIssuesUsingJql` | read | none | `searchJiraIssuesUsingJql` |
| `mcp:addOrEditJiraIssueComment` | send | none | `addOrEditJiraIssueComment` |
| `mcp:addOrEditJiraIssueWorklog` | write | none | `addOrEditJiraIssueWorklog` |
| `mcp:convertJiraIssueHierarchy` | write | none | `convertJiraIssueHierarchy` |
| `mcp:createJiraBoard` | write | none | `createJiraBoard` |
| `mcp:createJiraIssue` | write | none | `createJiraIssue` |
| `mcp:createJiraIssueLink` | write | none | `createJiraIssueLink` |
| `mcp:createJiraIssueRemoteIssueLink` | write | none | `createJiraIssueRemoteIssueLink` |
| `mcp:editJiraEntityProperty` | write | none | `editJiraEntityProperty` |
| `mcp:editJiraIssue` | write | none | `editJiraIssue` |
| `mcp:manageJiraProjectVersion` | write | none | `manageJiraProjectVersion` |
| `mcp:manageJiraProjectVersionRelatedWork` | write | none | `manageJiraProjectVersionRelatedWork` |
| `mcp:manageJiraSprint` | write | none | `manageJiraSprint` |
| `mcp:transitionJiraIssue` | write | none | `transitionJiraIssue` |
| `mcp:uploadAttachmentToJiraIssue` | write | none | `uploadAttachmentToJiraIssue` |
| `mcp:watchJiraIssue` | write | none | `watchJiraIssue` |
| `mcp:deleteJiraComment` | delete | none | `deleteJiraComment` |
| `mcp:deleteJiraIssue` | delete | none | `deleteJiraIssue` |
| `mcp:deleteJiraIssueAttachment` | delete | none | `deleteJiraIssueAttachment` |
| `mcp:createJiraProject` | admin | none | `createJiraProject` |
| `mcp:updateJiraProject` | admin | none | `updateJiraProject` |
| `mcp:updateJiraScreen` | admin | none | `updateJiraScreen` |
| `mcp:downloadJiraIssueAttachment` | export | none | `downloadJiraIssueAttachment` |

### Sources

| Source | Kind | Reads or output | Method | Cost |
|---|---|---|---|---|
| `jira.activity` | events | `issue` | `events_list` | free |

### Actions

None.

### Bus events

`rpc.jira.account`
<!-- /generated:capabilities -->

## Errors

<!-- generated:errors -->
| Code | Meaning |
|---|---|
| `NEEDS_SIGN_IN` | the account is not signed in |
| `SCOPE_MISSING` | the call needs a scope the person has not confirmed |
| `ACCOUNT_REQUIRED` | the plugin serves several accounts and the call names none |
| `ACCOUNT_UNKNOWN` | the call names an alias the plugin does not serve |
| `ACCOUNT_MISMATCH` | the item belongs to another account |
| `CURSOR_INVALID` | the cursor is malformed, or belongs to another source, account or scope |
| `CURSOR_EXPIRED` | the provider no longer keeps the history the cursor names |
| `RATE_LIMITED` | the provider asked the plugin to slow down |
| `BUDGET_EXCEEDED` | the read would cost more than the person allows |
| `SOURCE_DISABLED` | the person turned this source or action off |
| `TOO_LARGE` | the answer is larger than the source's maxBytes |
| `INPUT_INVALID` | the input does not match the method's schema |
| `SOURCE_UNKNOWN` | the plugin declares no such source |
| `SCHEMA_VIOLATION` | an answer does not keep the contract's shape |
| `PERMISSION_DENIED` | the person's grant does not cover the call |
| `PLAN_INVALID` | the plan is missing, or belongs to another method |
| `PLAN_USED` | the plan was already used by an earlier commit |
| `GRANT_INVALID` | the action grant did not verify, or was already spent |
| `HOST_UNTESTED` | OpenCode is outside the plugin's tested range |
| `OPTIONS_INVALID` | the plugin's options do not match their schema |
| `UNAVAILABLE` | the provider could not be reached |
<!-- /generated:errors -->

## Troubleshooting

- **`NEEDS_SIGN_IN`** — the alias's Jira sign-in is missing or expired. Run `/connect`, choose Jira for that alias, then
  run `/jira` and follow its next step.
- **`ACCOUNT_REQUIRED` / `ACCOUNT_UNKNOWN`** — pass `account` as one of the aliases `/jira` lists (`work`, `personal`, …).
  A call with two aliases and no account is refused; so is an alias the plugin does not serve.
- **`CURSOR_INVALID`** — the cursor belongs to another source, alias or scope, or it is malformed. Read again without a
  cursor, or with `since`, and keep the new cursor with its alias.
- **`UNAVAILABLE` with a `jira` or `jira-<alias>` entry** — OpenCode already has an MCP server at that name whose URL is
  not Atlassian's, so the plugin adds nothing and calls nothing. Remove that entry, or set it to
  `https://mcp.atlassian.com/v2/mcp?tools=all`, then reload OpenCode.
- **`HOST_UNTESTED`** — the OpenCode release is outside `>=2.4.1 <2.5.0`. Use OpenCode 2.4.1.
- **`/jira`** prints every alias's state, the agents that lack the access rules and the one next step; `status` is the
  same answer over RPC.

## Docs

- [Plugin contract](https://github.com/we-the-rebel-alliance/plugin-contract)
- [Capabilities](docs/capabilities.md)
- [Configuration](docs/configuration.md)
- [Accounts](docs/accounts.md)
- [Automations](docs/automations.md)
- [Architecture](docs/architecture.md)
- [Security](docs/security.md)
