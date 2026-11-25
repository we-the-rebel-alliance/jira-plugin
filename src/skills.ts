// The plugin's skills, read from `skills/` at the package root and registered through OpenCode's skill editor.
//
// `register` owns the methods, not the skills: a plugin adds skills itself with `ctx.skill.transform`, and the host
// then lists them for the location. A missing or broken file is reported in status, never fatal: the server, the
// access rules and every method still work.
import { existsSync, readdirSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Skill } from "@opencode/plugin"
import { safeReason } from "./redact.ts"

/** `skills/` at the package root: beside `dist/` in the installed package and beside `src/` in the repository. */
export const SKILLS_DIR = fileURLToPath(new URL("../skills/", import.meta.url))

/** Every directory under `skills/` that holds a `SKILL.md`, in path order. */
export function skillNames(directory = SKILLS_DIR): string[] {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(directory, entry.name, "SKILL.md")))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

/** One folded block scalar: line breaks become spaces, a blank line a newline. */
function fold(lines: readonly string[]): string {
  let value = ""
  for (const line of lines) {
    if (line === "") {
      value += "\n"
      continue
    }
    value += value === "" || value.endsWith("\n") ? line : ` ${line}`
  }
  return value
}

/** The frontmatter's keys: one-line values, and `>`/`|` block scalars with optional chomping. */
function frontmatter(text: string, where: string): Map<string, string> {
  const lines = text.split("\n")
  const fields = new Map<string, string>()
  for (let index = 0; index < lines.length; index++) {
    const match = /^([A-Za-z0-9_-]+):(?:[ \t]*(.*))?$/.exec(lines[index] ?? "")
    if (match === null) continue
    const key = match[1] ?? ""
    const raw = (match[2] ?? "").trim()
    const block = /^([>|])([+-]?)$/.exec(raw)
    if (block === null) {
      fields.set(key, raw.replace(/^(["'])(.*)\1$/, "$2"))
      continue
    }
    const collected: string[] = []
    let next = index + 1
    for (; next < lines.length; next++) {
      const line = lines[next] ?? ""
      if (line.trim() === "") {
        collected.push("")
        continue
      }
      if (!/^[ \t]/.test(line)) break
      collected.push(line)
    }
    index = next - 1
    const indented = collected.filter((line) => line.trim() !== "")
    const indentation = indented.length === 0 ? 0 : Math.min(...indented.map((line) => (/^[ \t]*/.exec(line)?.[0].length ?? 0)))
    const body = collected.map((line) => line.slice(Math.min(indentation, line.length)))
    let trailing = 0
    while (body.length > 0 && body[body.length - 1] === "") {
      body.pop()
      trailing++
    }
    let value = block[1] === "|" ? body.join("\n") : fold(body)
    if (block[2] === "+") value += "\n".repeat(trailing)
    else if (block[2] !== "-" && body.length > 0) value += "\n"
    if (value === "") throw new Error(`${where} has no description`)
    fields.set(key, value)
  }
  return fields
}

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
  const fields = frontmatter(match[1] ?? "", where)
  if (fields.get("name") !== name) throw new Error(`${where} must be named "${name}" in its frontmatter`)
  const description = fields.get("description")
  if (description === undefined || description === "" || description === ">" || description === "|") throw new Error(`${where} has no description`)
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
  const names = skillNames(directory)
  if (names.length === 0) problems.push(notLoaded("skills", "skills/ has no SKILL.md"))
  for (const name of names) {
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
