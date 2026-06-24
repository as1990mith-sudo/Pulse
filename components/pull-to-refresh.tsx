"use client"

import { useRef, useState, type ReactNode } from "react"
import { ArrowDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const THRESHOLD = 72 // px of pull needed to trigger a refresh
const MAX_PULL = 110 // px the indicator can travel at most

/**
 * Mobile-style pull-to-refresh. Wrap any scrollable content; when the page is
 * scrolled to the very top and the user drags down past the threshold, the
 * `onRefresh` callback runs. Because it simply wraps its children, it works the
 * same on every tab it contains. Pulls only engage at scrollTop 0 and only for
 * downward gestures, so normal scrolling and horizontal carousels are untouched.
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void>
  children: ReactNode
}) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)

  function onTouchStart(e: React.TouchEvent) {
    if (refreshing) return
    // Only arm a pull when the user starts at the very top of the page.
    if (window.scrollY > 0) {
      startY.current = null
      return
    }
    startY.current = e.touches[0].clientY
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startY.current === null || refreshing) return
    const dy = e.touches[0].clientY - startY.current
    // Upward drag or the page has scrolled — let native scrolling take over.
    if (dy <= 0 || window.scrollY > 0) {
      setPull(0)
      return
    }
    // Apply resistance so the pull feels rubber-banded.
    setPull(Math.min(MAX_PULL, dy * 0.5))
  }

  async function onTouchEnd() {
    if (startY.current === null) return
    startY.current = null
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true)
      setPull(THRESHOLD)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        setPull(0)
      }
    } else {
      setPull(0)
    }
  }

  const ready = pull >= THRESHOLD
  const height = refreshing ? THRESHOLD : pull
  const dragging = startY.current !== null

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      {/* Indicator tray — expanding its height pushes the feed down as you pull. */}
      <div
        className="flex items-end justify-center overflow-hidden"
        style={{ height, transition: dragging ? "none" : "height 0.2s ease" }}
        aria-hidden={height === 0}
      >
        <div
          className="mb-2 flex size-9 items-center justify-center rounded-full bg-background shadow-md ring-1 ring-border"
          style={{ opacity: Math.min(1, pull / THRESHOLD) }}
        >
          {refreshing ? (
            <Loader2 className="size-5 animate-spin text-primary" />
          ) : (
            <ArrowDown
              className={cn(
                "size-5 text-muted-foreground transition-transform duration-200",
                ready && "-rotate-180 text-primary",
              )}
            />
          )}
        </div>
      </div>
      {children}
    </div>
  )
}
