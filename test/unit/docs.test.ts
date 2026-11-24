// The docs and skills must match the code: tool names, error codes, the tested releases, the fixed-context budget and
// the install and uninstall lines. Every count they state is checked against src/jira-tools.ts, so a change there cannot
// leave a stale number behind.
import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { CODES, NAMESPACE_DESCRIPTION, TESTED_HOSTS, UNTESTED_EXAMPLE } from "../../src/constants.js"
import { DESTRUCTIVE_TOOLS, EVENTS_TOOL, EXPORT_TOOLS, PARAMETERS, PROBE_METHOD, READ_TOOLS, WRITE_TOOLS } from "../../src/jira-tools.js"
import { METHODS, NEXT_STEPS, TOOLS_RPC_ID } from "../../src/tools-rpc.js"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))
// Everything a user or the model reads about the current release.
const FILES = [
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "AGENTS.md",
  ...readdirSync(join(ROOT, "docs")).map((name) => `docs/${name}`),
  ...readdirSync(join(ROOT, "skills")).map((name) => `skills/${name}/SKILL.md`),
]
const KNOWN = [...READ_TOOLS, ...EXPORT_TOOLS, ...WRITE_TOOLS, ...DESTRUCTIVE_TOOLS]
/** What the docs may name besides Jira's tools: the source's own `jira_events_list` and `jira_probe`. */
const OWN = [EVENTS_TOOL, PROBE_METHOD]
const REPO = "github:we-the-rebel-alliance/jira-plugin"
const raw = (file: string) => readFileSync(join(ROOT, file), "utf8")
const text = (file: string) => raw(file).replace(/\s+/g, " ")
const skillFiles = readdirSync(join(ROOT, "skills")).map((name) => [`${name}`, readFileSync(join(ROOT, "skills", name, "SKILL.md"), "utf8")] as const)

describe("docs", () => {
  test.each(FILES)("%s states no count of read, write or declared tools that could go stale", (file) => {
    const counts = [...text(file).matchAll(/\b\d+ (?:known )?(?:read|write)(?:s\b| tools\b| read-only)/g)].map((match) => match[0])
    const stale = counts.filter((count) => !count.startsWith(`${READ_TOOLS.length} read`) && !count.startsWith(`${WRITE_TOOLS.length} write`))
    expect(stale).toEqual([])
  })

  test.each(FILES)("%s names only Jira tools the plugin knows", (file) => {
    const named = [...text(file).matchAll(/\bjira_([a-zA-Z][A-Za-z0-9]*)(?![\w*])/g)].map((match) => match[1]!)
    expect(named.filter((tool) => !KNOWN.includes(tool) && !OWN.includes(tool))).toEqual([])
  })

  test.each(FILES)("%s says nothing provisional or pending", (file) => {
    expect(text(file)).not.toMatch(/provisional|not yet (?:checked|published|signed)|private package|TODO/i)
  })

  test.each(FILES)("%s points at this repository, on master", (file) => {
    const source = raw(file)
    expect(source).not.toContain("joe-broadhead")
    expect(source).not.toContain("opencode-jira")
    for (const match of source.matchAll(/https:\/\/github\.com\/([^)\s]+)/g)) {
      const url = match[1]!
      expect({ file, org: url.startsWith("we-the-rebel-alliance/") }).toEqual({ file, org: true })
      if (/^(?:blob|tree)\//.test(url.slice("we-the-rebel-alliance/jira-plugin/".length))) {
        expect({ file, url }).toEqual({ file, url: expect.stringMatching(/^we-the-rebel-alliance\/jira-plugin\/(?:blob|tree)\/master\//) })
      }
    }
    for (const match of source.matchAll(/https:\/\/raw\.githubusercontent\.com\/([^)\s]+)/g)) {
      expect({ file, url: match[1] }).toEqual({ file, url: expect.stringMatching(/^we-the-rebel-alliance\/jira-plugin\/master\//) })
    }
  })

  test("the README installs from a release tag, never from an untagged repository, and names the first release", () => {
    const readme = text("README.md")
    const installs = [...raw("README.md").matchAll(/opencode plugin add ([^\s`]+)/g)].map((match) => match[1]!)
    expect(installs).toEqual([`${REPO}#v<version>`])
    expect(readme).toContain(`"package": "${REPO}#v<version>"`)
    expect(readme).toContain("The first release on plugin-contract is `v0.0.0` (phase 4b).")
    expect(readme).toContain("the repository carries no `dist/`, and OpenCode runs no build when it installs from Git.")
  })

  test("the README's first lines say every tool is allowed by default", () => {
    expect(text("README.md")).toContain("Every tool is allowed by default.")
  })

  test("the docs need no API token, and document the token entry without a credential", () => {
    expect(text("README.md")).toContain("No API token is needed or used.")
    expect(text("docs/configuration.md")).toContain("An API-token entry, for a headless machine")
    expect(text("docs/configuration.md")).toContain('"oauth": false')
    for (const file of FILES) {
      // No credential value of any kind, and no plaintext Basic value.
      expect(text(file)).not.toMatch(/Bearer [A-Za-z0-9_-]{8,}|"Authorization": "Basic [A-Za-z0-9+/=]{8,}/)
    }
  })

  test("keeps the CLI sign-in and sign-out commands, with the folder and cold-start caveat, and /connect first", () => {
    const caveat = "To sign out, or to switch account, run `opencode mcp logout jira` from the project folder where the plugin is installed, or remove the account in `/connect` → **Jira**. If it answers `MCP server not found: jira`, OpenCode is still opening that folder: wait a few seconds and run it again."
    expect(text("README.md")).toContain(caveat)
    // `mcp auth` carries the same folder and retry advice.
    expect(text("README.md")).toContain("Run it from the project folder where the plugin is installed; if it answers `MCP server not found: jira`, OpenCode is still opening that folder: wait a few seconds and run it again")
    expect(text("skills/jira/SKILL.md")).toContain("run from the project folder, and if it answers `MCP server not found: jira`, wait a few seconds and run it again")
    // The status next step and the tools RPC's AUTH_REQUIRED name `mcp auth`, so each carries the retry.
    for (const file of ["src/status.ts", "src/tools-rpc.ts"]) {
      expect(text(file)).toContain("run it from the project folder, and if it answers MCP server not found:")
    }
    // The Uninstall offers /connect first, and the CLI from the project folder second.
    const uninstall = /## Uninstall(.*?)## Links/.exec(text("README.md"))?.[1] ?? ""
    expect(uninstall.indexOf("/connect")).toBeGreaterThanOrEqual(0)
    expect(uninstall.indexOf("/connect")).toBeLessThan(uninstall.indexOf("opencode mcp logout jira"))
    expect(text("README.md")).toContain("Signed in to the wrong Atlassian account | Remove the account in `/connect` → Jira")
  })

  // Once the plugin is removed and OpenCode reloads, `mcp logout jira` finds no server: sign out first.
  test("the README's Uninstall signs out before it removes the plugin", () => {
    const uninstall = /## Uninstall(.*?)## Links/.exec(text("README.md"))?.[1] ?? ""
    const logout = uninstall.indexOf("opencode mcp logout jira")
    const list = uninstall.indexOf("opencode auth list")
    const remove = uninstall.indexOf(`opencode plugin remove ${REPO}`)
    expect(logout).toBeGreaterThanOrEqual(0)
    expect(list).toBeGreaterThan(logout)
    expect(remove).toBeGreaterThan(list)
  })

  // One typed code table (CODES in src/constants.ts). `jiraError`, `errorText` and `codeText` take a PluginCode, so a
  // code outside it does not compile; this finds any code that escaped the helpers, and keeps the README's table equal to
  // the table in both directions.
  test("every code raised in src/ is in CODES, and every non-rpc code in CODES is raised", () => {
    const sources = readdirSync(join(ROOT, "src")).filter((name) => name.endsWith(".ts")).map((name) => [name, readFileSync(join(ROOT, "src", name), "utf8")] as const)
    const found = new Set(sources.flatMap(([, source]) => [...source.matchAll(/(?:jiraError|errorText|codeText)\(\s*"([A-Z][A-Z_]+)"/g)].map((match) => match[1]!)))
    // A code written into a message template, such as `STATUS_UNAVAILABLE: ...`, is caught here too.
    for (const [, source] of sources) for (const match of source.matchAll(/`([A-Z][A-Z0-9]*_[A-Z0-9_]+): /g)) found.add(match[1]!)
    expect([...found].filter((code) => !(code in CODES))).toEqual([])
    const declared = Object.entries(CODES).filter(([, entry]) => entry.surface !== "rpc").map(([code]) => code)
    expect(declared.filter((code) => !found.has(code))).toEqual([])
  })

  test("the tools RPC's next steps are exactly the rpc codes in CODES", () => {
    const rpc = Object.entries(CODES).filter(([, entry]) => entry.surface === "rpc").map(([code]) => code)
    expect(Object.keys(NEXT_STEPS).sort()).toEqual(rpc.sort())
  })

  test("the README's Errors table is CODES, in both directions, with the same surface and when", () => {
    const errors = /## Errors\n([\s\S]*?)\n## /.exec(raw("README.md"))?.[1] ?? ""
    const rows = [...errors.matchAll(/\| `([A-Z][A-Z_]+)` \| ([a-z-]+) \| ([^|]+?) \|/g)].map(([, code, surface, when]) => [code!, { surface: surface!, when: when!.trim() }] as const)
    expect(Object.fromEntries(rows)).toEqual(CODES)
  })

  test("the configuration guide documents the setup and status codes, and the scripting guide the rpc ones", () => {
    const errors = /## Errors([\s\S]*?)## /.exec(text("docs/configuration.md"))?.[1] ?? ""
    const setup = Object.entries(CODES).filter(([, entry]) => entry.surface !== "rpc").map(([code]) => code)
    expect([...errors.matchAll(/\| `([A-Z][A-Z_]+)` \|/g)].map((match) => match[1]!).sort()).toEqual(setup.sort())
    const scripting = /## Errors([\s\S]*?)## What scripts cannot do/.exec(text("docs/scripting.md"))?.[1] ?? ""
    for (const [code, entry] of Object.entries(CODES)) expect({ code, named: entry.surface !== "rpc" || scripting.includes(`\`${code}\``) }).toEqual({ code, named: true })
    const named = [...scripting.matchAll(/`([A-Z][A-Z_]+)`/g)].map((match) => match[1]!)
    expect(named.filter((code) => !(code in CODES))).toEqual([])
  })

  // R8: every "tested on ..." mention is TESTED_HOSTS, and the untested example is a version that is not a release.
  test("every tested-on mention equals TESTED_HOSTS, and the untested example is not a tested release", () => {
    let mentions = 0
    const check = (file: string, source: string) => {
      for (const match of source.matchAll(/tested on /g)) {
        mentions += 1
        // The run of versions right after "tested on", across a line wrap, and nothing else.
        const run = /^\s*((?:\d+\.\d+\.\d+)(?:(?:,[ \t]*|\s+and\s+)(?:\d+\.\d+\.\d+))*)/.exec(source.slice(match.index! + match[0].length))?.[1] ?? ""
        expect({ file, versions: [...(run.match(/\d+\.\d+\.\d+/g) ?? [])] }).toEqual({ file, versions: [...TESTED_HOSTS] })
      }
    }
    for (const file of ["README.md", "AGENTS.md", "SECURITY.md", "docs/configuration.md"]) check(file, raw(file))
    // The changelog's first section is the current, unreleased one.
    const changelog = /## 0\.0\.0 \(unreleased\)\n([\s\S]*?)(?:\n## |$)/.exec(raw("CHANGELOG.md"))?.[1] ?? ""
    expect(changelog.length).toBeGreaterThan(0)
    check("CHANGELOG.md (0.0.0)", changelog)
    expect(mentions).toBeGreaterThanOrEqual(2)
    // The places that list the releases without the words "tested on" name the same one.
    const list = TESTED_HOSTS.length === 1 ? TESTED_HOSTS[0]! : `${TESTED_HOSTS.slice(0, -1).join(", ")} and ${TESTED_HOSTS.at(-1)}`
    for (const file of ["AGENTS.md", "docs/configuration.md", "CONTRIBUTING.md"]) expect({ file, list: text(file).includes(list) }).toEqual({ file, list: true })
    // The example of a release the checks do not run on is 2.5.0, never the tested one.
    expect(text("docs/configuration.md")).toContain(UNTESTED_EXAMPLE)
    for (const version of TESTED_HOSTS) expect(text("docs/configuration.md")).not.toContain(`inside the range, such as ${version}`)
  })

  // R9: shipped text states behaviour, never who decided it, and names no lane.
  test("the shipped docs use no internal wording", () => {
    const banned = /\bowner(?:'s)? (?:decision|ruling|sign-off|call)\b|\bthe lead(?:'s)? (?:decision|ruling|audit|report|review)\b|\bhey-\w+\s*#|\b(?:audit|review|reconcile) lane\s+[A-Z]\d\b|\blane\s+G\d\b/i
    for (const file of FILES) expect({ file, hit: banned.exec(text(file))?.[0] }).toEqual({ file, hit: undefined })
  })

  // R1: every example runs the RPC this plugin registers, with the location header and the envelope, and names a method
  // in the table. A `<method>` placeholder names no method, but it must still carry the header and the body shape.
  test("every scripting example has the RPC id, the location header, the envelope, and a method in the table", () => {
    const names = new Set(["describe", ...METHODS.map((method) => method.name)])
    let examples = 0
    for (const file of ["docs/scripting.md", "README.md"]) {
      // A shell continuation joins its line, so one example is one logical line.
      const source = raw(file).replace(/\\\n\s*/g, " ")
      for (const match of source.matchAll(/opencode api post (\/api\/rpc\/[^\s/]+\/([A-Za-z0-9._<>-]+))[ \t]+([^\n]*)/g)) {
        examples += 1
        const [, path, method] = match
        const placeholder = method!.startsWith("<")
        expect({ file, path }).toEqual({ file, path: `/api/rpc/${TOOLS_RPC_ID}/${method}` })
        if (!placeholder) expect({ file, method, known: names.has(method!) }).toEqual({ file, method, known: true })
        const line = match[0]
        expect({ file, header: line.includes(`-H "x-opencode-directory:$PWD"`) }).toEqual({ file, header: true })
        if (placeholder) continue
        // The body may run over several lines: join the continuation lines before parsing it.
        const window = source.slice(match.index!, match.index! + match[0].length + 400).replace(/\n\s+(?=["}])/g, "")
        const body = /-d '(\{[^']*\})'/.exec(window)
        expect({ file, body: body !== null }).toEqual({ file, body: true })
        const parsed = JSON.parse(body![1]!) as { input?: { sessionID?: unknown; input?: unknown } }
        expect({ file, envelope: typeof parsed.input }).toEqual({ file, envelope: "object" })
        // `describe` takes nothing, or one session: its envelope holds no nested input. Every other method names the
        // session the script runs as, and passes the tool's own input.
        const session = typeof parsed.input!.sessionID
        if (method === "describe") {
          expect({ file, session: session === "string" || session === "undefined" }).toEqual({ file, session: true })
          expect({ file, keys: Object.keys(parsed.input!).filter((key) => key !== "sessionID") }).toEqual({ file, keys: [] })
          continue
        }
        expect({ file, session }).toEqual({ file, session: "string" })
        expect({ file, input: typeof parsed.input!.input }).toEqual({ file, input: "object" })
        // An MCP method's real input is the server's, so only the parameters the plugin records are checked.
        const recorded = PARAMETERS[method!]
        if (recorded) {
          const keys = Object.keys(parsed.input!.input as Record<string, unknown>)
          const known = recorded.map((entry) => entry.split(":")[0]!.replace(/\*$/, ""))
          expect({ file, method, unknown: keys.filter((key) => !known.includes(key)) }).toEqual({ file, method, unknown: [] })
          expect({ file, method, missing: known.filter((name) => recorded.some((entry) => entry.startsWith(`${name}*:`)) && !keys.includes(name)) }).toEqual({ file, method, missing: [] })
        }
      }
    }
    expect(examples).toBeGreaterThanOrEqual(3)
  })

  test("the scripting guide points at the known reads, and gives Atlassian's rate limits, the cloudId and one call at a time", () => {
    const guide = text("docs/scripting.md")
    expect(guide).toContain("(`READ_TOOLS` in `src/jira-tools.ts`)")
    expect(guide).toContain("`Retry-After`")
    expect(guide).toContain("`X-RateLimit-Remaining`")
    expect(guide).toContain("Every call needs a `cloudId`")
    expect(guide).toContain("one at a time")
    expect(guide).toContain("Rovo credits")
  })

  test("the README's limits say the tool table comes from Atlassian's docs", () => {
    expect(text("README.md")).toContain("The tool table comes from Atlassian's docs")
    expect(text("README.md")).not.toContain("has not been reconciled with a live tool list")
  })
})

// Rule 4's fixed-context budget (T0 static): the namespace line at most 400 characters, each skill description at most
// 300. The namespace is what Code Mode shows on every turn; a skill's description is what OpenCode advertises.
describe("the fixed context", () => {
  test("the namespace line is one line of at most 400 characters", () => {
    expect(NAMESPACE_DESCRIPTION.length).toBeLessThanOrEqual(400)
    expect(NAMESPACE_DESCRIPTION).not.toContain("\n")
    expect(NAMESPACE_DESCRIPTION.length).toBeGreaterThan(0)
  })

  test.each(skillFiles)("%s describes itself in one line of at most 300 characters", (name, source) => {
    const description = /^description: (.*)$/m.exec(source)?.[1] ?? ""
    expect({ name, length: description.length, oneLine: !description.includes("\n") }).toEqual({ name, length: expect.any(Number), oneLine: true })
    expect({ name, within: description.length > 0 && description.length <= 300 }).toEqual({ name, within: true })
  })

  test("no doc or skill names a tool outside this plugin", () => {
    // Every tool-shaped name in the shipped text is one of this plugin's, its own two, or a host or neighbour tool the
    // text names on purpose with its owner's prefix. The plugin never invents a foreign `jira_*` name.
    for (const file of FILES) {
      const named = [...text(file).matchAll(/\bjira_([a-zA-Z][A-Za-z0-9]*)(?![\w*])/g)].map((match) => match[1]!)
      expect({ file, unknown: named.filter((tool) => !KNOWN.includes(tool) && !OWN.includes(tool)) }).toEqual({ file, unknown: [] })
    }
  })
})
