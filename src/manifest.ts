// The manifest is the installed package's `capabilities` key, read from disk where the contract reads it (contract §4).
//
// Reading package.json rather than copying the declaration into TypeScript keeps one source of truth: the bundle and
// the conformance kit hash the same text. `dist/index.js` resolves this at the package root, and the source tree
// resolves the repository's package.json.
import { readFileSync } from "node:fs"
import type { Manifest } from "@we-the-rebel-alliance/plugin-contract/manifest"

interface Package {
  readonly name: string
  readonly version: string
  readonly capabilities: Manifest
}

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as Package

/** The plugin's manifest: the same value `capabilities` holds in package.json. */
export const manifest: Manifest = pkg.capabilities
/** The installed package's version, for status. */
export const version: string = pkg.version
/** The package name every page names. */
export const packageName: string = pkg.name
