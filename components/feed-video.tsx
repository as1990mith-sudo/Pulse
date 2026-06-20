"use client"

import { useEffect, useRef } from "react"

/**
 * A feed video that auto-plays (muted) when scrolled into view and pauses when
 * scrolled away — while still letting the user manually pause/play via the
 * native controls.
 *
 * Because every instance pauses itself the moment it leaves the viewport, only
 * the video currently in view plays: scrolling to the next clip starts it and
 * stops the previous one automatically.
 */
export function FeedVideo({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  // True when the user explicitly paused while the video was on-screen, so we
  // don't fight them by auto-resuming until they scroll away and back.
  const userPausedRef = useRef(false)
  // True while we issue a programmatic pause (scroll-away) so the pause handler
  // doesn't misread it as a manual pause.
  const programmaticPauseRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          // Scrolled into view — auto-play unless the user paused on purpose.
          if (!userPausedRef.current) void el.play().catch(() => {})
        } else {
          // Scrolled away — pause and clear the manual flag so it resumes the
          // next time it scrolls back into view.
          programmaticPauseRef.current = true
          el.pause()
          userPausedRef.current = false
        }
      },
      { threshold: [0, 0.6, 1] },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <video
      ref={ref}
      src={src}
      muted
      loop
      playsInline
      controls
      className={className}
      onPause={() => {
        // Ignore our own scroll-away pause; only remember user-initiated pauses.
        if (programmaticPauseRef.current) {
          programmaticPauseRef.current = false
          return
        }
        userPausedRef.current = true
      }}
      onPlay={() => {
        userPausedRef.current = false
      }}
    />
  )
}
