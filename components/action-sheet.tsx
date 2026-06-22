"use client"

import { useEffect } from "react"
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
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-background/60 backdrop-blur-md animate-in fade-in duration-200"
      />
      {/* Sheet */}
      <div
        className={cn(
          "relative z-10 m-3 w-full max-w-sm overflow-hidden rounded-3xl border border-border/70 bg-popover/95 p-1.5 shadow-2xl shadow-black/30 backdrop-blur-xl",
          "animate-in slide-in-from-bottom-4 fade-in zoom-in-95 duration-200",
        )}
      >
        {(title || preview) && (
          <div className="px-4 pb-1.5 pt-3 text-center">
            {title && (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
            )}
            {preview && <p className="mt-0.5 line-clamp-2 text-sm text-foreground/70">{preview}</p>}
          </div>
        )}
        <div className="space-y-0.5 p-1">
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
                  "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
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
    </div>
  )
}
