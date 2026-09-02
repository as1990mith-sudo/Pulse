"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Pencil } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Replaces the always-visible "@username" line under a post author's display
 * name with the same small pen affordance the main feed uses for edited posts.
 *
 * The handle is rarely the thing a reader needs — the display name and avatar
 * already identify the author — so spending a permanent second line on it made
 * every post header taller for information almost nobody was looking for.
 * Tapping the pen reveals the handle on demand, and because a post's "edited"
 * state is the same kind of secondary provenance detail, the pen carries that
 * too instead of sitting next to a second, near-identical pen.
 *
 * Mechanics deliberately mirror `EditedIndicator`: tap-driven so it works on
 * touch, with hover as a desktop convenience, dismissing on outside tap, scroll
 * or Escape so the popup never floats detached from its post. The popup renders
 * in a portal on <body> with its x-position clamped to the viewport, so the
 * "handle / Post was edited" bubble never bleeds off the right (or left) edge
 * when the pen sits at the end of a right-aligned post header.
 */
export function IdentityPen({
  handle,
  edited,
  className,
}: {
  handle?: string | null
  edited?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setMounted(true), [])

  // Measure the trigger and place the popup just below it, centered on the pen
  // but clamped to stay fully on-screen with an 8px gutter on each side. Sized
  // a touch wider than EditedIndicator's because this bubble can show a handle.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const gutter = 8
    const width = 200 // approx max popup width; used only for clamping the center
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
    // Close when anything scrolls/resizes so the popup never floats detached.
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

  // With no handle AND no edit, the pen would open an empty popup, so render
  // nothing at all rather than a control that does nothing.
  if (!handle && !edited) return null

  const label = handle ? (edited ? `${handle}, edited` : handle) : "Post was edited"

  return (
    <span ref={wrapRef} className={cn("relative inline-flex shrink-0", className)}>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          // Never let this bubble into the post's own open/navigate handler.
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
            className="pointer-events-none fixed z-[100] flex -translate-x-1/2 flex-col whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 text-xs font-normal text-background shadow-md"
          >
            {handle && <span className="font-medium">{handle}</span>}
            {edited && <span className={cn(handle && "text-background/70")}>Post was edited.</span>}
          </span>,
          document.body,
        )}
    </span>
  )
}
