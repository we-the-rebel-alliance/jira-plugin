# Changelog

## [0.0.0] - 2026-11-25

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
