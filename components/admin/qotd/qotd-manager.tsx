"use client"

import { useMemo, useState, useTransition } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import {
  MessageCircleQuestion,
  CalendarClock,
  FileText,
  Archive as ArchiveIcon,
  Plus,
  Radio,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Send,
  RotateCcw,
} from "lucide-react"
import { PageHeader, StatCard, StatusBadge, EmptyState, Spinner } from "@/components/admin/kit"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { QOTD_STATUSES, QOTD_STATUS_LABELS, type QotdQuestionRow, type QotdStatus } from "@/lib/qotd-types"
import {
  fetchQuestions,
  publishQuestion,
  archiveQuestion,
  restoreQuestion,
} from "@/app/actions/admin-qotd"
import { useUrlState } from "@/lib/navigation/use-url-state"
import { QotdEditor } from "./qotd-editor"

type Tab = QotdStatus | "all"
// Single source for both the filter chips and the URL validator, so a stale
// ?status= value degrades to "all" rather than rendering an empty list.
const TAB_KEYS = ["all", ...QOTD_STATUSES] as readonly Tab[]

const STATUS_TONE: Record<QotdStatus, "success" | "warning" | "info" | "neutral"> = {
  published: "success",
  scheduled: "warning",
  draft: "info",
  archived: "neutral",
}

export function QotdManager({
  initialRows,
  canManage,
  openNew = false,
}: {
  initialRows: QotdQuestionRow[]
  canManage: boolean
  openNew?: boolean
}) {
  // In the URL so the filter survives a reload and is shareable.
  const [tab, setTab] = useUrlState<Tab>("status", "all", { valid: TAB_KEYS })
  const [editing, setEditing] = useState<QotdQuestionRow | null>(null)
  const [creating, setCreating] = useState(openNew)
  const [isPending, startTransition] = useTransition()

  const { data = initialRows, mutate, isLoading } = useSWR("admin-qotd", () => fetchQuestions("all"), {
    fallbackData: initialRows,
    revalidateOnFocus: false,
  })

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: data.length, published: 0, scheduled: 0, draft: 0, archived: 0 }
    for (const q of data) c[q.status] += 1
    return c
  }, [data])

  const rows = tab === "all" ? data : data.filter((q) => q.status === tab)

  const analytics = useMemo(
    () => ({
      published: counts.published,
      scheduled: counts.scheduled,
      drafts: counts.draft,
      totalResponses: data.reduce((sum, q) => sum + q.responseCount, 0),
    }),
    [counts, data],
  )

  function act(fn: () => Promise<unknown>, msg: string) {
    startTransition(async () => {
      try {
        await fn()
        toast.success(msg)
        mutate()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Action failed")
      }
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Question of the Day"
        description="Publish and schedule the daily question that sparks community discussion."
        icon={MessageCircleQuestion}
      >
        {canManage && (
          <Button onClick={() => setCreating(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New question
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={MessageCircleQuestion} label="Published" value={analytics.published} accent="success" />
        <StatCard icon={CalendarClock} label="Scheduled" value={analytics.scheduled} accent="warning" />
        <StatCard icon={FileText} label="Drafts" value={analytics.drafts} accent="primary" />
        <StatCard icon={MessageSquare} label="Total responses" value={analytics.totalResponses} />
      </div>

      <div className="flex flex-wrap gap-2">
        {TAB_KEYS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "all" ? "All" : QOTD_STATUS_LABELS[t]}
            <span className="ml-2 opacity-70">{counts[t] ?? 0}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={MessageCircleQuestion}
          title="No questions here"
          description={
            tab === "all"
              ? "Create your first Question of the Day to get started."
              : `No ${QOTD_STATUS_LABELS[tab as QotdStatus].toLowerCase()} questions.`
          }
        />
      ) : (
        <div className="space-y-3">
          {rows.map((q) => (
            <div
              key={q.id}
              className="flex items-start gap-4 rounded-2xl border border-border/70 bg-card/70 p-5 shadow-soft backdrop-blur-xl"
            >
              {q.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={q.image || "/placeholder.svg"}
                  alt=""
                  className="hidden size-16 shrink-0 rounded-xl object-cover sm:block"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={STATUS_TONE[q.status]}>{QOTD_STATUS_LABELS[q.status]}</StatusBadge>
                  {q.isLive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400">
                      <Radio className="h-3 w-3" /> Live now
                    </span>
                  )}
                </div>
                <p className="mt-1.5 line-clamp-2 font-semibold text-foreground text-pretty">{q.questionText}</p>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" /> {q.activeDate}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" /> {q.responseCount} responses
                  </span>
                  {q.status === "scheduled" && q.scheduledFor && (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {new Date(q.scheduledFor).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={isPending}
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setEditing(q)}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    {q.status !== "published" && (
                      <DropdownMenuItem onClick={() => act(() => publishQuestion(q.id), "Published as today's question")}>
                        <Send className="mr-2 h-4 w-4" /> Publish now
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {q.status === "archived" ? (
                      <DropdownMenuItem onClick={() => act(() => restoreQuestion(q.id), "Restored to draft")}>
                        <RotateCcw className="mr-2 h-4 w-4" /> Restore to draft
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => act(() => archiveQuestion(q.id), "Archived (discussion preserved)")}>
                        <ArchiveIcon className="mr-2 h-4 w-4" /> Archive
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <QotdEditor
          open={creating || !!editing}
          existing={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            mutate()
          }}
        />
      )}
    </div>
  )
}
