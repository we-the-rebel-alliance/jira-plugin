---
name: jira-write
description: >
  Before a Jira change through the account's pass-through tools: create or edit an item,
  transition, comment, log time, link, attach, watch, move a sprint or manage a version.
---
# Changes in Jira

Every change is the vendor's own pass-through tool on the account's MCP server: the plugin declares the tool's class and
the access rule, but the tool's schema and its call belong to the vendor. The alias selects the server, so the `work`
account's tools and the `personal` account's tools never mix.

## Before the call

Make a change only when the person asked for it. Before each change, write one sentence in your reply naming what the
call does and **whom it reaches**, then make the call in the same turn. That sentence is chat text, not a question:
under `ask-changes` the permission prompt is the person's yes, and under `read-only` the call is denied.

Jira emails people. A project's notification scheme decides, and the safe assumption is that watchers, the assignee, the
reporter and every account the text mentions are emailed. Say who, before the call. An item is a permanent record: an
edit keeps the old value in its history.

Ask in chat first only when something must be chosen: the site (while the `jira` skill has not settled it), the item
when a search matches more than one, or the transition when an item has several.

## What each change reaches

- **create:** a new item the whole project sees, and its notifications email the assignee, reporter and watchers.
- **edit:** fields change for everyone who can see the item, the old values stay in its history, and a mention emails
  that person.
- **transition:** a status change every board and report shows; it may set the sprint or the backlog, and a project
  automation may run.
- **comment:** everyone on the item sees it, and **every account it mentions is emailed**; an edit notifies again.
- **worklog:** logged time changes time-tracking totals and reports, and the project sees the hours and the comment.
- **link / remote link:** a link visible on both items, and the watchers of both are notified; an internal-only target
  leaks its address.
- **attach:** a local file leaves the machine, and everyone who can see the item can download it.
- **watch:** changes only the person's own notification state.
- **sprint / version / board:** a board-wide or project-wide change, and a release or an archive is a milestone every
  report sees.
- **convert hierarchy:** the type and parent change, so every board and filter keyed on type changes, and watchers are
  emailed.
- **delete:** permanent and not offered by the pinned sign-in. If the tool is absent, say the sign-in does not grant it;
  do not look for a workaround.

## Access

`ask-changes` asks for every write, send, delete, admin and export call; `read-only` denies them. The rule is per alias:
a grant or rule for one account never reaches another's tools. There is no plan or commit step in this plugin: the
vendor's tool is the change, and the person's confirmation is the rule or the prompt the skill describes.
