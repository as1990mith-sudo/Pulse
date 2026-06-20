"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * Renders text that slowly scrolls right-to-left when it overflows its
 * container (Instagram/Spotify-style). Short titles that fit are left static.
 */
export function MarqueeTitle({ text, className }: { text: string; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const wrap = wrapRef.current
    const measure = measureRef.current
    if (!wrap || !measure) return
    const check = () => setOverflowing(measure.scrollWidth > wrap.clientWidth + 2)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [text])

  if (!overflowing) {
    return (
      <div ref={wrapRef} className={cn("marquee", className)}>
        <span ref={measureRef} className="inline-block truncate align-bottom">
          {text}
        </span>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className={cn("marquee", className)}>
      {/* Hidden measurer keeps the overflow check accurate after text changes */}
      <span ref={measureRef} className="pointer-events-none absolute -z-10 opacity-0" aria-hidden="true">
        {text}
      </span>
      <div className="marquee__track">
        <span>{text}</span>
        <span aria-hidden="true">{text}</span>
      </div>
    </div>
  )
}
