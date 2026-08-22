"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The house truncation rules, in one place so every surface stays consistent.
 *
 * - `POST` (6)  — the default for long-form text posts: Community Help,
 *                 iTestify, user/organisation profile timelines and inbox chat.
 * - `ORG` (7)   — organisation / Home posts get one extra line, since ministry
 *                 announcements are typically a touch longer than a member's.
 * - `MEDIA` (2) — a main-feed member post that carries media: the media does
 *                 the visual work, so the caption stays a tight two-line lede.
 */
export const CLAMP_LINES = {
  POST: 6,
  ORG: 7,
  MEDIA: 2,
  // Chat bubbles are much narrower than a post card, so the same line count
  // fills far more of the screen. A tighter clamp keeps one long message from
  // taking over the whole conversation view.
  CHAT: 5,
} as const

/**
 * Text that collapses to a fixed number of lines with a "Read more" toggle, and
 * collapses back to "Read less" when tapped again.
 *
 * The clamp is applied via inline `-webkit-line-clamp` rather than Tailwind's
 * `line-clamp-*` utilities because the line count is a runtime value here —
 * a dynamic class name would be purged from the stylesheet.
 */
export function ClampedText({
  lines,
  children,
  className,
  toggleClassName,
  as: Tag = "p",
}: {
  /** How many lines to show while collapsed. */
  lines: number
  children: React.ReactNode
  className?: string
  toggleClassName?: string
  /** Element to render the text as. Defaults to a paragraph. */
  as?: "p" | "div"
}) {
  const [expanded, setExpanded] = useState(false)
  // Whether the text is actually longer than the clamp. Only then is a toggle
  // offered, so short posts never show a pointless "Read more".
  const [overflows, setOverflows] = useState(false)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    // Measurement is only meaningful while the clamp is applied — once expanded
    // scrollHeight equals clientHeight, which would wrongly clear the flag and
    // strip the "Read less" affordance. So we skip re-measuring when expanded
    // and let the value stand from the collapsed pass.
    if (expanded) return
    const el = ref.current
    if (!el) return

    const measure = () => setOverflows(el.scrollHeight - el.clientHeight > 4)
    measure()

    // Re-measure on reflow (rotation, font load, container resize) so the
    // toggle appears/disappears correctly rather than going stale.
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [children, lines, expanded])

  return (
    <>
      <Tag
        ref={ref as never}
        // Re-keying on `expanded` restarts the fade, so revealing or hiding the
        // remainder eases in rather than snapping. A height transition isn't
        // possible here because -webkit-line-clamp has no animatable height.
        key={expanded ? "expanded" : "collapsed"}
        className={cn(className, "animate-in fade-in duration-200")}
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: lines,
                overflow: "hidden",
              }
        }
      >
        {children}
      </Tag>
      {overflows && (
        <button
          type="button"
          // These bodies usually sit inside a tappable row (opening the post or
          // conversation), so keep the toggle from triggering that navigation.
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            setExpanded((v) => !v)
          }}
          aria-expanded={expanded}
          className={cn(
            "mt-1 inline-flex items-center gap-1 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground",
            toggleClassName,
          )}
        >
          {expanded ? "Show less" : "Read more"}
          <ChevronDown className={cn("size-3.5 transition-transform duration-200", expanded && "rotate-180")} />
        </button>
      )}
    </>
  )
}
