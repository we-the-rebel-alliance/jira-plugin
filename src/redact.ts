import { redactReason } from "@we-the-rebel-alliance/plugin-contract/accounts"

/** At most `max` characters, ending in `…` when cut, never splitting a surrogate pair. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text
  let end = Math.max(0, max - 1)
  const code = text.charCodeAt(end - 1)
  if (end > 0 && code >= 0xd800 && code <= 0xdbff) end--
  return `${text.slice(0, end)}…`
}

/** One line: control characters become spaces and runs of whitespace one space. */
export function oneLine(text: string): string {
  let out = ""
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    out += code < 32 || code === 127 ? " " : char
  }
  return out.replace(/\s+/g, " ").trim()
}

/** One line, redacted, cut for a refusal or a status reason: never a credential, never a second line. */
export function safeReason(value: unknown, max = 200): string {
  const text = value instanceof Error ? value.message : String(value)
  return cut(redactReason(oneLine(text)), max)
}

/** What an MCP transport error says, made safe to show: its first line, redacted and cut. */
export function upstreamText(message: string): string {
  const first = message.split(/\r?\n/, 1)[0] ?? ""
  return cut(redactReason(oneLine(first)), 300)
}
