"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Pencil } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Compact "this post was edited" affordance. Replaces the permanent "· Edited"
 * text label with a small pen icon that keeps the post header clean and reads as
 * an editing mark rather than generic information; tapping (or hovering) it
 * reveals a small popup reading "Post was edited." The popup is
 * tap-driven so it works on touch devices, and dismisses on outside tap,
 * scroll, or Escape.
 *
 * The popup is rendered in a portal on <body> and its x-position is clamped to
 * the viewport, so it never bleeds off the right (or left) edge when the pen
 * sits at the end of a post header — the source of the previous overflow.
 */
export function EditedIndicator({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setMounted(true), [])

  // Measure the trigger and place the popup just below it, centered on the pen
  // but clamped to stay fully on-screen with an 8px gutter on each side.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const gutter = 8
    const width = 120 // approx popup width; used only for clamping the center
    const anchorX = rect.left + rect.width / 2
    const half = width / 2
    const maxLeft = window.innerWidth - gutter - half
    const minLeft = gutter + half
    const left = Math.min(Math.max(anchorX, minLeft), maxLeft)
    setCoords({ top: rect.bottom + 6, left })
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    // Close when anything scrolls so the popup never floats detached.
    function onScroll() {
      setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKey)
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onScroll)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onScroll)
    }
  }, [open])

  return (
    <span ref={wrapRef} className={cn("relative inline-flex shrink-0", className)}>
      <button
        ref={btnRef}
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
        <Pencil className="size-3" aria-hidden />
      </button>
      {open && mounted && coords &&
        createPortal(
          <span
            role="status"
            style={{ top: coords.top, left: coords.left }}
            className="pointer-events-none fixed z-[100] -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 text-xs font-normal text-background shadow-md"
          >
            Post was edited.
          </span>,
          document.body,
        )}
    </span>
  )
}
