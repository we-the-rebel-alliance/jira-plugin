// A real @opencode/sdk 2.4.1 host for the tests the kit's createHost cannot see (skills, commands, an adopted or
// conflicting MCP entry). The caller imports ./isolate.ts first; this module only creates the host in that temp root.
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath, pathToFileURL } from "node:url"
import { ROOT } from "./isolate.ts"

let hosts = 0

/** The SDK host, active and ready at an empty project directory. */
export async function startSdkHost(config: Readonly<Record<string, unknown>>, options?: Readonly<Record<string, unknown>>) {
  const root = fileURLToPath(new URL("../..", import.meta.url))
  const entry = join(root, "dist", "index.js")
  if (!existsSync(entry)) throw new Error("dist/index.js is missing; run npm run bundle before the host tests")
  const count = ++hosts
  const work = join(ROOT, `work-${count}`)
  const directory = join(ROOT, `config-${count}`)
  mkdirSync(work, { recursive: true })
  mkdirSync(directory, { recursive: true })
  const plugin = ((await import(pathToFileURL(entry).href)) as { default: { id: string; setup: (ctx: never) => unknown } }).default
  const configured =
    options === undefined
      ? plugin
      : {
          id: plugin.id,
          setup: (ctx: never) => plugin.setup({ ...(ctx as object), options } as never),
        }
  const { OpenCode } = (await import("@opencode/sdk")) as typeof import("@opencode/sdk")
  const client = await OpenCode.create({
    plugins: [configured as never],
    app: { version: "2.4.1" },
    config: { content: JSON.stringify(config), directory, project: false, claude: false },
    database: { path: join(ROOT, `opencode-${count}.db`) },
    models: { fetch: false },
    fs: { filewatcher: false },
    log: { level: "error" },
  })
  const location = { directory: work }
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
    if (state !== "active") throw new Error("the jira plugin did not become active")
  } catch (error) {
    await client.close().catch(() => undefined)
    throw error
  }
  return { client, location, close: () => client.close() }
}
