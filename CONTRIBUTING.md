# Contributing

This repository is a plugin on
[plugin-contract](https://github.com/we-the-rebel-alliance/plugin-contract) v0 and follows
[the plugin standard](https://github.com/we-the-rebel-alliance/plugin-contract/blob/master/docs/plugin-standard.md).
Read the standard and `AGENTS.md` before changing anything; where this file is silent, they decide.

## Setup

```sh
npm ci
npm run check
```

There are no runtime dependencies: everything the plugin uses is bundled into `dist/index.js`, except
`@opencode/plugin` and Node built-ins, which the host provides.

## What the checks run

| Command | Checks |
|---|---|
| `npm run lint` | Biome over the repository |
| `npm run typecheck` | TypeScript, strict, no emit |
| `npm run bundle` | esbuild to `dist/index.js`, and that it imports only the host module and Node built-ins; `dist/` is committed, so regenerate it and commit the change |
| `npx plugin-kit docs --check` | the generated doc sections match the manifest |
| `npm test` | unit, conformance (compares `fixtures/conformance.json`) and host tests on the built plugin |
| `npx plugin-kit check` | conformance T0 and T1 on the real 2.4.1 host, the doc file set, forbidden patterns, no bundled kit |
| `npm run test:pack` | packs the tarball, asserts its file set, installs it with an isolated HOME and loads it |

`npm run check` runs all of them in that order. The host-binding checks run one repository at a time on a shared
machine.

## Changing the manifest

`capabilities` in `package.json` is the source of truth. A new vendor tool is an `mcp:<tool>` row with its class and
`accounts: "none"`; a new method of the plugin's own needs a handler in `src/handlers/` and a test. After a manifest
change run `npx plugin-kit docs` and commit the generated sections; do not edit them by hand.

## The conformance fixture

`fixtures/conformance.json` is computed by `test/conformance/conformance.test.ts` from the handlers over a fake
Atlassian boundary for two synthetic aliases. It contains no real account and no secret. To rewrite it:

```sh
RECORD=1 npm test
```

Every other run compares the file and fails on a difference; nothing rewrites it by accident. Review the diff before
committing: a changed page shape or status answer is a behaviour change.

## Commits and pull requests

- Conventional commits, small and honest.
- A pull request says what changed, why, the spec section it follows, and the exact commands and counts it ran.
- `dist/` is committed and regenerated with `npm run bundle`; never edit it by hand. Never commit `node_modules/`, a tarball or a secret.

## Releases

The maintainers cut releases with `plugin-kit release` on `master`; the tag workflow publishes the npm package tarball
(`*.tgz`), `conformance.json` and `SHA256SUMS` with the pinned hashes. Do not publish from a branch.
