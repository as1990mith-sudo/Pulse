"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  Flag,
  ShieldAlert,
  EyeOff,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Check,
  Clock,
  FileText,
  MessageSquare,
  Mic,
  Users,
} from "lucide-react"
import { PageHeader, AdminCard, StatusBadge, EmptyState, Spinner } from "@/components/admin/kit"
import { Button } from "@/components/ui/button"
import {
  fetchReports,
  markReviewing,
  dismissReport,
  hideContent,
  removeContent,
  warnAuthor,
} from "@/app/actions/admin-moderation"
import type { ReportRow, ReportStatus } from "@/lib/admin/reports-types"
import { useUrlState } from "@/lib/navigation/use-url-state"
import { CONTENT_TYPE_LABELS } from "@/lib/admin/reports-types"
import { toast } from "sonner"
import { ModerationDialog } from "./moderation-dialog"

const TABS: { id: ReportStatus | "all"; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "reviewing", label: "Reviewing" },
  { id: "resolved", label: "Resolved" },
  { id: "dismissed", label: "Dismissed" },
  { id: "all", label: "All" },
]

const TYPE_ICON: Record<string, typeof FileText> = {
  feed_post: MessageSquare,
  feed_comment: MessageSquare,
  article: FileText,
  article_comment: FileText,
  episode: Mic,
  community_post: Users,
  user: Users,
}

const STATUS_TONE: Record<ReportStatus, "warning" | "info" | "success" | "neutral"> = {
  pending: "warning",
  reviewing: "info",
  resolved: "success",
  dismissed: "neutral",
}

type PendingAction = {
  kind: "dismiss" | "hide" | "remove" | "warn"
  report: ReportRow
}

export function ReportsModeration({
  initialRows,
  initialTotal,
  initialCounts,
  canAct,
}: {
  initialRows: ReportRow[]
  initialTotal: number
  initialCounts: Record<string, number>
  canAct: boolean
}) {
  // In the URL so the moderator's queue filter survives a reload and can be
  // shared as a link, instead of always resetting to Pending.
  const [tab, setTab] = useUrlState<ReportStatus | "all">("status", "pending", {
    valid: TABS.map((t) => t.id),
  })
  const [pending, setPending] = useState<PendingAction | null>(null)

  const { data, isLoading, mutate } = useSWR(
    ["reports", tab],
    () => fetchReports(tab, 0),
    {
      fallbackData: tab === "pending" ? { rows: initialRows, total: initialTotal, counts: initialCounts } : undefined,
      revalidateOnFocus: false,
    },
  )

  const rows = data?.rows ?? []
  const counts = data?.counts ?? initialCounts

  async function onReview(report: ReportRow) {
    try {
      await markReviewing(report.id)
      toast.success("Marked as reviewing")
      mutate()
    } catch {
      toast.error("Could not update report")
    }
  }

  async function runAction(reason: string) {
    if (!pending) return
    const { kind, report } = pending
    try {
      if (kind === "dismiss") {
        await dismissReport(report.id, reason)
      } else if (kind === "hide") {
        await hideContent({
          contentType: report.contentType,
          contentId: report.contentId,
          reason,
          authorId: report.content.authorId,
          reportId: report.id,
        })
      } else if (kind === "remove") {
        await removeContent({
          contentType: report.contentType,
          contentId: report.contentId,
          reason,
          authorId: report.content.authorId,
          reportId: report.id,
        })
      } else if (kind === "warn") {
        await warnAuthor({
          contentType: report.contentType,
          contentId: report.contentId,
          reason,
          authorId: report.content.authorId,
          reportId: report.id,
        })
      }
      toast.success("Action recorded")
      setPending(null)
      mutate()
    } catch {
      toast.error("Action failed")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports & Moderation"
        description="Review reported content, take action, and keep a permanent record of every decision."
      />

      {/* Status tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.id
          const n = counts[t.id]
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative -mb-px flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-b-2 border-primary text-foreground"
                  : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {typeof n === "number" && n > 0 && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                  {n}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {isLoading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="Nothing to review"
          description={
            tab === "pending"
              ? "There are no pending reports. New reports will appear here for triage."
              : `No ${tab} reports.`
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => {
            const Icon = TYPE_ICON[r.contentType] ?? Flag
            const removed = r.content.state !== "visible"
            return (
              <AdminCard key={r.id}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {CONTENT_TYPE_LABELS[r.contentType] ?? r.contentType}
                        </span>
                        <StatusBadge tone={STATUS_TONE[r.status]}>{r.status}</StatusBadge>
                        {r.reportCount > 1 && (
                          <StatusBadge tone="danger">{`Reported ${r.reportCount}×`}</StatusBadge>
                        )}
                        {removed && <StatusBadge tone="neutral">{r.content.state}</StatusBadge>}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Reason:</span> {r.reason}
                        {r.details ? ` — ${r.details}` : ""}
                      </p>
                      {r.content.found ? (
                        <div className="mt-2 rounded-lg border border-border bg-muted/40 p-3">
                          {r.content.title && (
                            <p className="text-sm font-medium text-foreground">{r.content.title}</p>
                          )}
                          <p className="line-clamp-3 text-sm text-muted-foreground">{r.content.excerpt}</p>
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            by {r.content.authorName ?? "Unknown"} ·{" "}
                            {r.content.createdAt ? new Date(r.content.createdAt).toLocaleDateString() : "—"}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs italic text-muted-foreground">
                          Original content is no longer available.
                        </p>
                      )}
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(r.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {canAct && r.status !== "resolved" && r.status !== "dismissed" && (
                    <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col lg:items-stretch">
                      {r.status === "pending" && (
                        <Button variant="outline" size="sm" onClick={() => onReview(r)}>
                          <ShieldAlert className="mr-1.5 h-4 w-4" />
                          Review
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => setPending({ kind: "warn", report: r })}>
                        <AlertTriangle className="mr-1.5 h-4 w-4" />
                        Warn
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setPending({ kind: "hide", report: r })}>
                        <EyeOff className="mr-1.5 h-4 w-4" />
                        Hide
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setPending({ kind: "remove", report: r })}>
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        Remove
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setPending({ kind: "dismiss", report: r })}>
                        <Check className="mr-1.5 h-4 w-4" />
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              </AdminCard>
            )
          })}
        </div>
      )}

      <ModerationDialog
        action={pending?.kind ?? null}
        onClose={() => setPending(null)}
        onConfirm={runAction}
      />
    </div>
  )
}
