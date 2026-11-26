# Capabilities

Every method, source, action and bus event the manifest declares.

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

## Notes

### `status`

The plugin's identity, version, the OpenCode range it was tested on, every alias's state, the agents whose rules no
longer give the generated rules their effect, and one next step. It reads each alias's MCP server state and the owner a
probe last read; it never calls Atlassian for content.

### `probe`

One `atlassianUserInfo` read through the alias's server, and nothing else: the account alias, the owner id
(`atlassian:<account id>`) and the display name as the label. It fills the owner status shows.

### `events_list`

One page of Jira activity for the account, oldest first, with a cursor bound to the plugin, the source and the alias. A
work item is listed once per read that finds it updated, not once per change: Jira's search exposes only the latest
update. The event carries the key and summary, the update time, the status, type and priority, the assignee and
reporter, and a link on the item's `*.atlassian.net` site; never a description, comment or field value. A page is at
most 64 KB.

The `site` profile field narrows `events_list` to one cloud id. Without it, the read covers every Jira site the sign-in
reaches, up to eight; more than eight is refused with a next step naming the `site` option.

### The pass-through MCP tools

The `mcp:<tool>` rows are Atlassian's own tools, one server per alias. This plugin declares their class so access and grants
can treat them correctly, but it registers no tool and no handler for them: the vendor's server owns their schemas and
their calls. The alias selects the server, so a rule or grant for `work` never reaches `personal`'s tools.

- **read:** search and read work items, boards, sprints, dashboards, filters, projects, versions, statuses, users,
  comments, changelogs, worklogs, link types, remote links and attachment metadata.
- **write:** create and edit items, links and remote links, transition an item, log work, attach a file, watch an item,
  convert a hierarchy, manage sprints and versions, create a board, and write an entity property.
- **send:** `addOrEditJiraIssueComment` delivers text other people read.
- **delete:** `deleteJiraComment`, `deleteJiraIssue` and `deleteJiraIssueAttachment` remove a resource by name.
- **admin:** `createJiraProject`, `updateJiraProject` and `updateJiraScreen` change project or screen settings for
  everyone.
- **export:** `downloadJiraIssueAttachment` mints a short-lived signed link and returns a local download command, so
  content leaves the provider.

The pinned sign-in scope grants Jira read, write and search only. Atlassian therefore does not load the three
`manage_jira` reads (`getJiraScreen`, `getJiraWorkflowEditorLink`, `getJiraWorkflows`) or the delete and administration
tools; the manifest still declares them, so a wider sign-in of the person's own stays fenced by the same rules. A tool
the server does not list answers `UNAVAILABLE` with a next step.

### The `jira.activity` source

One events source, read by `events_list`. It declares the three vendor operations its read asserts
(`atlassianUserInfo`, `getAccessibleAtlassianResources`, `searchJiraIssuesUsingJql`), no scope, a suggested cadence of
five minutes, `private: true`, `cost: free`, a 64 KB page, and links only on `*.atlassian.net`.

### The `account` bus event

The plugin emits `account` when an alias's MCP server changes state, with `{ account, state }` where state is `ready`,
`needs_sign_in` or `error`. It emits no `changed`: every write is the vendor's own pass-through tool, and the plugin
cannot see those calls.
