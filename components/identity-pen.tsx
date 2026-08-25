"use client"

import { useEffect, useRef, useState } from "react"
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
 * or Escape so the popup never floats detached from its post.
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
  const wrapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
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

  // With no handle AND no edit, the pen would open an empty popup, so render
  // nothing at all rather than a control that does nothing.
  if (!handle && !edited) return null

  const label = handle ? (edited ? `${handle}, edited` : handle) : "Post was edited"

  return (
    <span ref={wrapRef} className={cn("relative inline-flex shrink-0", className)}>
      <button
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
      {open && (
        <span
          role="status"
          className="absolute top-full left-0 z-50 mt-1.5 flex flex-col whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 text-xs font-normal text-background shadow-md"
        >
          {handle && <span className="font-medium">{handle}</span>}
          {edited && <span className={cn(handle && "text-background/70")}>Post was edited.</span>}
        </span>
      )}
    </span>
  )
}
