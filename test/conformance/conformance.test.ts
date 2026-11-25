// The conformance recording: the whole `fixtures/conformance.json`, computed from the real handlers over the fake
// Atlassian boundary for two synthetic aliases. `RECORD=1` writes it; every other run deep-equals the committed file and
// never writes. `plugin-kit check` replays the same file against T0 and the real 2.4.1 host.
import { readFileSync, writeFileSync } from "node:fs"
import { resolveAccount } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { RegisterError } from "@we-the-rebel-alliance/plugin-contract/register"
import { describe, expect, test } from "vitest"
import { manifest } from "../../src/manifest.ts"
import { PACKAGE, SOURCE_ID } from "../../src/provider/activity.ts"
import { FakeJira } from "../support/fake-jira.ts"
import { handlerDeps, methodCall, TEST_OPTIONS } from "../support/deps.ts"

const path = new URL("../../fixtures/conformance.json", import.meta.url)
const SINCE = "2026-11-25T11:30:00.000Z"

function refusedCode(result: { ok: boolean; code?: string }): string {
  if (result.ok) throw new Error("the account resolved, and this case expects a refusal")
  return result.code ?? "NO_CODE"
}

async function computed() {
  const { handlers, deps, profiles } = handlerDeps(new FakeJira(), TEST_OPTIONS)

  const workPage = await handlers.events_list.run({ source: "jira" }, methodCall("work"))
  const emptyPage = await handlers.events_list.run({ source: "jira", since: SINCE }, methodCall("work"))
  const personalPage = await handlers.events_list.run({ source: "jira" }, methodCall("personal"))
  const probeWork = await handlers.probe.run({ source: "jira" }, methodCall("work"))
  await handlers.probe.run({ source: "jira" }, methodCall("personal"))

  const required = resolveAccount(profiles, {})
  const unknown = resolveAccount(profiles, { account: "nobodyhere" })
  const crossed = await handlers.events_list.run({ source: "jira", cursor: (workPage as { cursor: string }).cursor }, methodCall("personal")).catch((error: unknown) => error)
  if (!(crossed instanceof RegisterError)) throw new Error("the crossed cursor did not refuse with a RegisterError")
  const status = await handlers.status.run({}, methodCall("work"))

  return {
    $comment:
      "Recorded from the plugin's own handlers over a fake Atlassian MCP boundary: two mcp accounts (work and personal), one events source, probes for both, and the status answer. Every person, site, issue and key is invented; the fixture is redaction-free by construction.",
    plugin: PACKAGE,
    accounts: {
      real: true,
      aliases: deps.aliases,
      required: { method: "events_list", code: refusedCode(required) },
      unknown: { method: "events_list", account: "nobodyhere", code: refusedCode(unknown) },
      cursors: [{ method: "events_list", account: "work", other: "personal", code: crossed.refusal.code }],
    },
    sources: {
      [SOURCE_ID]: {
        cases: [
          { name: "the work account's configured site", input: { source: "jira" }, expect: "page", answer: workPage },
          { name: "a since after every update", input: { source: "jira", since: SINCE }, expect: "empty", answer: emptyPage },
          { name: "the personal account's own site", input: { source: "jira" }, expect: "page", answer: personalPage },
        ],
        probe: { input: { source: "jira", account: "work" }, answer: probeWork },
      },
    },
    events: { emitted: ["account"], status },
    namespace: manifest.plugin.summary,
  }
}

describe("fixtures/conformance.json", () => {
  test("is what the handlers answer for two synthetic aliases", async () => {
    const fixture = await computed()
    const text = `${JSON.stringify(fixture, null, 2)}\n`
    if (process.env.RECORD === "1") {
      writeFileSync(path, text)
      return
    }
    expect(text).toBe(readFileSync(path, "utf8"))
  })
})
