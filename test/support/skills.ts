import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

export interface Skill {
  readonly file: string
  readonly name?: string
  readonly description?: string
}

/** The front-matter field T0 reads, quoted or plain. */
function field(text: string, key: string): string | undefined {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const at = lines.findIndex((line) => new RegExp(`^${key}\\s*:`).test(line))
  if (at === -1) return undefined
  const raw = (lines[at] ?? "").replace(new RegExp(`^${key}\\s*:\\s*`), "").trim()
  return raw.replace(/^["']|["']$/g, "")
}

/** Every `skills/**\/SKILL.md`, in path order. */
export function skillsOf(): Skill[] {
  const root = fileURLToPath(new URL("../../skills", import.meta.url))
  const found: Skill[] = []
  const walk = (at: string) => {
    for (const entry of readdirSync(at).sort()) {
      const path = join(at, entry)
      if (statSync(path).isDirectory()) {
        walk(path)
        continue
      }
      if (entry !== "SKILL.md") continue
      const text = readFileSync(path, "utf8")
      const end = text.indexOf("\n---", 4)
      const matter = text.startsWith("---") ? text.slice(4, end === -1 ? undefined : end) : ""
      const name = field(matter, "name")
      const description = field(matter, "description")
      found.push({
        file: `skills/${path.slice(root.length + 1)}`,
        ...(name === undefined ? {} : { name }),
        ...(description === undefined ? {} : { description }),
      })
    }
  }
  walk(root)
  return found
}
