// Universal @mention system — shared token format used everywhere a user can
// tag another user (feed posts today; comments/replies/live chat later).
//
// Canonical stored form (plain-text surfaces like feed posts):
//     @[Display Name](userId)
// This keeps the display name and the resolved user id together in the text
// itself, so rendering is position-accurate without a side table, while the
// denormalized `mentions` jsonb column drives notifications + queries.
//
// Article bodies are HTML, so there mentions live as
//     <a data-mention-id="userId" href="/u/userId">@Name</a>
// (see lib/article-sanitize.ts). Both forms resolve to the same MentionRef.

export type MentionRef = { userId: string; name: string }

// Matches a canonical token: @[name](id). The name may contain spaces and most
// punctuation but not `]` or a newline; the id is a non-space run without `)`.
export const MENTION_TOKEN_RE = /@\[([^\]\n]+)\]\(([^)\s]+)\)/g

const WORD_CHAR = /[a-zA-Z0-9_]/

/**
 * Convert a composer's natural display text (e.g. `Hi @John Smith!`) plus the
 * list of mentions the user actually selected into canonical token text
 * (`Hi @[John Smith](u_123)!`).
 *
 * Each selected mention replaces the first not-yet-consumed literal `@Name`
 * occurrence, requiring a word boundary after the name so `@John` never matches
 * inside `@Johnny`. Mentions that can't be located (user edited the text) are
 * skipped, so the output can never contain a malformed token.
 */
export function serializeMentions(text: string, mentions: MentionRef[]): string {
  let out = text
  // Per display-name search cursor, so tagging the same person twice targets
  // the first then the second occurrence rather than the same one twice.
  const cursor = new Map<string, number>()

  for (const m of mentions) {
    const needle = `@${m.name}`
    let from = cursor.get(m.name) ?? 0

    while (from <= out.length) {
      const idx = out.indexOf(needle, from)
      if (idx === -1) break
      const after = out[idx + needle.length]
      // Require a boundary after the name (end of string or a non-word char),
      // and make sure we're not landing inside an already-written token.
      const insideToken = out.slice(Math.max(0, idx - 1), idx) === "[" || out[idx + needle.length] === "]"
      if ((after === undefined || !WORD_CHAR.test(after)) && !insideToken) {
        const token = `@[${m.name}](${m.userId})`
        out = out.slice(0, idx) + token + out.slice(idx + needle.length)
        cursor.set(m.name, idx + token.length)
        break
      }
      from = idx + needle.length
    }
  }

  return out
}

/**
 * Pull every canonical mention out of token text, de-duplicated by userId in
 * first-appearance order. Used to fan out notifications + populate the
 * `mentions` column.
 */
export function extractMentionRefs(text: string): MentionRef[] {
  if (!text) return []
  const seen = new Set<string>()
  const refs: MentionRef[] = []
  for (const m of text.matchAll(MENTION_TOKEN_RE)) {
    const name = m[1]
    const userId = m[2]
    if (seen.has(userId)) continue
    seen.add(userId)
    refs.push({ userId, name })
  }
  return refs
}

/**
 * Replace canonical tokens with their plain `@Name` display form. Used for
 * previews, share subtitles, notification copy, and search — anywhere the raw
 * token would leak into user-visible plain text.
 */
export function stripMentionTokens(text: string): string {
  if (!text) return text
  return text.replace(MENTION_TOKEN_RE, (_full, name: string) => `@${name}`)
}

/**
 * Rewrite the userIds inside a token string, keeping display names. Given a set
 * of userIds that failed a privacy check, downgrade only those tokens back to
 * plain `@Name` text (so they render as inert text and send no notification)
 * while leaving allowed mentions intact.
 */
export function downgradeBlockedMentions(text: string, blocked: Set<string>): string {
  if (!text || blocked.size === 0) return text
  return text.replace(MENTION_TOKEN_RE, (full, name: string, userId: string) =>
    blocked.has(userId) ? `@${name}` : full,
  )
}

// --- Article (HTML) mentions ----------------------------------------------
// In article bodies mentions are stored as inline anchors:
//   <a class="mention" data-mention-id="userId" href="/u/userId">@Name</a>
// These helpers mirror the plain-text token helpers above for HTML bodies.

const HTML_MENTION_RE = /<a\b[^>]*\bdata-mention-id="([^"]+)"[^>]*>@?([^<]*)<\/a>/g

/** Build the canonical inline mention anchor for an article body. */
export function htmlMentionAnchor(userId: string, name: string): string {
  const safeId = escapeHtmlAttr(userId)
  const safeName = escapeHtml(name)
  return `<a class="mention" data-mention-id="${safeId}" href="/u/${safeId}">@${safeName}</a>`
}

/** Extract mention refs from an article body, de-duplicated by userId. */
export function extractHtmlMentionRefs(html: string): MentionRef[] {
  if (!html) return []
  const seen = new Set<string>()
  const refs: MentionRef[] = []
  for (const m of html.matchAll(HTML_MENTION_RE)) {
    const userId = m[1]
    const name = m[2].trim()
    if (seen.has(userId)) continue
    seen.add(userId)
    refs.push({ userId, name })
  }
  return refs
}

/**
 * Downgrade mention anchors whose userId is in `blocked` back to plain `@Name`
 * text (privacy enforcement). When `blocked` is null, downgrade ALL mentions
 * (used to strip a single removed user by passing their id set).
 */
export function downgradeBlockedHtmlMentions(html: string, blocked: Set<string>): string {
  if (!html || blocked.size === 0) return html
  return html.replace(HTML_MENTION_RE, (full, userId: string, name: string) =>
    blocked.has(userId) ? `@${name.trim()}` : full,
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;")
}

// Extract the display-name fragment the user is currently typing after an `@`,
// for the composer autocomplete. Returns null when the caret isn't inside an
// active mention query. Allows a single trailing space so multi-word names
// ("John Sm") keep matching, but bails once the query looks finished.
export function getActiveMentionQuery(
  value: string,
  caret: number,
): { query: string; start: number } | null {
  // Walk left from the caret to find an `@` that begins a mention query.
  let i = caret - 1
  let sawSpace = false
  while (i >= 0) {
    const ch = value[i]
    if (ch === "@") {
      const before = value[i - 1]
      // `@` must start the string or follow whitespace/newline (not an email).
      if (before === undefined || /\s/.test(before)) {
        return { query: value.slice(i + 1, caret), start: i }
      }
      return null
    }
    if (ch === "\n") return null
    if (/\s/.test(ch)) {
      // Permit exactly one internal space (for "First Last"); a second ends it.
      if (sawSpace) return null
      sawSpace = true
    }
    i--
  }
  return null
}
