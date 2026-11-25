// The real @opencode/sdk 2.4.1 host, which the kit's createHost does not use for skills: a plugin adds skills through
// `ctx.skill.transform`, and only the SDK's own `skill.list` shows what the location actually loaded. The same host
// answers `command.list`, where the `/jira` status command must appear.
import "./isolate.ts"
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath, pathToFileURL } from "node:url"
import { describe, expect, test } from "vitest"
import { parse as parseYaml } from "yaml"
import { ROOT } from "./isolate.ts"

const root = fileURLToPath(new URL("../..", import.meta.url))
const work = join(ROOT, "work")
mkdirSync(work, { recursive: true })
const location = { directory: work }

describe("the built plugin on the real 2.4.1 SDK host", () => {
  test(
    "registers both skills and the /jira command for the location",
    { timeout: 120_000 },
    async () => {
      const entry = join(root, "dist", "index.js")
      expect(existsSync(entry), "dist/index.js is missing; run npm run bundle before the host tests").toBe(true)
      const plugin = ((await import(pathToFileURL(entry).href)) as { default: unknown }).default
      const { OpenCode } = (await import("@opencode/sdk")) as typeof import("@opencode/sdk")
      const skillsRoot = join(root, "skills")
      const expected = readdirSync(skillsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(skillsRoot, entry.name, "SKILL.md")))
        .map((entry) => entry.name)
        .sort()
        .map((name) => {
          const text = readFileSync(join(skillsRoot, name, "SKILL.md"), "utf8").replace(/\r\n/g, "\n")
          const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? ""
          const description = (parseYaml(front) as { description?: unknown }).description
          expect(typeof description, `${name}'s description is not a string`).toBe("string")
          expect(description, `${name}'s description is empty`).not.toBe("")
          expect(description, `${name}'s description is the literal ">"`).not.toBe(">")
          expect(description, `${name}'s description is the literal "|"`).not.toBe("|")
          return { id: name, description: description as string }
        })
      expect(expected.length, "no skills/*/SKILL.md found").toBeGreaterThan(0)
      const config = join(ROOT, "config")
      mkdirSync(config, { recursive: true })
      const client = await OpenCode.create({
        plugins: [plugin as never],
        app: { version: "2.4.1" },
        config: { content: "{}", directory: config, project: false, claude: false },
        database: { path: join(ROOT, "opencode.db") },
        models: { fetch: false },
        fs: { filewatcher: false },
        log: { level: "error" },
      })
      try {
        let state: string | undefined
        for (const until = Date.now() + 60_000; Date.now() < until; ) {
          const { data } = await client.plugin.list({ location })
          const found = data.find((item: { id: string; state?: { status?: string; error?: string } }) => item.id === "jira")
          if (found?.state?.status === "failed") throw new Error(`the jira plugin failed: ${found.state.error}`)
          state = found?.state?.status
          if (state === "active") break
          await sleep(100)
        }
        expect(state).toBe("active")

        const { data: skills } = await client.skill.list({ location })
        const listed = new Map<string, { description?: string }>(
          skills.map((skill: { id: unknown; description?: string }) => [String(skill.id), skill]),
        )
        for (const skill of expected) {
          const registered = listed.get(skill.id)
          expect(registered, `the host lists no ${skill.id} skill`).toBeDefined()
          expect(registered?.description, `${skill.id}'s registered description`).toBe(skill.description)
        }
        expect([...listed.keys()].filter((id) => expected.some((skill) => skill.id === id)).sort()).toEqual(expected.map((skill) => skill.id))

        const { data: commands } = await client.command.list({ location })
        expect(commands.map((command: { name: string }) => command.name)).toContain("jira")
      } finally {
        await client.close()
      }
    },
  )
})
