"use client"

import { useState } from "react"
import useSWR from "swr"
import Image from "next/image"
import {
  BookOpen,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  TrendingUp,
  FileText,
} from "lucide-react"
import { PageHeader, StatCard, StatusBadge, EmptyState, Spinner } from "@/components/admin/kit"
import { fetchBookSubmissions } from "@/app/actions/admin-books"
import { useUrlState } from "@/lib/navigation/use-url-state"
import { useOverlayHistory } from "@/lib/navigation/use-overlay-history"
import type { BookSubmissionRow, SubmissionStatus } from "@/lib/admin/books"
import { BookReviewDrawer } from "./book-review-drawer"

const TABS: { id: SubmissionStatus | "all"; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "changes_requested", label: "Changes Requested" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
]

const STATUS_TONE: Record<SubmissionStatus, "warning" | "info" | "success" | "danger"> = {
  pending: "warning",
  changes_requested: "info",
  approved: "success",
  rejected: "danger",
}

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: "Pending",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
}

type Stats = {
  total: number
  pending: number
  approved: number
  rejected: number
  changes: number
  avgHours: number | null
  approvalRate: number | null
  publishedBooks: number
}

export function BooksApproval({
  initialRows,
  initialTotal,
  initialCounts,
  stats,
  canApprove,
}: {
  initialRows: BookSubmissionRow[]
  initialTotal: number
  initialCounts: Record<string, number>
  stats: Stats
  canApprove: boolean
}) {
  // In the URL so reviewing a submission and coming back keeps the moderator in
  // the queue they were working, and so a filtered queue is shareable as a link.
  const [tab, setTab] = useUrlState<SubmissionStatus | "all">("status", "pending", {
    valid: TABS.map((t) => t.id),
  })
  const [active, setActive] = useState<BookSubmissionRow | null>(null)
  // The review drawer is an overlay, so Back should close it rather than leave
  // the approval queue.
  useOverlayHistory(!!active, () => setActive(null), "book-review")

  const { data, isLoading, mutate } = useSWR(
    ["book-submissions", tab],
    () => fetchBookSubmissions(tab, 0),
    {
      fallbackData: tab === "pending" ? { rows: initialRows, total: initialTotal, counts: initialCounts } : undefined,
      revalidateOnFocus: false,
    },
  )

  const rows = data?.rows ?? []
  const counts = data?.counts ?? initialCounts

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Books Approval Centre"
        description="Review submitted books, preview the manuscript, and approve, reject, or request changes before they go live in the store."
      />

      {/* Analytics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Clock} label="Pending review" value={stats.pending} accent="warning" />
        <StatCard
          icon={TrendingUp}
          label="Approval rate"
          value={stats.approvalRate === null ? "—" : `${stats.approvalRate}%`}
          accent="primary"
        />
        <StatCard
          icon={Clock}
          label="Avg. time to decision"
          value={stats.avgHours === null ? "—" : `${stats.avgHours}h`}
        />
        <StatCard icon={BookOpen} label="Live in store" value={stats.publishedBooks} accent="success" />
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {TABS.map((t) => {
          const activeTab = tab === t.id
          const n = counts[t.id]
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative -mb-px flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab
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
          icon={BookOpen}
          title="No submissions"
          description={
            tab === "pending"
              ? "There are no books waiting for review. New submissions will appear here."
              : `No ${STATUS_LABEL[tab as SubmissionStatus]?.toLowerCase() ?? tab} submissions.`
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setActive(b)}
              className="rounded-2xl border border-border/70 bg-card/70 p-5 text-left shadow-soft backdrop-blur-xl transition-colors hover:border-primary/40"
            >
              <div className="flex gap-4">
                <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                  {b.cover ? (
                    <Image src={b.cover || "/placeholder.svg"} alt="" fill sizes="64px" className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <FileText className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold text-foreground">{b.title}</h3>
                    <StatusBadge tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</StatusBadge>
                  </div>
                  {b.subtitle && <p className="truncate text-xs text-muted-foreground">{b.subtitle}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">by {b.author}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {b.category && <span>{b.category}</span>}
                    {b.pages ? <span>{b.pages} pages</span> : null}
                    <span>{b.priceCents === 0 ? "Free" : `$${(b.priceCents / 100).toFixed(2)}`}</span>
                    {b.submissionCount > 1 && <span>Resubmission #{b.submissionCount}</span>}
                  </div>
                  {b.status === "changes_requested" && b.feedback && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                      <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="line-clamp-2">{b.feedback}</span>
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <BookReviewDrawer
        submission={active}
        canApprove={canApprove}
        onClose={() => setActive(null)}
        onReviewed={() => {
          setActive(null)
          mutate()
        }}
      />
    </div>
  )
}
