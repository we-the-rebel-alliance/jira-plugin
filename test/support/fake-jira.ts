// A faithful fake of the Atlassian MCP boundary the provider calls: one tool executor per alias and vendor tool, the
// three tools the plugin's own methods use, JQL's minute window, and pagination. People, sites and issues are invented.
import type { ExecutorContext, Provider } from "../../src/provider/atlassian.ts"

export const NOW = Date.parse("2026-11-25T12:00:00.000Z")

export interface FakePerson {
  readonly accountId: string
  readonly displayName: string
}

export interface FakeIssue {
  readonly id: string
  readonly key: string
  readonly summary: string
  /** Jira's own timestamp shape, which `jiraTime` normalises. */
  readonly updated: string
  readonly status: string
  readonly category: string
  readonly type: string
  readonly priority: string
  readonly assignee: FakePerson
  readonly reporter: FakePerson
}

export interface FakeSite {
  readonly cloudId: string
  readonly url: string
  readonly issues: readonly FakeIssue[]
}

export interface FakeAccount {
  readonly person: FakePerson
  readonly sites: readonly FakeSite[]
}

const ana = { accountId: "acc-work-ana", displayName: "Ana Silva" }
const kai = { accountId: "acc-work-kai", displayName: "Kai Mensah" }
const anaHome = { accountId: "acc-personal-ana", displayName: "Ana Silva" }
const rowan = { accountId: "acc-personal-rowan", displayName: "Rowan Vale" }

/** The synthetic accounts the conformance fixture records. */
export const FIXTURE_ACCOUNTS: Readonly<Record<string, FakeAccount>> = {
  work: {
    person: ana,
    sites: [
      {
        cloudId: "cloud-work-1",
        url: "https://acme-work.atlassian.net",
        issues: [
          {
            id: "1042",
            key: "OPS-42",
            summary: "Queue migration notes",
            updated: "2026-11-25T09:00:00.000+0000",
            status: "In Progress",
            category: "In Progress",
            type: "Task",
            priority: "High",
            assignee: ana,
            reporter: kai,
          },
          {
            id: "1043",
            key: "OPS-43",
            summary: "Rehearsal passed",
            updated: "2026-11-25T10:30:00.000+0000",
            status: "Done",
            category: "Done",
            type: "Story",
            priority: "Medium",
            assignee: kai,
            reporter: ana,
          },
        ],
      },
      {
        cloudId: "cloud-work-2",
        url: "https://ops-work.atlassian.net",
        issues: [
          {
            id: "1044",
            key: "OPS-44",
            summary: "Handover",
            updated: "2026-11-25T10:00:00.000+0000",
            status: "To Do",
            category: "To Do",
            type: "Bug",
            priority: "Low",
            assignee: ana,
            reporter: ana,
          },
        ],
      },
    ],
  },
  personal: {
    person: anaHome,
    sites: [
      {
        cloudId: "cloud-personal-1",
        url: "https://ana-home.atlassian.net",
        issues: [
          {
            id: "7007",
            key: "HOME-7",
            summary: "Weekend",
            updated: "2026-11-24T18:00:00.000+0000",
            status: "To Do",
            category: "To Do",
            type: "Task",
            priority: "Low",
            assignee: anaHome,
            reporter: rowan,
          },
        ],
      },
    ],
  },
}

const epoch = (value: string) => Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"))
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** The vendor's server name for an alias, as contract §3 derives it. */
export const serverFor = (alias: string) => (alias === "default" ? "jira" : `jira-${alias}`)

/** One issue as Atlassian's search answers it. */
function issueJson(issue: FakeIssue) {
  return {
    id: issue.id,
    key: issue.key,
    fields: {
      summary: issue.summary,
      updated: issue.updated,
      status: { name: issue.status, statusCategory: { name: issue.category } },
      issuetype: { name: issue.type },
      priority: { name: issue.priority },
      assignee: { accountId: issue.assignee.accountId, displayName: issue.assignee.displayName },
      reporter: { accountId: issue.reporter.accountId, displayName: issue.reporter.displayName },
    },
  }
}

export class FakeJira {
  readonly calls: { alias: string; tool: string; input: Readonly<Record<string, unknown>> }[] = []
  private accounts: Record<string, FakeAccount>

  constructor(accounts: Readonly<Record<string, FakeAccount>> = FIXTURE_ACCOUNTS) {
    this.accounts = clone(accounts)
  }

  /** Replace one account's issues, for a test that needs a burst, a secret or two updates in one second. */
  set(alias: string, account: FakeAccount): void {
    this.accounts = { ...this.accounts, [alias]: clone(account) }
  }

  call(alias: string, tool: string, input: Readonly<Record<string, unknown>>): unknown {
    this.calls.push({ alias, tool, input })
    const account = this.accounts[alias]
    if (account === undefined) throw new Error(`the fake has no account ${alias}`)
    if (tool === "atlassianUserInfo") return { data: { accountId: account.person.accountId, displayName: account.person.displayName } }
    if (tool === "getAccessibleAtlassianResources") {
      return {
        data: {
          resources: account.sites.map((site) => ({ id: site.cloudId, url: site.url, name: site.cloudId, products: [{ id: "jira" }] })),
        },
      }
    }
    if (tool === "searchJiraIssuesUsingJql") return this.search(account, input)
    throw new Error(`the fake has no tool ${tool}`)
  }

  private search(account: FakeAccount, input: Readonly<Record<string, unknown>>) {
    const cloudId = String(input.cloudId ?? "")
    const site = account.sites.find((entry) => entry.cloudId === cloudId)
    if (site === undefined) throw new Error(`the fake has no site ${cloudId} for this account`)
    const jql = String(input.jql ?? "")
    const window = /updated >= "-(\d+)m"/.exec(jql)
    if (window === null) throw new Error(`the fake cannot read the JQL ${jql}`)
    const cutoff = NOW - Number(window[1]) * 60_000
    const matched = site.issues
      .filter((issue) => epoch(issue.updated) >= cutoff)
      .sort((left, right) => epoch(left.updated) - epoch(right.updated) || left.key.localeCompare(right.key))
    const max = typeof input.maxResults === "number" ? input.maxResults : 100
    const start = typeof input.nextPageToken === "string" ? Number(input.nextPageToken) : 0
    const page = matched.slice(start, start + max)
    const more = start + page.length < matched.length
    return {
      data: {
        issues: page.map(issueJson),
        ...(more ? { nextPageToken: String(start + page.length) } : { isLast: true }),
      },
    }
  }

  /** The three tools as OpenCode executors, one server per alias. */
  executors(): { id: string; execute: (input: unknown, context: ExecutorContext) => Promise<unknown> }[] {
    const tools = ["atlassianUserInfo", "getAccessibleAtlassianResources", "searchJiraIssuesUsingJql"] as const
    return Object.keys(this.accounts).flatMap((alias) =>
      tools.map((tool) => ({
        id: `${serverFor(alias)}_${tool}`,
        execute: async (input: unknown) => ({ output: this.call(alias, tool, (input ?? {}) as Record<string, unknown>) }),
      })),
    )
  }

  /** What `ctx.mcp.list()` answers for these servers: connected unless a test says otherwise. */
  mcpList(statuses: Readonly<Record<string, "connected" | "needs_auth" | "pending" | "disabled" | "failed">> = {}, errors: Readonly<Record<string, string>> = {}) {
    return {
      data: Object.keys(this.accounts).map((alias) => {
        const status = statuses[alias] ?? "connected"
        const error = errors[alias] ?? "the fake failed"
        return {
          name: serverFor(alias),
          status: status === "failed" ? { status, error } : status === "needs_auth" ? { status, error } : { status },
        }
      }),
    }
  }

  /** The provider the handlers call, with its MCP server state. */
  provider(statuses: Readonly<Record<string, "connected" | "needs_auth" | "pending" | "disabled" | "failed">> = {}, errors: Readonly<Record<string, string>> = {}): Provider {
    return {
      call: async (alias, tool, input) => this.call(alias, tool, input),
      serverState: async (alias) => {
        const status = statuses[alias] ?? "connected"
        return { status, ...(status === "failed" || status === "needs_auth" ? { error: errors[alias] ?? "the fake failed" } : {}) }
      },
    }
  }
}
