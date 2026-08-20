"use client"

import { useState, useTransition } from "react"
import useSWR from "swr"
import { BookHeart, Plus, RefreshCw, Loader2, CheckCircle2, Pencil, Trash2, CalendarClock, FileEdit } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { CoverUpload, SQUARE_PORTRAIT_RATIOS } from "@/components/admin/cover-upload"
import { toast } from "sonner"
import {
  getHomeDevotionals,
  saveHomeDevotional,
  repostHomeDevotional,
  deleteHomeDevotional,
  type HomeDevotionalRow,
  type HomeDevotionalStatus,
} from "@/app/actions/home-content"

/**
 * Content Management for a Home. The single surface here is the Daily Devotional
 * (spec §11–§12): the admin controls exactly which devotional their members see,
 * scoped to this Home, across the full lifecycle — draft, scheduled, published —
 * with edit, delete and re-post.
 */
export function ContentManager({ handle, homeName }: { handle: string; homeName: string }) {
  const { data, mutate, isLoading } = useSWR([handle, "home-devotionals"], () => getHomeDevotionals(handle), {
    revalidateOnFocus: false,
  })
  const [showForm, setShowForm] = useState(false)
  // The row currently being edited, or null when composing a brand-new one.
  const [editing, setEditing] = useState<HomeDevotionalRow | null>(null)

  function openNew() {
    setEditing(null)
    setShowForm(true)
  }
  function openEdit(row: HomeDevotionalRow) {
    setEditing(row)
    setShowForm(true)
  }
  function close() {
    setShowForm(false)
    setEditing(null)
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="flex size-9 items-center justify-center rounded-xl text-white"
              style={{ backgroundColor: "var(--home-accent)" }}
            >
              <BookHeart className="size-5" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold leading-tight text-foreground">Daily Devotional</h2>
              <p className="text-xs text-muted-foreground">Only published to {homeName}</p>
            </div>
          </div>
          {!showForm && (
            <Button size="sm" onClick={openNew} style={{ backgroundColor: "var(--home-accent)" }} className="text-white">
              <Plus className="mr-1 size-4" />
              New
            </Button>
          )}
        </div>

        {showForm && (
          <DevotionalForm
            handle={handle}
            initial={editing}
            onDone={() => {
              close()
              mutate()
            }}
            onCancel={close}
          />
        )}

        <div className="mt-3 space-y-2">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading devotionals…</p>
          ) : (data?.length ?? 0) === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">No devotionals yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Publish a devotional and it will appear on your Home&apos;s landing page.
              </p>
            </div>
          ) : (
            data!.map((d) => (
              <DevotionalRow key={d.id} handle={handle} row={d} onEdit={() => openEdit(d)} onChange={mutate} />
            ))
          )}
        </div>
      </section>
    </div>
  )
}

const STATUS_STYLES: Record<string, string> = {
  published: "bg-emerald-500/15 text-emerald-400",
  scheduled: "bg-amber-500/15 text-amber-400",
  draft: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
}

function DevotionalRow({
  handle,
  row,
  onEdit,
  onChange,
}: {
  handle: string
  row: HomeDevotionalRow
  onEdit: () => void
  onChange: () => void
}) {
  const [pending, start] = useTransition()

  function run(fn: () => Promise<void>, successMsg: string) {
    start(async () => {
      try {
        await fn()
        toast.success(successMsg)
        onChange()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong")
      }
    })
  }

  const scheduledLabel =
    row.status === "scheduled" && row.scheduledFor
      ? new Date(row.scheduledFor).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : null

  return (
    <div className="rounded-2xl border border-border/70 bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{row.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.verseRef}
            {scheduledLabel ? ` · Goes live ${scheduledLabel}` : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
            STATUS_STYLES[row.status] ?? "bg-muted text-muted-foreground"
          }`}
        >
          {row.status}
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-1 border-t border-border/60 pt-2.5">
        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" disabled={pending} onClick={onEdit}>
          <Pencil className="mr-1 size-3.5" />
          Edit
        </Button>

        {row.status === "published" ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            disabled={pending}
            onClick={() => run(() => repostHomeDevotional(handle, row.id), "Re-posted to the top of your Home")}
          >
            {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <RefreshCw className="mr-1 size-3.5" />}
            Re-post
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            disabled={pending}
            onClick={() => run(() => repostHomeDevotional(handle, row.id), "Devotional published to your Home")}
          >
            {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 size-3.5" />}
            Publish now
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-8 px-2 text-xs text-destructive hover:text-destructive"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`Delete “${row.title}”? This can’t be undone.`)) return
            run(() => deleteHomeDevotional(handle, row.id), "Devotional deleted")
          }}
        >
          <Trash2 className="mr-1 size-3.5" />
          Delete
        </Button>
      </div>
    </div>
  )
}

/** Converts an ISO string into the `YYYY-MM-DDTHH:mm` value a datetime-local input wants (local time). */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function DevotionalForm({
  handle,
  initial,
  onDone,
  onCancel,
}: {
  handle: string
  initial: HomeDevotionalRow | null
  onDone: () => void
  onCancel: () => void
}) {
  const [pending, start] = useTransition()
  const [busyStatus, setBusyStatus] = useState<HomeDevotionalStatus | null>(null)
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    verseRef: initial?.verseRef ?? "",
    verse: initial?.verse ?? "",
    body: initial?.body ?? "",
    prayer: initial?.prayer ?? "",
  })
  const [cover, setCover] = useState<string | null>(initial?.cover ?? null)
  const [scheduledFor, setScheduledFor] = useState<string>(
    initial?.status === "scheduled" ? toLocalInputValue(initial.scheduledFor) : "",
  )

  function submit(status: HomeDevotionalStatus) {
    if (!form.title.trim() || !form.verseRef.trim() || !form.verse.trim() || !form.body.trim()) {
      toast.error("Title, reference, verse and body are all required.")
      return
    }
    if (status === "scheduled" && !scheduledFor) {
      toast.error("Pick a date and time to schedule this devotional.")
      return
    }
    setBusyStatus(status)
    start(async () => {
      try {
        await saveHomeDevotional({
          handle,
          id: initial?.id,
          ...form,
          cover,
          status,
          scheduledFor: status === "scheduled" ? new Date(scheduledFor).toISOString() : null,
        })
        toast.success(
          status === "draft"
            ? "Draft saved"
            : status === "scheduled"
              ? "Devotional scheduled"
              : "Devotional published to your Home",
        )
        onDone()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong")
      } finally {
        setBusyStatus(null)
      }
    })
  }

  const btnBusy = (s: HomeDevotionalStatus) => pending && busyStatus === s

  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="dev-title">Title</Label>
          <Input
            id="dev-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Walking in grace"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dev-ref">Reference</Label>
          <Input
            id="dev-ref"
            value={form.verseRef}
            onChange={(e) => setForm({ ...form, verseRef: e.target.value })}
            placeholder="Ephesians 2:8"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dev-verse">Verse</Label>
        <Textarea
          id="dev-verse"
          value={form.verse}
          onChange={(e) => setForm({ ...form, verse: e.target.value })}
          rows={2}
          placeholder="For it is by grace you have been saved…"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dev-body">Body</Label>
        <Textarea
          id="dev-body"
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          rows={4}
          placeholder="Write the reflection. Separate paragraphs with a blank line."
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dev-prayer">Prayer (optional)</Label>
        <Textarea
          id="dev-prayer"
          value={form.prayer}
          onChange={(e) => setForm({ ...form, prayer: e.target.value })}
          rows={2}
          placeholder="A short closing prayer."
        />
      </div>
      <div className="space-y-1.5">
        <Label>Cover art (optional)</Label>
        <CoverUpload value={cover} onChange={setCover} ratios={SQUARE_PORTRAIT_RATIOS} compact hideLabel />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dev-schedule">Schedule for (optional)</Label>
        <Input
          id="dev-schedule"
          type="datetime-local"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">
          Set a future date and time, then tap Schedule to have it go live automatically.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button variant="outline" size="sm" onClick={() => submit("draft")} disabled={pending}>
          {btnBusy("draft") ? <Loader2 className="mr-1 size-4 animate-spin" /> : <FileEdit className="mr-1 size-4" />}
          Save draft
        </Button>
        <Button variant="outline" size="sm" onClick={() => submit("scheduled")} disabled={pending || !scheduledFor}>
          {btnBusy("scheduled") ? (
            <Loader2 className="mr-1 size-4 animate-spin" />
          ) : (
            <CalendarClock className="mr-1 size-4" />
          )}
          Schedule
        </Button>
        <Button
          size="sm"
          onClick={() => submit("published")}
          disabled={pending}
          style={{ backgroundColor: "var(--home-accent)" }}
          className="text-white"
        >
          {btnBusy("published") ? (
            <Loader2 className="mr-1 size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-1 size-4" />
          )}
          Publish
        </Button>
      </div>
    </div>
  )
}
