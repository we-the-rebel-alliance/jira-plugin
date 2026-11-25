// The account capture: the display name and the site names, kept in memory and forgotten on sign-out.
import { afterEach, describe, expect, test } from "bun:test"
import { captureAccount, nameOf, sitesOf, watchAccount } from "../../src/account.js"

type Event = { type: string; data: { server?: string } }

/** An event stream the test drives, ended by the subscriber's signal. */
function events() {
  const listeners = new Set<(event: Event) => void>()
  const subscribe = ({ signal }: { signal: AbortSignal }) => {
    const queue: Event[] = []
    let wake: (() => void) | undefined
    const listener = (event: Event) => (queue.push(event), wake?.())
    listeners.add(listener)
    signal.addEventListener("abort", () => (listeners.delete(listener), wake?.()))
    return {
      async *[Symbol.asyncIterator]() {
        while (!signal.aborted) {
          if (queue.length) yield queue.shift()!
          else await new Promise<void>((resolve) => (wake = resolve))
        }
      },
    }
  }
  return { subscribe, emit: (type: string, data: Event["data"] = {}) => listeners.forEach((listener) => listener({ type, data })) }
}

// Invented values, with everything the plugin must not read beside them.
const USER = { account_id: "5b10a2844c20165700ede21g", name: "Sam Okafor\u0007", email: "sam.okafor@example.com", picture: "https://avatar.example/u/1" }
const SITES = [
  { id: "cloud-1", url: "https://acme.atlassian.net", name: "Acme", scopes: ["read:jira-work"], avatarUrl: "https://avatar.example/a" },
  { id: "cloud-2", url: "https://sandbox.atlassian.net", name: "Sandbox" },
]

const stops: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop()
})
const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

async function watch(ownSignIn?: () => boolean, owned?: () => boolean) {
  const stream = events()
  const state = { server: "connected", forgotten: 0 }
  const account = await watchAccount(
    {
      mcp: { list: async () => ({ data: [{ name: "jira", status: { status: state.server } }] }) },
      event: { subscribe: stream.subscribe },
    } as never,
    ownSignIn,
    owned,
    () => void state.forgotten++,
  )
  stops.push(account.stop)
  return { account, state, stream }
}

describe("nameOf", () => {
  test("reads the display name alone: no account id, email or avatar", () => {
    expect(nameOf({ output: USER })).toBe("Sam Okafor")
    expect(nameOf({ content: [{ type: "text", text: JSON.stringify(USER) }] })).toBe("Sam Okafor")
    // The userinfo shape one level down, and the other field names Atlassian uses.
    expect(nameOf({ output: { user: { displayName: "Alex Rivera" } } })).toBe("Alex Rivera")
    expect(nameOf({ output: { me: { display_name: "Globex Admin" } } })).toBe("Globex Admin")
    expect(JSON.stringify(nameOf({ output: USER }))).not.toMatch(/5b10a284|sam\.okafor|avatar/)
  })

  test("cuts a long name, and ignores results without a usable one", () => {
    expect(nameOf({ output: { name: "x".repeat(200) } })!).toHaveLength(80)
    for (const result of [{}, { output: "not json" }, { output: [1] }, { content: [{ type: "image" }] }, { output: { name: 3 } }, { output: { name: "  " } }]) expect(nameOf(result)).toBeUndefined()
  })
})

describe("sitesOf", () => {
  test("reads the site names in order: no cloud id, URL, scope or avatar", () => {
    expect(sitesOf({ output: SITES })).toEqual(["Acme", "Sandbox"])
    expect(sitesOf({ output: { sites: SITES } })).toEqual(["Acme", "Sandbox"])
    expect(sitesOf({ output: { resources: SITES } })).toEqual(["Acme", "Sandbox"])
    expect(sitesOf({ content: [{ type: "text", text: JSON.stringify(SITES) }] })).toEqual(["Acme", "Sandbox"])
    expect(JSON.stringify(sitesOf({ output: SITES }))).not.toMatch(/cloud-|atlassian\.net|read:jira-work|avatar/)
  })

  test("deduplicates, keeps ten, cuts a long name, and reports an empty list as empty", () => {
    expect(sitesOf({ output: [SITES[0]!, SITES[0]!] })).toEqual(["Acme"])
    expect(sitesOf({ output: Array.from({ length: 14 }, (_, index) => ({ id: `c${index}`, name: `Site ${index}` })) })).toHaveLength(10)
    expect(sitesOf({ output: [{ id: "c1", name: "y".repeat(200) }] })?.[0]).toHaveLength(40)
    expect(sitesOf({ output: [] })).toEqual([])
  })

  test("ignores a result that is not a list of sites", () => {
    for (const result of [{}, { output: "not json" }, { output: { name: "Acme" } }, { output: [{ name: "Acme" }] }, { output: [{ id: "c1" }] }]) expect(sitesOf(result)).toBeUndefined()
  })
})

describe("watchAccount", () => {
  test("a script's read through the tools RPC reaches every running instance", async () => {
    const first = await watch()
    const second = await watch()
    captureAccount("atlassianUserInfo", { output: USER })
    captureAccount("getAccessibleAtlassianResources", { output: SITES })
    expect([first.account.current(), second.account.current()]).toEqual([{ name: "Sam Okafor", sites: ["Acme", "Sandbox"] }, { name: "Sam Okafor", sites: ["Acme", "Sandbox"] }])
  })

  test("records a probe's display name, cleaned and cut; an empty one keeps what was read", async () => {
    const { account } = await watch()
    account.captureName("  Sam\u0007 Okafor  ")
    expect(account.current()).toEqual({ name: "Sam Okafor" })
    account.captureName("x".repeat(200))
    expect(account.current()?.name).toHaveLength(80)
    account.captureName("   ")
    expect(account.current()?.name).toHaveLength(80)
  })

  test("forgets the account when the server needs a new sign-in or the account is switched", async () => {
    const { account, state, stream } = await watch()
    captureAccount("atlassianUserInfo", { output: USER })
    expect(account.current()).toBeDefined()
    stream.emit("mcp.status.changed", { server: "other" })
    await tick()
    expect(account.current()).toBeDefined()
    expect(state.forgotten).toBe(0)
    state.server = "needs_auth"
    stream.emit("mcp.status.changed", { server: "jira" })
    await tick()
    expect(account.current()).toBeUndefined()
    // Each time, the plugin also forgets who probe named for each sign-in.
    expect(state.forgotten).toBe(1)
    state.server = "connected"
    captureAccount("atlassianUserInfo", { output: USER })
    expect(account.current()).toBeDefined()
    stream.emit("credential.switched")
    await tick()
    expect(account.current()).toBeUndefined()
    expect(state.forgotten).toBe(2)
  })

  // A new credential may be another person under the same credential id: what was read for the old one no longer holds.
  test("forgets the account, and who the sign-in is, when the credential is updated", async () => {
    const { account, state, stream } = await watch()
    captureAccount("atlassianUserInfo", { output: USER })
    expect(account.current()).toBeDefined()
    stream.emit("credential.updated")
    await tick()
    expect(account.current()).toBeUndefined()
    expect(state.forgotten).toBe(1)
  })

  test("while any instance signs in with its own API-token entry, a script's read updates no status", async () => {
    const shared = await watch()
    const own = await watch(() => true)
    captureAccount("atlassianUserInfo", { output: USER })
    expect([shared.account.current(), own.account.current()]).toEqual([undefined, undefined])
    // A probe belongs to its own instance, so it still records the account there.
    own.account.captureName("Sam Okafor")
    expect(own.account.current()).toEqual({ name: "Sam Okafor" })
    expect(shared.account.current()).toBeUndefined()
  })

  test("an instance whose jira server is at another URL records nothing from a script", async () => {
    const foreign = await watch(undefined, () => false)
    captureAccount("atlassianUserInfo", { output: USER })
    expect(foreign.account.current()).toBeUndefined()
  })

  test("stops capturing once stopped", async () => {
    const { account } = await watch()
    await stops.pop()!()
    captureAccount("atlassianUserInfo", { output: USER })
    expect(account.current()).toBeUndefined()
  })
})
