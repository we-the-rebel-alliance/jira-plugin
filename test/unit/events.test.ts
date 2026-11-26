import { describe, expect, test } from "vitest"
import { RegisterError } from "@we-the-rebel-alliance/plugin-contract/register"
import type { EventsListResult } from "@we-the-rebel-alliance/plugin-contract/events"
import { FakeJira, NOW, type FakeSite } from "../support/fake-jira.ts"
import { createHandlers } from "../../src/handlers/index.ts"
import { ProviderError } from "../../src/provider/atlassian.ts"
import { handlerDeps, methodCall, TEST_OPTIONS } from "../support/deps.ts"

const events = (answer: unknown) => answer as EventsListResult & { events: { external_id: string; title: string; labels: string[]; url: string | null }[] }

async function call(handler: ReturnType<typeof handlerDeps>["handlers"], input: Record<string, unknown>, account = "work") {
  return events(await handler.events_list.run(input, methodCall(account)))
}

const refusal = async (promise: Promise<unknown>) => {
  const error = await promise.catch((cause: unknown) => cause)
  expect(error).toBeInstanceOf(RegisterError)
  return error as RegisterError
}

describe("the Jira activity page", () => {
  test("a profile's site narrows the read to that site, oldest first", async () => {
    const { handlers, fake } = handlerDeps()
    const page = await call(handlers, { source: "jira" })
    expect(page.source).toBe("jira")
    expect(page.account).toBe("work")
    expect(page.owner).toEqual({ id: "atlassian:acc-work-ana", label: "Ana Silva" })
    expect(page.trust).toBe("untrusted")
    expect(page.events.map((event) => event.external_id)).toEqual(["cloud-work-1/1042@2026-11-25T09:00:00.000Z", "cloud-work-1/1043@2026-11-25T10:30:00.000Z"])
    expect(page.events.map((event) => event.title)).toEqual(["OPS-42: Queue migration notes", "OPS-43: Rehearsal passed"])
    expect(page.events[0]?.url).toBe("https://acme-work.atlassian.net/browse/OPS-42")
    expect(page.events[0]?.labels).toEqual(["type:task", "status:in-progress"])
    expect(page.more).toBe(false)
    expect(page.asOf).toBe("2026-11-25T12:00:00.000Z")
    // The second work site was never searched: the profile names cloud-work-1.
    expect(fake.calls.filter((entry) => entry.tool === "searchJiraIssuesUsingJql").map((entry) => entry.input.cloudId)).toEqual(["cloud-work-1"])
  })

  test("without a site, every Jira site the sign-in reaches is read", async () => {
    const { handlers } = handlerDeps(new FakeJira(), { access: "all", accounts: { work: {}, personal: {} } })
    const page = await call(handlers, { source: "jira" })
    expect(page.events.map((event) => event.external_id)).toEqual([
      "cloud-work-1/1042@2026-11-25T09:00:00.000Z",
      "cloud-work-2/1044@2026-11-25T10:00:00.000Z",
      "cloud-work-1/1043@2026-11-25T10:30:00.000Z",
    ])
  })

  test("one site's failure becomes a failed entry while the other sites still list", async () => {
    const { deps } = handlerDeps(new FakeJira(), { access: "all", accounts: { work: {}, personal: {} } })
    const base = deps.provider
    const handlers = createHandlers({
      ...deps,
      provider: {
        ...base,
        call: async (alias, tool, input, context) => {
          if (tool === "searchJiraIssuesUsingJql" && input.cloudId === "cloud-work-2") {
            throw new ProviderError("UNAVAILABLE", "the site did not answer", "Try again later.")
          }
          return base.call(alias, tool, input, context)
        },
      },
    })
    const page = await call(handlers, { source: "jira" })
    expect(page.events.map((event) => event.title)).toEqual(["OPS-42: Queue migration notes", "OPS-43: Rehearsal passed"])
    expect(page.failed).toEqual([{ external_id: "cloud-work-2", code: "UNAVAILABLE" }])
    expect(page.more).toBe(true)
  })

  test("the personal account reads its own site and owner", async () => {
    const { handlers } = handlerDeps()
    const page = await call(handlers, { source: "jira" }, "personal")
    expect(page.account).toBe("personal")
    expect(page.owner).toEqual({ id: "atlassian:acc-personal-ana", label: "Ana Silva" })
    expect(page.events.map((event) => event.title)).toEqual(["HOME-7: Weekend"])
  })

  test("a cursor lists what came after it, and nothing twice", async () => {
    const { handlers } = handlerDeps()
    const first = await call(handlers, { source: "jira" })
    const second = await call(handlers, { source: "jira", cursor: first.cursor })
    expect(second.events).toEqual([])
    expect(second.more).toBe(false)
  })

  test("limit one pages one event at a time", async () => {
    const { handlers } = handlerDeps()
    const first = await call(handlers, { source: "jira", limit: 1 })
    expect(first.events.map((event) => event.title)).toEqual(["OPS-42: Queue migration notes"])
    expect(first.more).toBe(true)
    const second = await call(handlers, { source: "jira", limit: 1, cursor: first.cursor })
    expect(second.events.map((event) => event.title)).toEqual(["OPS-43: Rehearsal passed"])
    expect(second.more).toBe(false)
  })

  test("a since after every update answers an empty page", async () => {
    const { handlers } = handlerDeps()
    const page = await call(handlers, { source: "jira", since: "2026-11-25T11:30:00.000Z" })
    expect(page.events).toEqual([])
    expect(page.more).toBe(false)
    expect(page.cursor.length).toBeGreaterThan(0)
  })

  test("a cursor issued for work is CURSOR_INVALID under personal", async () => {
    const { handlers } = handlerDeps()
    const work = await call(handlers, { source: "jira" }, "work")
    const error = await refusal(call(handlers, { source: "jira", cursor: work.cursor }, "personal"))
    expect(error.refusal.code).toBe("CURSOR_INVALID")
    expect(error.message).toContain("Next step: ")
  })

  test("an unknown source is SOURCE_UNKNOWN", async () => {
    const { handlers } = handlerDeps()
    const error = await refusal(call(handlers, { source: "other" }))
    expect(error.refusal.code).toBe("SOURCE_UNKNOWN")
  })

  test("a configured site the sign-in does not reach is OPTIONS_INVALID", async () => {
    const { handlers } = handlerDeps(new FakeJira(), { access: "all", accounts: { work: { site: "cloud-missing" }, personal: {} } })
    const error = await refusal(call(handlers, { source: "jira" }))
    expect(error.refusal.code).toBe("OPTIONS_INVALID")
    expect(error.message).toContain("cloud-missing")
  })

  test("an event holding a credential is refused for good, and the cursor moves past it", async () => {
    // Assembled at run time so the repository never commits a token-shaped literal; `screenEvents` sees a real shape.
    const token = ["ghp", "0123456789abcdefghijklmnopqrstuvwxyz"].join("_")
    const fake = new FakeJira()
    const site: FakeSite = {
      cloudId: "cloud-work-1",
      url: "https://acme-work.atlassian.net",
      issues: [
        {
          id: "1042",
          key: "OPS-42",
          summary: "Queue migration notes",
          updated: "2026-11-25T09:00:00.000+0000",
          status: token,
          category: "In Progress",
          type: "Task",
          priority: "High",
          assignee: { accountId: "acc-work-ana", displayName: "Ana Silva" },
          reporter: { accountId: "acc-work-kai", displayName: "Kai Mensah" },
        },
      ],
    }
    fake.set("work", { person: { accountId: "acc-work-ana", displayName: "Ana Silva" }, sites: [site] })
    const { handlers } = handlerDeps(fake)
    const page = await call(handlers, { source: "jira" })
    expect(page.events).toEqual([])
    expect(page.refused?.map((entry) => entry.reason)).toEqual(["secret"])
    expect(page.refused?.[0]?.external_id).toBe("cloud-work-1/1042@2026-11-25T09:00:00.000Z")
  })

  test("two work items updated in the same second are both listed once, in id order", async () => {
    const fake = new FakeJira()
    const base = {
      summary: "Same second",
      updated: "2026-11-25T11:00:00.000+0000",
      status: "To Do",
      category: "To Do",
      type: "Task",
      priority: "Low",
      assignee: { accountId: "acc-work-ana", displayName: "Ana Silva" },
      reporter: { accountId: "acc-work-ana", displayName: "Ana Silva" },
    }
    fake.set("work", {
      person: { accountId: "acc-work-ana", displayName: "Ana Silva" },
      sites: [{ cloudId: "cloud-work-1", url: "https://acme-work.atlassian.net", issues: [{ ...base, id: "2000", key: "OPS-50" }, { ...base, id: "1999", key: "OPS-49" }] }],
    })
    const { handlers } = handlerDeps(fake)
    const page = await call(handlers, { source: "jira" })
    expect(page.events.map((event) => event.title)).toEqual(["OPS-49: Same second", "OPS-50: Same second"])
  })

  test("two items updated in the same second split across a one-item page boundary with no skip or duplicate", async () => {
    const fake = new FakeJira()
    const base = {
      summary: "Same second",
      updated: "2026-11-25T11:00:00.000+0000",
      status: "To Do",
      category: "To Do",
      type: "Task",
      priority: "Low",
      assignee: { accountId: "acc-work-ana", displayName: "Ana Silva" },
      reporter: { accountId: "acc-work-ana", displayName: "Ana Silva" },
    }
    fake.set("work", {
      person: { accountId: "acc-work-ana", displayName: "Ana Silva" },
      sites: [{ cloudId: "cloud-work-1", url: "https://acme-work.atlassian.net", issues: [{ ...base, id: "2000", key: "OPS-50" }, { ...base, id: "1999", key: "OPS-49" }] }],
    })
    const { handlers } = handlerDeps(fake)
    // The first page starts from a since window; every next page carries only the cursor, never a lost filter.
    const first = await call(handlers, { source: "jira", since: "2026-11-25T10:00:00.000Z", limit: 1 })
    expect(first.events.map((event) => event.title)).toEqual(["OPS-49: Same second"])
    expect(first.more).toBe(true)
    const second = await call(handlers, { source: "jira", limit: 1, cursor: first.cursor })
    expect(second.events.map((event) => event.title)).toEqual(["OPS-50: Same second"])
    expect(second.events[0]?.external_id).not.toBe(first.events[0]?.external_id)
    const third = await call(handlers, { source: "jira", limit: 1, cursor: second.cursor })
    expect(third.events).toEqual([])
    expect(third.more).toBe(false)
    const ids = [...first.events, ...second.events, ...third.events].map((event) => event.external_id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })

  test("the request is built from the fixed clock, not the wall clock", async () => {
    const { handlers, fake } = handlerDeps()
    await call(handlers, { source: "jira" })
    const search = fake.calls.find((entry) => entry.tool === "searchJiraIssuesUsingJql")
    expect(String(search?.input.jql)).toContain(`updated >= "-${Math.max(1, Math.ceil((NOW - (NOW - 24 * 3_600_000)) / 60_000)) + 2}m"`)
    expect(search?.input.fields).toEqual(["summary", "updated", "assignee", "reporter", "status", "issuetype", "priority"])
  })
})

describe("the profile the fixture records", () => {
  test("is the one the conformance test uses", () => {
    expect(TEST_OPTIONS).toEqual({ access: "all", accounts: { work: { site: "cloud-work-1" }, personal: {} } })
  })
})
