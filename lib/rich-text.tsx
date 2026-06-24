import { Fragment, type ReactNode } from "react"
import { linkify } from "@/lib/linkify"

export type RichTextOptions = {
  /** Turn URLs into clickable links within plain-text runs. */
  link?: boolean
  /** Highlight `@mentions` within plain-text runs. */
  mention?: boolean
  /** Class applied to rendered links. */
  linkClassName?: string
  /** Class applied to `@mention` spans. */
  mentionClassName?: string
}

const MENTION_REGEX = /(@[a-zA-Z0-9_.]+)/g

/**
 * Renders a formatting-free text run, optionally turning `@mentions` and URLs
 * into rich nodes. Mentions are resolved first, then links inside the leftover
 * text, so the two never collide.
 */
function renderLeaf(text: string, keyBase: string, opts: RichTextOptions): ReactNode[] {
  if (!text) return []

  if (opts.mention) {
    return text.split(MENTION_REGEX).map((part, i) => {
      if (part.startsWith("@") && part.length > 1) {
        return (
          <span key={`${keyBase}-m${i}`} className={opts.mentionClassName ?? "font-semibold text-primary"}>
            {part}
          </span>
        )
      }
      return opts.link ? (
        <Fragment key={`${keyBase}-l${i}`}>{linkify(part, opts.linkClassName)}</Fragment>
      ) : (
        <Fragment key={`${keyBase}-l${i}`}>{part}</Fragment>
      )
    })
  }

  if (opts.link) return linkify(text, opts.linkClassName)
  return [text]
}

/**
 * Recursively renders WhatsApp-style `*bold*` and `_italic_` formatting.
 * A fresh RegExp is created per call so nested/recursive matching never trips
 * over a shared stateful `lastIndex`.
 */
function renderFormatted(text: string, keyBase: string, opts: RichTextOptions): ReactNode[] {
  // Matches `*bold*` or `_italic_` like WhatsApp: a single `*` or `_` marker
  // whose content starts and ends with a non-space character (so `2 * 3` or a
  // stray underscore isn't treated as formatting). The backreference makes the
  // closing marker match the opener, and `[\s\S]` lets it span line breaks
  // without needing the `s` (dotAll) flag.
  const re = /([*_])(?=\S)([\s\S]*?\S)\1/g
  const nodes: ReactNode[] = []
  let last = 0
  let i = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    const [full, marker, inner] = match
    if (match.index > last) {
      nodes.push(...renderLeaf(text.slice(last, match.index), `${keyBase}-t${i}`, opts))
    }
    const innerNodes = renderFormatted(inner, `${keyBase}-f${i}`, opts)
    nodes.push(
      marker === "*" ? (
        <strong key={`${keyBase}-b${i}`} className="font-semibold">
          {innerNodes}
        </strong>
      ) : (
        <em key={`${keyBase}-i${i}`}>{innerNodes}</em>
      ),
    )
    last = match.index + full.length
    i++
  }

  if (last < text.length) nodes.push(...renderLeaf(text.slice(last), `${keyBase}-t${i}`, opts))
  return nodes
}

/**
 * WhatsApp-style inline message formatting: `*bold*` and `_italic_`, with
 * optional clickable links and highlighted `@mentions`. Returns React nodes
 * ready to drop inside a paragraph.
 */
export function renderMessageBody(text: string, opts: RichTextOptions = {}): ReactNode {
  if (!text) return null
  return <>{renderFormatted(text, "rt", opts)}</>
}
