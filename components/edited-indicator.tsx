"use client"

import { useEffect, useRef, useState } from "react"
import { Info } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Compact "this post was edited" affordance. Replaces the permanent "· Edited"
 * text label with an info icon that keeps the post header clean; tapping (or
 * hovering) it reveals a small popup reading "Post was edited." The popup is
 * tap-driven so it works on touch devices, and dismisses on outside tap,
 * scroll, or Escape.
 */
export function EditedIndicator({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    // Close when the feed scrolls so the popup never floats detached.
    function onScroll() {
      setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKey)
    window.addEventListener("scroll", onScroll, true)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", onScroll, true)
    }
  }, [open])

  return (
    <span ref={wrapRef} className={cn("relative inline-flex shrink-0", className)}>
      <button
        type="button"
        aria-label="Post was edited"
        aria-expanded={open}
        onClick={(e) => {
          // Don't trigger the surrounding post's click/open behaviour.
          e.stopPropagation()
          e.preventDefault()
          setOpen((v) => !v)
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      {open && (
        <span
          role="status"
          className="absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 text-xs font-normal text-background shadow-md"
        >
          Post was edited
        </span>
      )}
    </span>
  )
}
