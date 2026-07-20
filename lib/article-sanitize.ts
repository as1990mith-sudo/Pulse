// Dependency-free HTML sanitizer for article bodies.
//
// Article bodies are sanitized HTML produced by the rich editor. This runs on
// the SERVER as a hard backstop: even if a crafted payload reaches the action,
// only an explicit allowlist of tags + attributes survives, and every URL is
// scheme-checked. There is no DOM on the server, so this is a small, careful
// tokenizer rather than a DOM walker.

// Tag → allowed attribute names. Tags not listed here are dropped entirely
// (their text content is preserved). `span` is allowed only to carry the
// Bible-verse styling class, which we re-validate below.
const ALLOWED: Record<string, string[]> = {
  p: [],
  br: [],
  h1: [],
  h2: [],
  h3: [],
  strong: [],
  b: [],
  em: [],
  i: [],
  u: [],
  s: [],
  blockquote: ["class"],
  ul: [],
  ol: [],
  li: [],
  a: ["href"],
  img: ["src", "alt"],
  figure: [],
  figcaption: [],
  span: ["class"],
  hr: [],
  code: [],
  pre: [],
}

// Elements that never have a closing tag.
const VOID = new Set(["br", "img", "hr"])

// class values we permit (used for the verse blockquote styling).
const ALLOWED_CLASSES = new Set(["verse"])

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim()
  // Allow app-relative, protocol-relative-free, and safe absolute schemes.
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return true
  if (/^(https?:|mailto:)/i.test(trimmed)) return true
  // blob:/data: images are used transiently by the editor but must never be
  // persisted; the action uploads them first, so reject here.
  return false
}

// Parse the attributes portion of a start tag into name→value pairs.
function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase()
    let value = m[2] ?? ""
    if (value && (value[0] === '"' || value[0] === "'")) value = value.slice(1, -1)
    attrs[name] = value
  }
  return attrs
}

function buildAttrs(tag: string, attrs: Record<string, string>): string {
  const allowedNames = ALLOWED[tag]
  const out: string[] = []
  for (const name of allowedNames) {
    const value = attrs[name]
    if (value == null) continue
    if (name === "href" || name === "src") {
      if (!isSafeUrl(value)) continue
    }
    if (name === "class") {
      const kept = value
        .split(/\s+/)
        .filter((c) => ALLOWED_CLASSES.has(c))
        .join(" ")
      if (!kept) continue
      out.push(`class="${escapeAttr(kept)}"`)
      continue
    }
    out.push(`${name}="${escapeAttr(value)}"`)
  }
  if (tag === "a" && out.some((a) => a.startsWith("href="))) {
    // Harden outbound links.
    out.push('target="_blank"', 'rel="noopener noreferrer nofollow"')
  }
  return out.length ? " " + out.join(" ") : ""
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * Sanitizes an article body to a safe HTML subset. Unknown tags are unwrapped
 * (their inner text is kept), scripts/styles/comments are removed, and all URLs
 * are scheme-checked.
 */
export function sanitizeArticleHtml(input: string): string {
  if (!input) return ""
  // 1) Strip dangerous element blocks (including content) + HTML comments.
  let html = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(iframe|object|embed|noscript|svg|math|form|input|button|textarea|select)[\s\S]*?<\/\1>/gi, "")

  // 2) Tokenize and rebuild only allowlisted tags.
  let out = ""
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)\/?>/g
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(html))) {
    // Text before this tag is kept verbatim (already entity-encoded by the editor).
    out += html.slice(lastIndex, m.index)
    lastIndex = tagRe.lastIndex

    const full = m[0]
    const tag = m[1].toLowerCase()
    const isClosing = full.startsWith("</")

    if (!(tag in ALLOWED)) continue // unwrap: drop the tag markup, keep surrounding text

    if (isClosing) {
      if (!VOID.has(tag)) out += `</${tag}>`
      continue
    }

    const attrs = parseAttrs(m[2] ?? "")
    if (VOID.has(tag)) {
      out += `<${tag}${buildAttrs(tag, attrs)} />`
    } else {
      out += `<${tag}${buildAttrs(tag, attrs)}>`
    }
  }
  out += html.slice(lastIndex)

  // 3) Collapse runs of empty paragraphs the editor tends to leave behind.
  return out.replace(/(?:<p>\s*<\/p>\s*){2,}/g, "<p></p>").trim()
}

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
}

/** Strips all tags and decodes common entities to plain text. */
export function htmlToPlainText(html: string): string {
  if (!html) return ""
  return html
    .replace(/<(br|\/p|\/h[1-3]|\/li|\/blockquote)[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#?[a-z0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** A short, single-line summary derived from the body when none is supplied. */
export function deriveExcerpt(html: string, max = 200): string {
  const text = htmlToPlainText(html)
  if (text.length <= max) return text
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…"
}

/** Reading-time estimate in whole minutes (~220 wpm), floored at 1. */
export function estimateReadMinutes(html: string): number {
  const words = htmlToPlainText(html).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 220))
}
