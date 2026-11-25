// Imported first by the real-host test, before anything loads OpenCode. OpenCode derives its global paths from the
// environment, so HOME, OPENCODE_TEST_HOME, the XDG folders and TMPDIR point into a fresh temp root, and the working
// directory moves there. The root is a git repository under the system /tmp, so OpenCode's upward search for
// `.opencode` folders stops at it and never finds the config or skills of whoever runs the test.
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, realpathSync } from "node:fs"
import { join } from "node:path"

export const ROOT = realpathSync(mkdtempSync(join(realpathSync("/tmp"), "jira-skills-")))
const init = spawnSync("git", ["init", "--quiet", ROOT], { encoding: "utf8" })
if (init.status !== 0) throw new Error(`git init ${ROOT} failed: ${init.stderr}`)

const home = join(ROOT, "home")
mkdirSync(home, { recursive: true })
mkdirSync(join(ROOT, "tmp"), { recursive: true })
for (const key of Object.keys(process.env)) {
  if (key.startsWith("OPENCODE_") || key.startsWith("XDG_")) delete process.env[key]
}
Object.assign(process.env, {
  HOME: home,
  OPENCODE_TEST_HOME: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_CACHE_HOME: join(home, ".cache"),
  XDG_STATE_HOME: join(home, ".local", "state"),
  TMPDIR: join(ROOT, "tmp"),
})
process.chdir(home)
