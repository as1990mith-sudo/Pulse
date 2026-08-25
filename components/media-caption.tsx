"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { renderMessageBody } from "@/lib/rich-text"
import { cn } from "@/lib/utils"

/**
 * Caption for full-screen media viewers (Reels and the immersive image viewer).
 *
 * Collapses to a single line, with the last visible line fading directly into an
 * inline "… Read more" (never a separate line). Because the whole author/caption
 * block is bottom-anchored in both viewers, expanding grows the block *upward*;
 * tapping the body text collapses it again. Line breaks are preserved and
 * markdown emphasis, mentions, and links are parsed via the shared rich-text
 * renderer so the result matches the feed exactly.
 *
 * Shared by both viewers deliberately: it is the single source of truth for
 * caption metrics, so the two surfaces cannot drift in font size or clamping
 * behaviour the way they did when each had its own implementation.
 */
export function MediaCaption({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const [clampable, setClampable] = useState(false)
  const textRef = useRef<HTMLDivElement>(null)

  // 1 collapsed line at leading-tight (1.25).
  const LINE_HEIGHT = 1.25
  const collapsedMaxEm = LINE_HEIGHT
  const isClamped = clampable && !expanded

  const nodes = useMemo(
    () =>
      renderMessageBody(text, {
        link: true,
        linkClassName: "font-medium text-white underline-offset-2 [overflow-wrap:anywhere] hover:underline",
        mentionClassName: "font-semibold text-white hover:underline",
      }),
    [text],
  )

  // Only surface "Read more" when the caption genuinely overflows one line.
  // Re-measured on resize and when the text/expansion changes.
  useEffect(() => {
    const el = textRef.current
    if (!el) {
      setClampable(false)
      return
    }
    const measure = () => {
      const lineHeightPx = collapsedMaxEm * Number.parseFloat(getComputedStyle(el).fontSize || "16")
      setClampable(el.scrollHeight > lineHeightPx + 2)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, collapsedMaxEm, expanded])

  return (
    <div className={cn("mt-2 max-w-md", className)} data-no-swipe>
      <div
        ref={textRef}
        className={cn(
          "relative whitespace-pre-line text-base leading-tight drop-shadow transition-all",
          isClamped && "overflow-hidden",
          clampable && expanded && "cursor-pointer",
        )}
        style={isClamped ? { maxHeight: `${collapsedMaxEm}em` } : undefined}
        onClick={
          clampable && expanded
            ? (e) => {
                // Collapse when tapping the body, but let links/buttons through.
                if (!(e.target as HTMLElement).closest("a,button")) setExpanded(false)
              }
            : undefined
        }
      >
        {nodes}
        {isClamped && (
          // Sits on the last visible line; the text fades directly into the
          // inline "… Read more" via the horizontal gradient (same as the feed).
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="absolute bottom-0 right-0 flex items-baseline bg-gradient-to-l from-black from-50% to-transparent pl-14 text-base font-semibold leading-tight text-white/70 drop-shadow transition-colors hover:text-white"
          >
            <span aria-hidden className="text-white/90">…&nbsp;</span>
            Read more
          </button>
        )}
      </div>
    </div>
  )
}
