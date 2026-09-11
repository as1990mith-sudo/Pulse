"use client"

import { useMemo, useState, useTransition } from "react"
import useSWR from "swr"
import { Flag, Loader2, ShieldAlert, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getHomeReports,
  resolveReport,
  setReportStatus,
} from "@/app/actions/home-reports"
import {
  REPORT_RESOLUTIONS,
  REPORT_STATUS_META,
  REPORT_TARGET_LABEL,
  SUSPENSION_DURATIONS,
  type HomeReportQueueCounts,
  type HomeReportView,
  type ReportResolution,
  type ReportStatus,
  type SuspensionDurationId,
} from "@/lib/home/moderation"
import { MemberAvatar, Segmented, formatTimelineStamp } from "@/components/home/admin/members/shared"

type StatusFilter = ReportStatus | "all"

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "under_review", label: "Under Review" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
]

export function ReportsManager({
  handle,
  initialReports,
  initialCounts,
}: {
  handle: string
  initialReports: HomeReportView[]
  initialCounts: HomeReportQueueCounts
}) {
  const [filter, setFilter] = useState<StatusFilter>("pending")
  const [openId, setOpenId] = useState<string | null>(null)

  const { data, mutate } = useSWR(["home-reports", handle], () => getHomeReports(handle, "all"), {
    fallbackData: { reports: initialReports, counts: initialCounts },
    revalidateOnFocus: true,
  })

  const reports = data?.reports ?? initialReports
  const counts = data?.counts ?? initialCounts

  const visible = useMemo(
    () => (filter === "all" ? reports : reports.filter((r) => r.status === filter)),
    [reports, filter],
  )

  const openReport = openId ? reports.find((r) => r.id === openId) ?? null : null

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-xl font-semibold tracking-tight lg:text-2xl">Reports</h1>
          {counts.pending > 0 && (
            <span
              className="inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white"
              style={{ backgroundColor: "var(--home-accent)" }}
            >
              {counts.pending}
            </span>
          )}
        </div>
        <p className="text-pretty text-sm text-muted-foreground">
          Member reports for this Home. Reviewed and resolved by your admin team — never shared with the reported member.
        </p>
      </header>

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <Segmented
          options={FILTERS.map((f) => ({
            id: f.id,
            label:
              f.id === "all"
                ? `All ${counts.total}`
                : `${f.label} ${counts[f.id as ReportStatus]}`,
          }))}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter reports by status"
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border/50 bg-card/50 backdrop-blur-xl [&>li:not(:last-child)]:border-b [&>li:not(:last-child)]:border-border/40">
          {visible.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setOpenId(r.id)}
                className="tap-scale flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-foreground/[0.03]"
              >
                <MemberAvatar
                  name={r.reported.name}
                  image={r.reported.image}
                  initials={r.reported.initials}
                  color={r.reported.color}
                  className="size-10 text-xs"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold">{r.reported.name}</p>
                    <StatusChip status={r.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    <span className="text-foreground/70">{REPORT_TARGET_LABEL[r.targetType]}</span> · {r.reasonLabel}
                  </p>
                  {r.targetPreview && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground/80">“{r.targetPreview}”</p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openReport && (
        <ReportDrawer
          handle={handle}
          report={openReport}
          onClose={() => setOpenId(null)}
          onChanged={() => void mutate()}
        />
      )}
    </div>
  )
}

function StatusChip({ status }: { status: ReportStatus }) {
  const meta = REPORT_STATUS_META[status]
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        meta.chip,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </span>
  )
}

function EmptyState({ filter }: { filter: StatusFilter }) {
  const label =
    filter === "resolved" ? "No resolved reports" : filter === "all" ? "No reports yet" : "Nothing to review"
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 bg-card/40 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Flag className="size-6" />
      </span>
      <p className="font-display text-base font-semibold tracking-tight">{label}</p>
      <p className="max-w-xs text-pretty text-sm text-muted-foreground">
        When members report content or each other, it lands here for your team to review.
      </p>
    </div>
  )
}

// ── Detail drawer ──────────────────────────────────────────────────────────────
function ReportDrawer({
  handle,
  report,
  onClose,
  onChanged,
}: {
  handle: string
  report: HomeReportView
  onClose: () => void
  onChanged: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [resolution, setResolution] = useState<ReportResolution>(
    report.targetType === "member" ? "warning" : "content_removed",
  )
  const [duration, setDuration] = useState<SuspensionDurationId>("24h")
  const [note, setNote] = useState("")
  const resolved = report.status === "resolved"

  function markUnderReview() {
    startTransition(async () => {
      await setReportStatus(handle, report.id, "under_review")
      onChanged()
    })
  }

  function submitResolution() {
    startTransition(async () => {
      await resolveReport(handle, report.id, resolution, {
        reason: note.trim() || null,
        suspensionDuration: duration,
      })
      onChanged()
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Report details">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div
        className={cn(
          "absolute bg-card shadow-elevated",
          "inset-0",
          "sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[440px] sm:border-l sm:border-border/60",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Report</p>
            <button
              type="button"
              onClick={onClose}
              className="tap-scale flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto" data-scroll>
            <div className="space-y-5 px-4 py-4">
              {/* Reported member */}
              <div className="flex items-center gap-3">
                <MemberAvatar
                  name={report.reported.name}
                  image={report.reported.image}
                  initials={report.reported.initials}
                  color={report.reported.color}
                  className="size-14 text-sm"
                />
                <div className="min-w-0">
                  <h2 className="truncate font-display text-lg font-semibold tracking-tight">{report.reported.name}</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    Reported {REPORT_TARGET_LABEL[report.targetType].toLowerCase()} · {report.reasonLabel}
                  </p>
                  <div className="mt-1">
                    <StatusChip status={report.status} />
                  </div>
                </div>
              </div>

              {/* Reported content */}
              {report.targetPreview && (
                <Section title={`Reported ${REPORT_TARGET_LABEL[report.targetType].toLowerCase()}`}>
                  <blockquote className="rounded-xl border border-border/50 bg-background/40 px-3 py-2.5 text-sm text-foreground/90">
                    “{report.targetPreview}”
                  </blockquote>
                </Section>
              )}

              {/* Reason + details */}
              <Section title="Reason">
                <div className="rounded-xl border border-border/50">
                  <Row label="Category" value={report.reasonLabel} />
                  {report.details && <Row label="Details" value={report.details} />}
                  <Row label="Submitted" value={formatTimelineStamp(report.createdAt)} />
                </div>
              </Section>

              {/* Reporter — admin-only, never shown to the reported member */}
              <Section title="Reported by">
                <div className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-background/40 px-3 py-2.5">
                  <MemberAvatar
                    name={report.reporter.name}
                    image={null}
                    initials={report.reporter.initials}
                    color={report.reporter.color}
                    className="size-8 text-[10px]"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{report.reporter.name}</p>
                    <p className="text-[11px] text-muted-foreground">Visible to admins only</p>
                  </div>
                </div>
              </Section>

              {resolved ? (
                <Section title="Resolution">
                  <div className="rounded-xl border border-border/50">
                    <Row label="Outcome" value={report.resolutionLabel ?? "Resolved"} />
                    {report.resolvedByName && <Row label="By" value={report.resolvedByName} />}
                    {report.resolvedAt && <Row label="When" value={formatTimelineStamp(report.resolvedAt)} />}
                  </div>
                </Section>
              ) : (
                <>
                  {report.status === "pending" && (
                    <button
                      type="button"
                      onClick={markUnderReview}
                      disabled={pending}
                      className="tap-scale flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 px-3 py-2.5 text-sm font-medium transition-colors hover:bg-foreground/[0.04] disabled:opacity-60"
                    >
                      <ShieldAlert className="size-4 text-muted-foreground" />
                      Mark under review
                    </button>
                  )}

                  <Section title="Resolve">
                    <div className="space-y-2">
                      <div className="grid gap-1.5">
                        {REPORT_RESOLUTIONS.filter((r) =>
                          r.id === "content_removed" ? report.targetType !== "member" : true,
                        ).map((r) => {
                          const active = resolution === r.id
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => setResolution(r.id)}
                              className={cn(
                                "tap-scale flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-colors",
                                active
                                  ? "border-[var(--home-accent)] bg-[color-mix(in_oklab,var(--home-accent)_10%,transparent)]"
                                  : "border-border/60 hover:bg-foreground/[0.03]",
                              )}
                            >
                              <span className="text-sm font-medium">{r.label}</span>
                              <span className="text-xs text-muted-foreground">{r.hint}</span>
                            </button>
                          )
                        })}
                      </div>

                      {resolution === "member_suspended" && (
                        <div className="rounded-xl border border-border/60 p-2">
                          <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            Suspension length
                          </p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {SUSPENSION_DURATIONS.map((d) => {
                              const active = duration === d.id
                              return (
                                <button
                                  key={d.id}
                                  type="button"
                                  onClick={() => setDuration(d.id)}
                                  className={cn(
                                    "tap-scale rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
                                    active
                                      ? "border-[var(--home-accent)] text-foreground"
                                      : "border-border/60 text-muted-foreground hover:text-foreground",
                                  )}
                                  style={
                                    active
                                      ? { backgroundColor: "color-mix(in oklab, var(--home-accent) 12%, transparent)" }
                                      : undefined
                                  }
                                >
                                  {d.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {(resolution === "warning" || resolution === "member_suspended") && (
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          rows={2}
                          placeholder="Optional note for your records"
                          className="w-full resize-none rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[var(--home-accent)]"
                        />
                      )}

                      <button
                        type="button"
                        onClick={submitResolution}
                        disabled={pending}
                        className="tap-scale flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                        style={{ backgroundColor: "var(--home-accent)" }}
                      >
                        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                        Resolve report
                      </button>
                    </div>
                  </Section>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 px-3 py-2.5 last:border-0">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{value}</dd>
    </div>
  )
}
