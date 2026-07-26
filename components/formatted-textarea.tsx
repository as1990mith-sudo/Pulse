"use client"

import { Fragment, type ComponentProps, type ReactNode, useMemo } from "react"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/**
 * Base class string copied from `components/ui/textarea.tsx`. The overlay mirror
 * must share the exact same box metrics (padding, font-size, line-height,
 * border width, wrapping) as the real <textarea> so the rendered formatting
 * lines up pixel-for-pixel with the caret. If the Textarea base ever changes,
 * keep this in sync.
 */
const TEXTAREA_BASE =
  "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"

// Matches `**bold**` / `*bold*` / `_italic_` exactly like lib/rich-text.tsx,
// but here we KEEP the markers visible so the user can see what they typed.
const FORMAT_RE = /(\*\*|[*_])(?=\S)([\s\S]*?\S)\1/g

/**
 * Renders the draft text with `*bold*` / `_italic_` styling applied live, while
 * leaving the `*` and `_` markers in place (dimmed) so the user can tell the
 * formatting is being recognised before they post.
 */
function renderOverlay(text: string, keyBase = "ov"): ReactNode[] {
  const re = new RegExp(FORMAT_RE.source, "g")
  const nodes: ReactNode[] = []
  let last = 0
  let i = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    const [full, marker, inner] = match
    if (match.index > last) {
      nodes.push(<Fragment key={`${keyBase}-t${i}`}>{text.slice(last, match.index)}</Fragment>)
    }
    const innerNodes = renderOverlay(inner, `${keyBase}-f${i}`)
    nodes.push(
      <span key={`${keyBase}-w${i}`}>
        <span className="text-muted-foreground/40">{marker}</span>
        {marker === "_" ? (
          <em>{innerNodes}</em>
        ) : (
          // Faux-bold via text-shadow, NOT font-weight: a real bold face has
          // wider glyph advances than the plain textarea underneath, which would
          // make the mirror wrap at different points and drift the text out of
          // sync with the caret. text-shadow thickens the strokes while keeping
          // the exact same advance widths, so wrapping/caret alignment holds.
          <span style={{ textShadow: "0.4px 0 currentColor, -0.4px 0 currentColor" }}>{innerNodes}</span>
        )}
        <span className="text-muted-foreground/40">{marker}</span>
      </span>,
    )
    last = match.index + full.length
    i++
  }

  if (last < text.length) {
    nodes.push(<Fragment key={`${keyBase}-t${i}`}>{text.slice(last)}</Fragment>)
  }
  return nodes
}

type FormattedTextareaProps = ComponentProps<typeof Textarea> & {
  // Optional ref to the underlying <textarea>, used by mention autocomplete to
  // read the caret position and restore focus after inserting a mention.
  textareaRef?: React.Ref<HTMLTextAreaElement>
}

/**
 * Drop-in replacement for <Textarea> that shows live `*bold*` / `_italic_`
 * formatting as the user types. A transparent-text textarea sits on top of a
 * styled mirror layer (same grid cell), so the caret and selection still work
 * normally while the formatting renders underneath.
 */
export function FormattedTextarea({ value, className, textareaRef, ...props }: FormattedTextareaProps) {
  const text = typeof value === "string" ? value : value != null ? String(value) : ""
  const overlay = useMemo(() => renderOverlay(text), [text])

  return (
    <div className="relative grid">
      {/* Visible mirror: renders the formatted text and sets the box height.
          `display:block` is forced (via inline style, which beats the `flex`
          that TEXTAREA_BASE carries for the real control): as a flex container
          the mirror would treat each text run + the bold/italic <span> as
          separate flex items and spread them into columns, shattering the
          sentence the moment any formatting is applied. A block keeps the runs
          flowing inline like normal wrapped text. */}
      <div
        aria-hidden
        style={{ display: "block" }}
        className={cn(
          TEXTAREA_BASE,
          className,
          "pointer-events-none col-start-1 row-start-1 select-none overflow-hidden whitespace-pre-wrap break-words text-foreground",
        )}
      >
        {overlay}
        {/* Preserve the trailing line height when the value ends in a newline. */}
        {(text.length === 0 || text.endsWith("\n")) && "\u200b"}
      </div>
      {/* Real input on top: transparent text (so only the mirror shows) but a
          visible caret. Background is forced transparent in every theme so it
          never hides the mirror underneath. */}
      <Textarea
        {...props}
        ref={textareaRef}
        value={value}
        className={cn(className, "col-start-1 row-start-1 bg-transparent text-transparent caret-foreground dark:bg-transparent")}
      />
    </div>
  )
}
