"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type SheetAction = {
  label: string
  icon: LucideIcon
  onClick: () => void
  /** Renders the row in the destructive color (e.g. delete). */
  destructive?: boolean
  /** Optional secondary line under the label (e.g. "No longer editable"). */
  hint?: string
  /** When true the row is shown but not clickable. */
  disabled?: boolean
}

/**
 * Ultra-modern action popup shared across the app (messages, posts, comments).
 * Renders a blurred backdrop and a floating, springy sheet. On small screens it
 * docks to the bottom like a native action sheet; on larger screens it centers.
 */
export function ActionSheet({
  open,
  onClose,
  title,
  preview,
  actions,
}: {
  open: boolean
  onClose: () => void
  title?: string
  /** Optional snippet of the target content shown under the title. */
  preview?: string
  actions: SheetAction[]
}) {
  // Only portal on the client (document is unavailable during SSR).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Interactive drag-to-dismiss (mobile bottom-sheet). Track the live drag
  // offset and whether a drag is in progress so we can disable the spring
  // transition while the finger is down, then spring back / dismiss on release.
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragState = useRef<{ startY: number; startT: number } | null>(null)

  useEffect(() => {
    if (!open) return
    // Reset any leftover drag offset whenever the sheet (re)opens.
    setDragY(0)
    setDragging(false)
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  function onPointerDown(e: React.PointerEvent) {
    dragState.current = { startY: e.clientY, startT: Date.now() }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return
    // Only allow dragging downward; clamp upward pull with light resistance.
    const delta = e.clientY - dragState.current.startY
    setDragY(delta > 0 ? delta : delta / 4)
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!dragState.current) return
    const delta = e.clientY - dragState.current.startY
    const elapsed = Date.now() - dragState.current.startT
    const velocity = delta / Math.max(elapsed, 1) // px per ms
    dragState.current = null
    setDragging(false)
    // Dismiss on a long enough pull or a quick flick; otherwise spring back.
    if (delta > 110 || velocity > 0.6) {
      onClose()
    } else {
      setDragY(0)
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* pointer already released */
    }
  }

  if (!open || !mounted) return null

  return createPortal(
    // z-[85] so this per-item action menu always sits above the content sheets
    // it can be launched from — notably the CommentSheet (z-70) used by feed,
    // devotional, community help and dream interpretation — instead of hiding
    // behind them. (In Reels the thread has no wrapping sheet, so it already
    // showed correctly.)
    <div className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-background/60 backdrop-blur-md animate-in fade-in duration-200"
      />
      {/* Sheet */}
      <div
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined }}
        className={cn(
          "relative z-10 m-3 w-full max-w-sm overflow-hidden rounded-3xl border border-border/70 bg-popover/95 p-2 shadow-floating backdrop-blur-xl",
          "animate-in slide-in-from-bottom-4 fade-in zoom-in-95 duration-200",
          !dragging && "sheet-settle",
        )}
      >
        {/* Grab handle — drag down to dismiss (primarily for touch). */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="flex cursor-grab touch-none justify-center pb-1 pt-2 active:cursor-grabbing sm:hidden"
        >
          <span className="h-1.5 w-10 rounded-full bg-foreground/20" />
        </div>
        {(title || preview) && (
          <div className="px-4 pb-2 pt-2 text-center">
            {title && (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
            )}
            {preview && <p className="mt-1 line-clamp-2 text-sm text-foreground/70">{preview}</p>}
          </div>
        )}
        <div className="space-y-1">
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.label}
                type="button"
                disabled={action.disabled}
                onClick={() => {
                  action.onClick()
                  onClose()
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium transition-colors",
                  action.disabled
                    ? "cursor-not-allowed opacity-40"
                    : action.destructive
                      ? "text-destructive hover:bg-destructive/10"
                      : "text-foreground hover:bg-secondary",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-xl",
                    action.destructive ? "bg-destructive/10 text-destructive" : "bg-secondary text-foreground",
                  )}
                >
                  <Icon className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{action.label}</span>
                  {action.hint && <span className="block truncate text-xs font-normal text-muted-foreground">{action.hint}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
