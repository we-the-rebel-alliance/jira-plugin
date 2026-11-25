import { describe, expect, test } from "vitest"
import { parseSkill } from "../../src/skills.ts"

const file = (frontmatter: string, body = "# Jira\n\nBody.\n") => `---\nname: jira\n${frontmatter}\n---\n${body}`

describe("the skill frontmatter", () => {
  test("reads a folded description", () => {
    const skill = parseSkill("jira", "/tmp/skills/jira/SKILL.md", file("description: >\n  Read Jira work\n  items."))
    expect(skill.description).toBe("Read Jira work items.\n")
  })

  test("reads a literal description", () => {
    const skill = parseSkill("jira", "/tmp/skills/jira/SKILL.md", file("description: |\n  Read Jira work\n  items."))
    expect(skill.description).toBe("Read Jira work\nitems.\n")
  })

  test("reads a one-line description, quoted or plain", () => {
    expect(parseSkill("jira", "/tmp/a", file('description: "Read Jira work items."')).description).toBe("Read Jira work items.")
    expect(parseSkill("jira", "/tmp/a", file("description: Read Jira work items.")).description).toBe("Read Jira work items.")
  })

  test("honours the strip chomping indicator", () => {
    expect(parseSkill("jira", "/tmp/a", file("description: >-\n  Read Jira work\n  items.")).description).toBe("Read Jira work items.")
  })

  test("an empty block or a bare marker is an error", () => {
    expect(() => parseSkill("jira", "/tmp/a", file("description: >"))).toThrow(/has no description/)
    expect(() => parseSkill("jira", "/tmp/a", file("description: |"))).toThrow(/has no description/)
    expect(() => parseSkill("jira", "/tmp/a", file("description: >\n# Body"))).toThrow(/has no description/)
  })

  test("the name must match the directory", () => {
    expect(() => parseSkill("jira-write", "/tmp/a", file('description: "x"'))).toThrow(/must be named "jira-write"/)
  })
})
