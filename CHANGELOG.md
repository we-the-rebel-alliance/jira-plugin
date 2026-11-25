# Changelog

## 0.0.0 (2026-11-25)

The plugin is ready for `v0.0.0`: the greenfield rebuild onto plugin-contract v0.

- Two or more Jira accounts at once, one vendor MCP server per alias (`jira`, `jira-<alias>`), each with its own
  sign-in; an optional `site` cloud id narrows `events_list`.
- `events_list` lists the work items that changed for the signed-in person, oldest first, with a cursor bound to the
  plugin, the source and the alias.
- `probe` names the signed-in owner; `status` reports the plugin, the host range, every alias and the next step.
- Atlassian's 55 Jira MCP tools are declared in `methods` with their contract classes and passed through unchanged.
- Generated access rules from the contract's `access` module; the `account` bus event on a server state change.
- The pinned six-scope sign-in; adoption of a person's own server entry at the same address, and a clean refusal of any
  other.
- Docs, skills and `AGENTS.md` written fresh; conformance recorded for two synthetic aliases; host and pack tests.
- Skills (`jira`, `jira-write`) are registered at setup with `ctx.skill.transform` and listed by the real 2.4.1 host; a real-host test proves both ids and the `/jira` command.

### Removed since v0.0.6

- The `jira.issues` list snapshot source: removed in 4a. `jira.activity` is the plugin's one source; work items are read through the vendor tools or the activity feed.
- The TUI dialog export and the `/jira-status` command: replaced by the `/jira` text status command. The TUI is optional in the standard.
- The old `jira.issues` RPC id: the contract uses one RPC id, `<name>` (`jira`), for every method.
- The old status fields outside contract §11 (server, account, sites, tools and the destructive grouping): `status` now answers the contract's `STATUS_SCHEMA`, and `/jira` prints it.
