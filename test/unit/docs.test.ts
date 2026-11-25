// Documentation is checked against the code, not against prose: the access table is compared with the contract's own
// `effectFor` for every class and level, the install line names the released tag,
// and model-facing text names no other product and no undeclared tool.
import { readFileSync } from "node:fs"
import { ACCESS_LEVELS, effectFor } from "@we-the-rebel-alliance/plugin-contract/access"
import { METHOD_CLASSES } from "@we-the-rebel-alliance/plugin-contract/manifest"
import { describe, expect, test } from "vitest"
import { manifest } from "../../src/manifest.ts"
import { skillsOf } from "../support/skills.ts"

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")

/** The access table as docs/configuration.md writes it: one row per contract class. */
function documentedAccess(): Map<string, Record<string, string>> {
  const text = read("docs/configuration.md")
  const rows = new Map<string, Record<string, string>>()
  for (const match of text.matchAll(/^\| `([a-z]+)` \| (allow|ask|deny) \| (allow|ask|deny) \| (allow|ask|deny) \|$/gm)) {
    const [, klass, all, ask, readOnly] = match
    if (klass === undefined || all === undefined || ask === undefined || readOnly === undefined) continue
    rows.set(klass, { all, "ask-changes": ask, "read-only": readOnly })
  }
  return rows
}

describe("the documented access table", () => {
  test("has one row per contract class", () => {
    expect([...documentedAccess().keys()].sort()).toEqual([...METHOD_CLASSES].sort())
  })

  test("matches effectFor for every class and level", () => {
    const table = documentedAccess()
    for (const klass of METHOD_CLASSES) {
      const row = table.get(klass)
      expect(row, `docs/configuration.md documents no ${klass} row`).toBeDefined()
      for (const level of ACCESS_LEVELS) {
        expect(row?.[level], `docs/configuration.md: ${klass} at ${level}`).toBe(effectFor({ class: klass }, level))
      }
    }
  })

  test("every method's class appears in the table", () => {
    const table = documentedAccess()
    for (const [method, item] of Object.entries(manifest.methods)) expect(table.has(item.class), `${method} is class ${item.class}`).toBe(true)
  })
})

describe("the install line", () => {
  test("names the released tag and claims no absence of releases", () => {
    const text = read("README.md")
    expect(text).toContain("github:we-the-rebel-alliance/jira-plugin#v0.0.0")
    expect(text).not.toMatch(/no release/i)
    expect(text).not.toMatch(/there is no release/i)
  })
})

describe("model-facing text", () => {
  test("skill descriptions are at most 300 characters, and the names are jira and jira-write", () => {
    const skills = skillsOf()
    expect(skills.map((skill) => skill.name).sort()).toEqual(["jira", "jira-write"])
    for (const skill of skills) {
      expect(skill.description, skill.file).toBeDefined()
      expect((skill.description ?? "").length, skill.file).toBeLessThanOrEqual(300)
    }
  })

  test("a skill never writes a server-prefixed tool name", () => {
    for (const skill of skillsOf()) {
      const text = readFileSync(new URL(`../../${skill.file}`, import.meta.url), "utf8")
      expect(text, skill.file).not.toMatch(/\bjira(?:-[a-z0-9]+)?_[a-z]/)
    }
  })
})
