"use client"

// The live reader-presence indicator shown just below the book title. It reads
// the fellowship indicator and renders elegant, non-distracting copy with a
// count that springs smoothly as readers join or leave. Tapping it opens the
// readers discovery sheet. Never shows zero — falls back to the church-wide
// reading count when nobody else is in the same book.

import { useEffect, useRef, useState } from "react"
import { Users, Globe } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { useBibleFellowshipOptional } from "./fellowship-context"

/** Eases a displayed integer toward a target so counts animate 11 → 12. */
function useSpringCount(target: number): number {
  const [display, setDisplay] = useState(target)
  const rafRef = useRef<number | null>(null)
  const fromRef = useRef(target)
  const startRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    if (from === target) return
    const DURATION = 500
    startRef.current = performance.now()

    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / DURATION)
      // easeOutBack for a subtle spring overshoot.
      const c1 = 1.70158
      const c3 = c1 + 1
      const eased = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
      const value = Math.round(from + (target - from) * eased)
      setDisplay(value)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = target
        setDisplay(target)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      fromRef.current = display
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return display
}

export function BibleReaderIndicator() {
  const fellowship = useBibleFellowshipOptional()
  const indicator = fellowship?.indicator ?? null

  // Choose the headline number based on scope, then spring toward it.
  const isBook = indicator?.scope === "book"
  const target = indicator ? (isBook ? indicator.sameBookOthers : indicator.totalReaders) : 0
  const count = useSpringCount(target)

  // Nothing to show until the first indicator lands (keeps layout calm).
  if (!fellowship || !indicator) return null

  const avatars = indicator.sampleAvatars
  const label = isBook
    ? `Reading ${indicator.book} with ${count} ${count === 1 ? "other" : "others"}`
    : `${count.toLocaleString()} ${count === 1 ? "believer is" : "believers are"} reading the Bible`

  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={fellowship.openReaders}
        aria-label={
          isBook
            ? `${label}. Tap to see who is reading.`
            : `You're reading ${indicator.book}. ${label}. Tap to see who is reading.`
        }
        className={cn(
          "group inline-flex max-w-full items-center gap-2 rounded-full border border-border/50 bg-secondary/40 px-3 py-1.5",
          "text-sm text-muted-foreground backdrop-blur-sm transition-all duration-300",
          "hover:border-primary/30 hover:bg-secondary/70 hover:text-foreground active:scale-[0.98]",
        )}
      >
        {avatars.length > 0 ? (
          <span className="flex -space-x-2" aria-hidden>
            {avatars.map((src, i) => (
              <Avatar key={i} className="size-5 border-2 border-background">
                <AvatarImage src={src || undefined} alt="" />
                <AvatarFallback className="bg-primary/15 text-[9px]">·</AvatarFallback>
              </Avatar>
            ))}
          </span>
        ) : (
          <span
            className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-primary"
            aria-hidden
          >
            {isBook ? <Users className="size-3" /> : <Globe className="size-3" />}
          </span>
        )}

        <span className="truncate">
          {isBook ? (
            <>
              Reading <span className="font-semibold text-foreground">{indicator.book}</span> with{" "}
              <span className="font-semibold text-foreground tabular-nums">{count}</span>{" "}
              {count === 1 ? "other" : "others"}
            </>
          ) : (
            <>
              <span className="font-semibold text-foreground tabular-nums">
                {count.toLocaleString()}
              </span>{" "}
              {count === 1 ? "believer reading now" : "believers reading now"}
            </>
          )}
        </span>

        {/* A soft, slow pulse to signal "live" without shouting. */}
        <span className="relative flex size-2 shrink-0" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-chart-2/70 [animation-duration:2.5s]" />
          <span className="relative inline-flex size-2 rounded-full bg-chart-2" />
        </span>
      </button>
    </div>
  )
}
