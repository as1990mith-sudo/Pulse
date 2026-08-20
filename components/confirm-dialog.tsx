"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Lightweight, dependency-free confirmation dialog used before destructive
 * actions (e.g. deleting a note). Renders a centered modal over a dimmed,
 * blurred backdrop — matching the note-editor sheets — and traps Escape to
 * cancel. Render it conditionally (`{open && <ConfirmDialog … />}`) or pass
 * `open`; both work since it returns null when closed.
 */
export function ConfirmDialog({
  open = true,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open?: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-border/60 bg-card p-5 shadow-2xl duration-150 animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {destructive && (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-pretty font-display text-base font-semibold text-foreground">{title}</h2>
            {message && <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">{message}</p>}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="tap-scale inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/60 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "tap-scale inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50",
              destructive
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground",
            )}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
