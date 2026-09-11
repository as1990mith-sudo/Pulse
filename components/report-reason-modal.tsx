"use client"

import { useEffect, useState, useTransition } from "react"
import { Flag, Check, Loader2, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { haptic } from "@/lib/haptics"
import { submitHomeReport } from "@/app/actions/home-reports"
import {
  REPORT_CONFIRMATION,
  REPORT_REASONS as HOME_REPORT_REASONS,
  type ReportReason as HomeReportReason,
  type ReportTargetType,
} from "@/lib/home/moderation"

// Legacy string reasons kept for the mention-report path (platform moderation),
// which still calls onSubmit(reason) with a display string.
export const REPORT_REASONS = HOME_REPORT_REASONS.map((r) => r.label)
export type ReportReason = string

/** Describes a Home-scoped report target; when present the modal files a real report. */
export type HomeReportTarget = {
  /** Only needed for member reports; post/comment reports derive the Home server-side. */
  handle?: string
  targetType: ReportTargetType
  /** Post/comment id (as string). Omit for a member report. */
  targetId?: string | null
  /** Required for a member report; derived server-side for post/comment. */
  reportedUserId?: string | null
}

type ReportReasonModalProps = {
  open: boolean
  onClose: () => void
  /** Short label for what/who is being reported, e.g. a post author's name. */
  subjectLabel?: string
  /** What kind of thing is being reported (drives copy). Defaults to "post". */
  kind?: ReportTargetType
  /**
   * When provided, the modal submits directly into the Home's Reports queue.
   * This is the primary path for reporting members, posts, and comments.
   */
  homeReport?: HomeReportTarget
  /**
   * Legacy callback path (e.g. mention reports routed to platform moderation).
   * Ignored when `homeReport` is provided.
   */
  onSubmit?: (reason: ReportReason) => void
}

const KIND_NOUN: Record<ReportTargetType, string> = {
  member: "member",
  post: "post",
  comment: "comment",
}

/**
 * Reusable "report" modal: a compact, tappable list of reasons plus an optional
 * detail note and submit button. On success it shows a self-dismissing
 * "Report submitted" confirmation.
 *
 * Governance: the `homeReport` path files into the Home's own Reports queue
 * (Home Admins), never the Frequency Super Admin. The reporter's identity is
 * never revealed to the reported member.
 */
export function ReportReasonModal({
  open,
  onClose,
  subjectLabel,
  kind = "post",
  homeReport,
  onSubmit,
}: ReportReasonModalProps) {
  const [reasonId, setReasonId] = useState<HomeReportReason | null>(null)
  const [details, setDetails] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Reset transient state whenever the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setReasonId(null)
      setDetails("")
      setSubmitted(false)
      setError(null)
    }
  }, [open])

  // Auto-close shortly after a successful submit.
  useEffect(() => {
    if (!submitted) return
    const t = setTimeout(onClose, 1700)
    return () => clearTimeout(t)
  }, [submitted, onClose])

  if (!open) return null

  const noun = KIND_NOUN[homeReport?.targetType ?? kind]

  function handleSubmit() {
    if (!reasonId) return
    setError(null)

    if (homeReport) {
      startTransition(async () => {
        try {
          await submitHomeReport({
            handle: homeReport.handle,
            targetType: homeReport.targetType,
            targetId: homeReport.targetId ?? null,
            reportedUserId: homeReport.reportedUserId ?? null,
            reason: reasonId,
            details: details.trim() || null,
          })
          haptic("light")
          setSubmitted(true)
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't submit your report.")
        }
      })
      return
    }

    // Legacy path: hand the display label back to the caller.
    const label = HOME_REPORT_REASONS.find((r) => r.id === reasonId)?.label ?? "Other"
    onSubmit?.(label)
    haptic("light")
    setSubmitted(true)
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Report ${noun}`}
    >
      <button
        type="button"
        aria-label="Close report dialog"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in-0"
      />
      <div className="relative z-10 m-3 flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-white/10 bg-popover/90 p-5 shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-150">
        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-6" />
            </span>
            <h3 className="text-base font-bold">{REPORT_CONFIRMATION}</h3>
            <p className="text-pretty text-sm text-muted-foreground">Thanks — your Home&apos;s admins will review it.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
                <Flag className="size-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold">Report {noun}</h3>
                <p className="truncate text-xs text-muted-foreground">Tell us what&apos;s wrong</p>
              </div>
            </div>

            <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="report-reason">
              Reason
            </label>
            <div className="relative">
              <select
                id="report-reason"
                value={reasonId ?? ""}
                onChange={(e) => setReasonId((e.target.value || null) as HomeReportReason | null)}
                className={cn(
                  "w-full appearance-none rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 pr-10 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary",
                  reasonId ? "text-foreground" : "text-muted-foreground/70",
                )}
              >
                <option value="" disabled>
                  Select a reason…
                </option>
                {HOME_REPORT_REASONS.map((r) => (
                  <option key={r.id} value={r.id} className="bg-popover text-foreground">
                    {r.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            </div>

            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              placeholder="Add a comment (optional)"
              className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary"
            />

            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full bg-secondary px-4 py-2.5 text-sm font-medium transition-colors hover:bg-secondary/80 active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reasonId || pending}
                onClick={handleSubmit}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground transition-all hover:bg-destructive/90 active:scale-[0.98] disabled:opacity-50"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Send report
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
