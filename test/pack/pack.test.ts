// Pack and prove the published shape.
//
// Deviation from standard §8: `opencode plugin add` on this machine (OpenCode 2.4.1) refuses a local path — "Plugin
// target must be an npm registry package or Git package specifier" — and answers the same for `file:` and an `npm:`
// prefix. So the last test installs the tarball with `npm install --offline` into a project with an isolated HOME,
// links the repository's `@opencode/plugin` beside it, and loads the installed package through the kit's real host
// resolver: exactly the packed entry, from the packed directory, on the real 2.4.1 host. The release-ready proof in the
// PR uses the CLI itself, `opencode plugin add github:...#<pushed sha>`.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createHost } from "@we-the-rebel-alliance/plugin-contract/kit"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

const root = fileURLToPath(new URL("../..", import.meta.url))
const work = realpathSync(mkdtempSync(join(realpathSync("/tmp"), "jira-pack-")))
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { name: string; version: string; files: string[] }

interface Packed {
  readonly filename: string
  readonly size: number
  readonly entryCount: number
  readonly files: { readonly path: string }[]
}

let packed: Packed

const run = (command: string, args: string[], cwd: string, env: Record<string, string> = {}) =>
  execFileSync(command, args, { cwd, encoding: "utf8", env: { ...process.env, ...env } })

beforeAll(() => {
  run("npm", ["run", "bundle"], root)
  const output = run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", work], root)
  const [first] = JSON.parse(output) as Packed[]
  if (first === undefined) throw new Error("npm pack answered no tarball")
  packed = first
}, 120_000)

afterAll(() => rmSync(work, { recursive: true, force: true }), 120_000)

describe("the packed tarball", () => {
  test("holds exactly the files the package declares, and the built entry", () => {
    const paths = packed.files.map((file) => file.path).sort()
    expect(paths).toEqual(
      ["package.json", "README.md", "LICENSE", "NOTICE", "dist/index.js", "skills/jira/SKILL.md", "skills/jira-write/SKILL.md", "assets/icon.svg", "assets/icon-128.png", "assets/icon-256.png"].sort(),
    )
    expect(paths.some((path) => path.startsWith("fixtures/") || path.startsWith("node_modules/") || path.endsWith(".ts"))).toBe(false)
    const notice = execFileSync("tar", ["-xOzf", join(work, packed.filename), "package/NOTICE"], { cwd: work, encoding: "utf8" })
    expect(notice).toContain("yaml 2.9.1 (ISC)")
    expect(notice).toContain("@we-the-rebel-alliance/plugin-contract 0.0.0 (MIT)")
    expect(notice).toContain("zod 4.6.7 (MIT)")
    expect(notice).toContain("Public Suffix List (MPL-2.0)")
    expect(packed.size).toBeLessThan(200 * 1024)
  })

  test("the packed entry imports only Node built-ins and the host module", () => {
    const text = execFileSync("tar", ["-xOzf", join(work, packed.filename), "package/dist/index.js"], { cwd: work, encoding: "utf8" })
    const specifiers = new Set<string>()
    for (const match of text.matchAll(/\b(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g)) if (match[1] !== undefined) specifiers.add(match[1])
    const outside = [...specifiers].filter((specifier) => !/^node:/.test(specifier) && specifier !== "@opencode/plugin").sort()
    expect(outside).toEqual([])
    expect(specifiers.has("@opencode/plugin")).toBe(true)
  })

  test(
    "installs with scripts disabled and loads from the installed package on the real 2.4.1 host",
    { timeout: 120_000 },
    async () => {
      const project = join(work, "project")
      const home = join(work, "home")
      mkdirSync(project)
      mkdirSync(home)
      const env = {
        HOME: home,
        XDG_CONFIG_HOME: join(home, ".config"),
        XDG_DATA_HOME: join(home, ".local", "share"),
        XDG_CACHE_HOME: join(home, ".cache"),
        XDG_STATE_HOME: join(home, ".local", "state"),
        npm_config_cache: join(home, ".npm"),
      }
      execFileSync("sh", ["-c", `printf '%s' '{"name":"jira-pack-project","private":true,"type":"module"}' > package.json`], { cwd: project, env: { ...process.env, ...env } })
      run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", join(work, packed.filename)], project, env)

      const installed = join(project, "node_modules", ...pkg.name.split("/"))
      expect(existsSync(join(installed, "dist", "index.js"))).toBe(true)
      expect(existsSync(join(installed, "skills", "jira", "SKILL.md"))).toBe(true)

      mkdirSync(join(project, "node_modules", "@opencode"), { recursive: true })
      symlinkSync(join(root, "node_modules", "@opencode", "plugin"), join(project, "node_modules", "@opencode", "plugin"))

      const host = await createHost({
        directory: installed,
        version: "2.4.1",
        pluginId: "jira",
        options: { access: "all", accounts: { work: {}, personal: {} } },
      })
      try {
        expect(host.failure).toBeUndefined()
        expect(host.definition?.id).toBe("jira")
        expect(host.tools.map((tool) => tool.id).sort()).toEqual(["jira_events_list", "jira_probe", "jira_status"])
        const answer = await host.call("status", {})
        expect(answer.ok).toBe(true)
      } finally {
        await host.close()
      }
    },
  )
})
