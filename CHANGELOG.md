# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.0.0 (unreleased)

The first release of `@we-the-rebel-alliance/jira-plugin`, rebuilt greenfield on OpenCode 2.4.1.

### Changed

- The package is `@we-the-rebel-alliance/jira-plugin`, version `0.0.0`, with every repository URL, install line and
  doc link pointing at `we-the-rebel-alliance/jira-plugin`.
- OpenCode 2.4.1 exactly: the `@opencode/*` devDependencies pin `2.4.1` (with `effect` `4.1.0`), the host range is
  `>=2.4.1 <2.5.0`, and `2.4.1` is the one tested release.
- The `jira` namespace line is one line of 304 characters, and the two skill descriptions are 234 and 206.

### Removed

- The `jira.issues` list snapshot and its read path: the tools RPC `events_list` method has no `list` input, and
  `jira.activity` is the plugin's one source.
- `docs/jelly.md`, the Jelly declaration's prose, and the status field `deniedTools` (use `destructiveTools`).
- The stock-host matrices and code paths for OpenCode before 2.4.1.
