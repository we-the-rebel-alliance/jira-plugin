// Bundle the one server entry: dist/index.js, self-contained except for the host module and Node built-ins.
//
// The bundle is what plugin-kit loads through OpenCode's resolver and what the release attaches. Nothing from the
// contract package is external: `@we-the-rebel-alliance/plugin-contract` is a devDependency, so the plugin carries the
// modules it uses. A leftover import that is neither `node:` nor `@opencode/plugin` fails the bundle, because a host
// cannot resolve it at runtime.
import { mkdirSync, readFileSync, rmSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const _root = fileURLToPath(new URL("..", import.meta.url))
const entry = fileURLToPath(new URL("../src/index.ts", import.meta.url))
const outfile = fileURLToPath(new URL("../dist/index.js", import.meta.url))
const allowed = [/^node:/, /^@opencode\/plugin(?:\/|$)/]

rmSync(fileURLToPath(new URL("../dist", import.meta.url)), { recursive: true, force: true })
mkdirSync(fileURLToPath(new URL("../dist", import.meta.url)), { recursive: true })

const result = await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: ["node24"],
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning",
  metafile: true,
  external: ["@opencode/plugin", "@opencode/plugin/*"],
})

const text = readFileSync(outfile, "utf8")
const specifiers = new Set()
for (const match of text.matchAll(/\b(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g)) {
  if (match[1] !== undefined) specifiers.add(match[1])
}
const bad = [...specifiers].filter((specifier) => !allowed.some((pattern) => pattern.test(specifier))).sort()
if (bad.length > 0) {
  console.error(`bundle: dist/index.js imports modules the host cannot resolve: ${bad.join(", ")}`)
  process.exit(1)
}

const bytes = Buffer.byteLength(text)
if (bytes === 0) {
  console.error("bundle: dist/index.js is empty")
  process.exit(1)
}
const inputs = Object.keys(result.metafile.inputs)
console.log(`bundle: dist/index.js ${bytes} bytes, ${inputs.length} inputs, ${specifiers.size} external specifiers`)
