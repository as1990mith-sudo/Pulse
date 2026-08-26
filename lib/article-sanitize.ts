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
  a: ["href", "data-mention-id", "class"],
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

// class values we permit (verse blockquote styling + inline @mention links).
const ALLOWED_CLASSES = new Set(["verse", "mention"])

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
  // Harden OUTBOUND links only. Internal @mention links (data-mention-id) point
  // at in-app profiles and must open in the same tab like normal navigation.
  const isMention = out.some((a) => a.startsWith("data-mention-id="))
  if (tag === "a" && !isMention && out.some((a) => a.startsWith("href="))) {
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

  // 2) Tokenize to an allowlisted token stream, then re-serialize with a
  //    block-aware writer (below) that guarantees well-formed paragraphs.
  return serializeBlocks(tokenize(html))
}

/* -------------------------------------------------------------------------- */
/*  Block normalization                                                       */
/* -------------------------------------------------------------------------- */

// Tags that stand on their own line. Everything else in ALLOWED is inline and
// therefore lives *inside* a paragraph.
const BLOCK = new Set(["p", "h1", "h2", "h3", "blockquote", "ul", "ol", "li", "figure", "figcaption", "pre", "hr", "img"])

type Token =
  | { k: "text"; text: string }
  | { k: "open"; tag: string; attrs: Record<string, string> }
  | { k: "close"; tag: string }
  | { k: "void"; tag: string; attrs: Record<string, string> }
  // A <div> boundary. contentEditable wraps lines in divs, which are not in the
  // allowlist; they carry no styling, only "a line ended here".
  | { k: "boundary" }

function tokenize(html: string): Token[] {
  const tokens: Token[] = []
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)\/?>/g
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(html))) {
    const text = html.slice(lastIndex, m.index)
    if (text) tokens.push({ k: "text", text })
    lastIndex = tagRe.lastIndex

    const tag = m[1].toLowerCase()
    const isClosing = m[0].startsWith("</")

    // <div> is a line wrapper, not content: record it as a paragraph boundary.
    if (tag === "div") {
      tokens.push({ k: "boundary" })
      continue
    }
    if (!(tag in ALLOWED)) continue // unwrap: drop markup, keep surrounding text

    if (isClosing) {
      if (!VOID.has(tag)) tokens.push({ k: "close", tag })
      continue
    }
    const attrs = parseAttrs(m[2] ?? "")
    tokens.push(VOID.has(tag) ? { k: "void", tag, attrs } : { k: "open", tag, attrs })
  }
  const tail = html.slice(lastIndex)
  if (tail) tokens.push({ k: "text", text: tail })
  return tokens
}

/** True when a paragraph's buffered inner HTML holds something worth showing. */
function hasVisibleContent(inner: string): boolean {
  return inner
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim().length > 0
}

/**
 * Re-serializes tokens as clean block HTML.
 *
 * Bodies come from a contentEditable, so the raw markup is routinely malformed
 * in ways that made paragraph spacing erratic:
 *   - the first paragraph arrives as a bare text node with no <p> at all, so it
 *     never picked up the prose spacing rule;
 *   - paragraphs arrive nested (`<p><p>…</p></p>`) or unclosed (`<p><br><p>`),
 *     and since HTML forbids nesting <p> the browser silently restructured them
 *     into extra empty paragraphs — the random large gaps;
 *   - blank lines arrive as `<p></p>`, `<p><br></p>`, or nothing at all, so the
 *     gap between two paragraphs depended on which the editor happened to emit.
 *
 * The writer below removes that variance at the source: paragraphs are opened
 * and closed by this function alone (never nested), bare text is wrapped, and
 * blank-line spacers are dropped so *all* paragraph spacing comes from one CSS
 * rule. Inline tags are kept inside their paragraph rather than promoted to
 * blocks, which is what previously split sentences mid-word.
 */
function serializeBlocks(tokens: Token[]): string {
  const out: string[] = []
  // Buffered inner HTML of the paragraph currently being written. Buffering is
  // what lets us discard a paragraph that turns out to be empty.
  let pBuf: string[] | null = null
  // Depth of open non-paragraph block containers (blockquote, ul, li, figure…).
  // Inside one, that element owns its own layout and we don't add paragraphs.
  let depth = 0

  const flushP = () => {
    if (!pBuf) return
    const inner = pBuf.join("").replace(/(?:\s|&nbsp;)+$/gi, "")
    pBuf = null
    if (hasVisibleContent(inner)) out.push(`<p>${inner}</p>`)
  }
  const ensureP = () => {
    if (depth === 0 && !pBuf) pBuf = []
  }
  const emit = (s: string) => (pBuf ? pBuf.push(s) : out.push(s))

  for (const t of tokens) {
    switch (t.k) {
      case "boundary":
        if (depth === 0) flushP()
        break

      case "text":
        if (depth > 0) {
          out.push(t.text)
        } else if (t.text.trim() || pBuf) {
          // Whitespace between blocks is layout noise; whitespace inside a live
          // paragraph is a real word gap.
          ensureP()
          pBuf!.push(t.text)
        }
        break

      case "open":
        if (t.tag === "p") {
          // Never nest: a new <p> always ends the previous one.
          if (depth === 0) {
            flushP()
            pBuf = []
          }
        } else if (BLOCK.has(t.tag)) {
          flushP()
          out.push(`<${t.tag}${buildAttrs(t.tag, t.attrs)}>`)
          depth++
        } else {
          ensureP()
          emit(`<${t.tag}${buildAttrs(t.tag, t.attrs)}>`)
        }
        break

      case "close":
        if (t.tag === "p") {
          if (depth === 0) flushP()
        } else if (BLOCK.has(t.tag)) {
          flushP()
          // Guard against stray closers the editor never opened.
          if (depth > 0) {
            depth--
            out.push(`</${t.tag}>`)
          }
        } else {
          emit(`</${t.tag}>`)
        }
        break

      case "void":
        if (t.tag === "br") {
          // A <br> that is a paragraph's only content is a blank-line spacer,
          // not a line break — drop it so spacing comes from CSS alone.
          if (depth > 0) out.push("<br />")
          else if (pBuf && hasVisibleContent(pBuf.join(""))) pBuf.push("<br />")
        } else if (BLOCK.has(t.tag)) {
          // <img>/<hr> stand alone so they get predictable spacing.
          flushP()
          out.push(`<${t.tag}${buildAttrs(t.tag, t.attrs)} />`)
        } else {
          ensureP()
          emit(`<${t.tag}${buildAttrs(t.tag, t.attrs)} />`)
        }
        break
    }
  }
  flushP()
  return out.join("").trim()
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

/** Minimum word count an article must reach before it can be published. */
export const ARTICLE_MIN_WORDS = 500

/** Counts the words in a rich-text body (tags stripped). */
export function countWords(html: string): number {
  return htmlToPlainText(html).split(/\s+/).filter(Boolean).length
}

/** Reading-time estimate in whole minutes (~220 wpm), floored at 1. */
export function estimateReadMinutes(html: string): number {
  return Math.max(1, Math.round(countWords(html) / 220))
}
