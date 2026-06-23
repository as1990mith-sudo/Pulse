import type { ReactNode } from "react"

// Matches http(s) URLs, bare www. domains, and plain domain.tld patterns.
const URL_REGEX =
  /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,:;"')\]}]|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<]*)?)/gi

function normalizeHref(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw
  return `https://${raw}`
}

/**
 * Splits a string into plain text and clickable link segments. URLs (including
 * bare `www.` and `domain.tld` forms) become anchors that open in a new tab.
 */
export function linkify(text: string, linkClassName?: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  // Reset because the regex is stateful with the global flag.
  URL_REGEX.lastIndex = 0

  while ((match = URL_REGEX.exec(text)) !== null) {
    const url = match[0]
    const start = match.index
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start))

    nodes.push(
      <a
        key={`${start}-${url}`}
        href={normalizeHref(url)}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName ?? "underline underline-offset-2 hover:opacity-80"}
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>,
    )
    lastIndex = start + url.length
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

/**
 * Returns the first URL found in `text` (normalized to include a protocol), or
 * null if there are none. Used to surface a rich link preview for a post.
 */
export function extractFirstUrl(text: string): string | null {
  URL_REGEX.lastIndex = 0
  const match = URL_REGEX.exec(text)
  return match ? normalizeHref(match[0]) : null
}
