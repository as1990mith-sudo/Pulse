"use client"

// A slim, static bar that "replaces" the app header while reading. As the page
// scrolls down and the global SiteHeader fades up and out, this bar fades in at
// the very top — carrying the book/chapter, chapter navigation, and (crucially)
// the live reader count, so the fellowship presence never scrolls away. When
// the reader scrolls back up, the bar fades out exactly as the header returns,
// giving a clean, premium hand-off between the two.

import { type RefObject, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { BibleReaderIndicator } from "./reader-indicator"

/**
 * Decides when the mini bar is shown. It mirrors the SiteHeader's own
 * scroll-direction logic (hide on the way down past a small threshold, reveal
 * on the way up) AND requires the tall controls block to have scrolled off the
 * top — so the bar and the full controls never overlap, and the bar and the
 * header are mutually exclusive.
 */
export function useReadingChrome(sentinelRef: RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(false)
  const lastY = useRef(0)
  const headerHidden = useRef(false)

  useEffect(() => {
    lastY.current = window.scrollY
    let frame = 0

    const compute = () => {
      const y = window.scrollY
      const delta = y - lastY.current
      // Mirror SiteHeader: hidden when scrolling down past 72px; shown when
      // scrolling up or near the very top.
      if (Math.abs(delta) > 6) {
        headerHidden.current = delta > 0 && y > 72
        lastY.current = y
      } else if (y <= 72) {
        headerHidden.current = false
      }
      // Only once the tall controls have cleared the top of the viewport.
      const top = sentinelRef.current?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY
      const pastControls = top <= 8
      setVisible(headerHidden.current && pastControls)
    }

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        compute()
      })
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    compute()
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [sentinelRef])

  return visible
}

export function ReadingMiniBar({
  visible,
  book,
  chapter,
  onOpenControls,
  onPrev,
  onNext,
  isFirst,
  isLast,
}: {
  visible: boolean
  book: string
  chapter: number
  onOpenControls: () => void
  onPrev: () => void
  onNext: () => void
  isFirst: boolean
  isLast: boolean
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return createPortal(
    <div
      className={cn(
        "fixed inset-x-0 top-0 z-40 border-b border-border/60 bg-background/85 pt-safe backdrop-blur-xl",
        "transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0",
      )}
      // Hide from assistive tech + tab order while off-screen.
      aria-hidden={!visible}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:gap-3 sm:pl-[max(2rem,env(safe-area-inset-left))] sm:pr-[max(2rem,env(safe-area-inset-right))]">
        {/* Book + chapter — tap to jump back to the full controls at the top. */}
        <button
          type="button"
          onClick={onOpenControls}
          tabIndex={visible ? 0 : -1}
          className="tap-scale flex min-w-0 items-center gap-2 rounded-full border border-border/60 bg-secondary/40 py-1.5 pl-2 pr-3 text-sm font-semibold transition-colors hover:bg-secondary/70"
          aria-label={`${book} chapter ${chapter}. Tap to open reading controls.`}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <BookOpen className="size-3.5" />
          </span>
          <span className="truncate">
            {book} {chapter}
          </span>
        </button>

        {/* Live reader count — the whole point: it stays put while reading. */}
        <div className="flex min-w-0 flex-1 justify-center">
          <BibleReaderIndicator variant="compact" />
        </div>

        {/* Quick chapter navigation. */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            disabled={isFirst}
            tabIndex={visible ? 0 : -1}
            className="tap-scale inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card transition-colors hover:bg-secondary disabled:opacity-40"
            aria-label="Previous chapter"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={isLast}
            tabIndex={visible ? 0 : -1}
            className="tap-scale inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card transition-colors hover:bg-secondary disabled:opacity-40"
            aria-label="Next chapter"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
