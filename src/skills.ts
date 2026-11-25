// The plugin's skills, read from `skills/` at the package root and registered through OpenCode's skill editor.
//
// `register` owns the methods, not the skills: a plugin adds skills itself with `ctx.skill.transform`, and the host
// then lists them for the location. A missing or broken file is reported in status, never fatal: the server, the
// access rules and every method still work.
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Skill } from "@opencode/plugin"
import { safeReason } from "./redact.ts"

/** `skills/` at the package root: beside `dist/` in the installed package and beside `src/` in the repository. */
export const SKILLS_DIR = fileURLToPath(new URL("../skills/", import.meta.url))

/** The skills the plugin ships. The host test reads the same list. */
export const SKILL_NAMES: readonly string[] = ["jira", "jira-write"]

/** `UNAVAILABLE: What happened. Next step: What to do.`, as one status line. */
function notLoaded(name: string, why: string): string {
  const reason = why.replace(/[.\s]+$/, "")
  return `UNAVAILABLE: The "${name}" skill was not loaded: ${reason}. Next step: Reinstall the plugin.`
}

/** Parses `---` frontmatter with `name` and `description`, then a non-empty body. */
export function parseSkill(name: string, path: string, text: string): Skill.Info {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"))
  const where = `skills/${name}/SKILL.md`
  if (match === null) throw new Error(`${where} has no frontmatter`)
  const fields = new Map<string, string>()
  for (const line of (match[1] ?? "").split("\n")) {
    const at = line.indexOf(":")
    if (at <= 0) continue
    fields.set(line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^(["'])(.*)\1$/, "$2"))
  }
  if (fields.get("name") !== name) throw new Error(`${where} must be named "${name}" in its frontmatter`)
  const description = fields.get("description")
  if (description === undefined || description === "") throw new Error(`${where} has no description`)
  const content = (match[2] ?? "").trim()
  if (content === "") throw new Error(`${where} has no body`)
  return {
    id: Skill.ID.make(name),
    name: Skill.Name.make(name),
    description,
    path: Skill.Info.fields.path.make(path),
    content,
  }
}

/** Reads every shipped skill; a broken one becomes a status problem, never a failed setup. */
export async function loadSkills(directory = SKILLS_DIR): Promise<{ skills: Skill.Info[]; problems: string[] }> {
  const skills: Skill.Info[] = []
  const problems: string[] = []
  for (const name of SKILL_NAMES) {
    const path = join(directory, name, "SKILL.md")
    try {
      skills.push(parseSkill(name, path, await readFile(path, "utf8")))
    } catch (error) {
      const code = (error as { code?: unknown }).code
      const why = code === "ENOENT" ? `skills/${name}/SKILL.md is missing` : error instanceof Error ? error.message : `skills/${name}/SKILL.md cannot be read (${safeReason(error)})`
      problems.push(notLoaded(name, why))
    }
  }
  return { skills, problems }
}
