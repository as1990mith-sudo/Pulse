"use client"

import { useEffect, useState } from "react"
import { Flag, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { haptic } from "@/lib/haptics"

export const REPORT_REASONS = [
  "Spam",
  "Harassment or bullying",
  "Hate speech",
  "Misinformation",
  "Nudity or sexual content",
  "Other",
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]

type ReportReasonModalProps = {
  open: boolean
  onClose: () => void
  /** Short label for what is being reported, e.g. a post author's name. */
  subjectLabel?: string
  /**
   * Called when a report is submitted. Stubbed for now — no backend yet, this
   * will later route into the support/moderation system.
   */
  onSubmit?: (reason: ReportReason) => void
}

/**
 * Reusable "report" modal: a tappable list of reasons plus a submit button.
 * On submit it shows a self-dismissing confirmation (no global toast system
 * exists yet) and calls the optional onSubmit callback.
 */
export function ReportReasonModal({ open, onClose, subjectLabel, onSubmit }: ReportReasonModalProps) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [submitted, setSubmitted] = useState(false)

  // Reset transient state whenever the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setReason(null)
      setSubmitted(false)
    }
  }, [open])

  // Auto-close shortly after a successful submit.
  useEffect(() => {
    if (!submitted) return
    const t = setTimeout(onClose, 1700)
    return () => clearTimeout(t)
  }, [submitted, onClose])

  if (!open) return null

  function handleSubmit() {
    if (!reason) return
    // Stub: this will route to the support/moderation backend later.
    console.log("[v0] Report submitted:", { reason, subject: subjectLabel ?? null })
    onSubmit?.(reason)
    haptic("light")
    setSubmitted(true)
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Report post"
    >
      <button
        type="button"
        aria-label="Close report dialog"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in-0"
      />
      <div className="relative z-10 m-3 w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-popover/90 p-5 shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-150">
        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-6" />
            </span>
            <h3 className="text-base font-bold">Report submitted</h3>
            <p className="text-sm text-muted-foreground text-pretty">
              Our team will review it.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
                <Flag className="size-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold">Report post</h3>
                <p className="truncate text-xs text-muted-foreground">
                  {subjectLabel ? `Tell us what's wrong with ${subjectLabel}'s post` : "Choose a reason"}
                </p>
              </div>
            </div>

            <ul className="space-y-1.5" role="radiogroup" aria-label="Report reason">
              {REPORT_REASONS.map((r) => {
                const active = reason === r
                return (
                  <li key={r}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setReason(r)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors",
                        active
                          ? "border-primary bg-primary/10 font-medium text-foreground"
                          : "border-white/10 text-foreground/90 hover:bg-white/5 active:bg-white/10",
                      )}
                    >
                      {r}
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          active ? "border-primary bg-primary" : "border-muted-foreground/50",
                        )}
                      >
                        {active && <span className="size-1.5 rounded-full bg-primary-foreground" />}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full bg-secondary px-4 py-2.5 text-sm font-medium transition-colors hover:bg-secondary/80 active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reason}
                onClick={handleSubmit}
                className="flex-1 rounded-full bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground transition-all hover:bg-destructive/90 active:scale-[0.98] disabled:opacity-50"
              >
                Submit
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
