"use client"

import { useState, useEffect, useTransition } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import {
  BookMarked,
  CalendarClock,
  FileText,
  Archive as ArchiveIcon,
  Plus,
  Radio,
  MessageSquare,
  Clock,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
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
import {
  DEVOTIONAL_STATUSES,
  DEVOTIONAL_STATUS_LABELS,
  type DevotionalRow,
  type DevotionalStatus,
} from "@/lib/admin/devotionals-types"
import {
  fetchDevotionals,
  publishDevotional,
  archiveDevotional,
  restoreDevotional,
  duplicateDevotional,
  deleteDevotional,
} from "@/app/actions/admin-devotionals"
import { DevotionalEditor } from "./devotional-editor"

type Analytics = {
  total: number
  published: number
  scheduled: number
  drafts: number
  archived: number
  totalComments: number
  avgReadingMinutes: number
  publishedLast30: number
}

type Tab = DevotionalStatus | "all"

const STATUS_TONE: Record<DevotionalStatus, "success" | "warning" | "info" | "neutral"> = {
  published: "success",
  scheduled: "warning",
  draft: "info",
  archived: "neutral",
}

export function DevotionalsManager({
  initialRows,
  total,
  counts,
  analytics,
  canManage,
}: {
  initialRows: DevotionalRow[]
  total: number
  counts: Record<Tab, number>
  analytics: Analytics
  canManage: boolean
}) {
  const [tab, setTab] = useState<Tab>("all")
  const [editing, setEditing] = useState<DevotionalRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [isPending, startTransition] = useTransition()

  const { data, mutate, isLoading } = useSWR(
    ["devotionals", tab],
    () => fetchDevotionals(tab, 0),
    {
      fallbackData: tab === "all" ? { rows: initialRows, total, counts } : undefined,
      revalidateOnFocus: false,
    },
  )

  const rows = data?.rows ?? []
  const tabCounts = data?.counts ?? counts

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
        title="Devotionals"
        description="Create, schedule and manage the daily devotional shown across Frequency."
        icon={BookMarked}
      >
        {canManage && (
          <Button onClick={() => setCreating(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New devotional
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={BookMarked} label="Published" value={analytics.published} accent="success" />
        <StatCard icon={CalendarClock} label="Scheduled" value={analytics.scheduled} accent="warning" />
        <StatCard icon={FileText} label="Drafts" value={analytics.drafts} accent="primary" />
        <StatCard icon={MessageSquare} label="Total comments" value={analytics.totalComments} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", ...DEVOTIONAL_STATUSES] as Tab[]).map((t) => (
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
            {t === "all" ? "All" : DEVOTIONAL_STATUS_LABELS[t]}
            <span className="ml-2 opacity-70">{tabCounts[t] ?? 0}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="No devotionals here"
          description={
            tab === "all"
              ? "Create your first devotional to get started."
              : `No ${DEVOTIONAL_STATUS_LABELS[tab as DevotionalStatus].toLowerCase()} devotionals.`
          }
        />
      ) : (
        <div className="space-y-3">
          {rows.map((d) => (
            <div
              key={d.id}
              className="flex items-start gap-4 rounded-2xl border border-border/70 bg-card/70 p-5 shadow-soft backdrop-blur-xl"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-semibold text-foreground">{d.title}</h3>
                  <StatusBadge tone={STATUS_TONE[d.status]}>{DEVOTIONAL_STATUS_LABELS[d.status]}</StatusBadge>
                  {d.isLive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400">
                      <Radio className="h-3 w-3" /> Live now
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{d.verseRef}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground/80">{d.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {d.readingMinutes} min read
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" /> {d.commentCount} comments
                  </span>
                  {d.status === "scheduled" && d.scheduledFor && (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {new Date(d.scheduledFor).toLocaleString()}
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
                    <DropdownMenuItem onClick={() => setEditing(d)}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    {d.status !== "published" && (
                      <DropdownMenuItem onClick={() => act(() => publishDevotional(d.id), "Published")}>
                        <Send className="mr-2 h-4 w-4" /> Publish now
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => act(() => duplicateDevotional(d.id), "Duplicated as draft")}>
                      <Copy className="mr-2 h-4 w-4" /> Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {d.status === "archived" ? (
                      <DropdownMenuItem onClick={() => act(() => restoreDevotional(d.id), "Restored to draft")}>
                        <RotateCcw className="mr-2 h-4 w-4" /> Restore
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => act(() => archiveDevotional(d.id), "Archived")}>
                        <ArchiveIcon className="mr-2 h-4 w-4" /> Archive
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        if (confirm(`Delete "${d.title}" permanently?`)) {
                          act(() => deleteDevotional(d.id), "Deleted")
                        }
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <DevotionalEditor
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
