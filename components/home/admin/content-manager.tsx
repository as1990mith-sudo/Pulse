"use client"

import { useState, useTransition } from "react"
import useSWR from "swr"
import {
  BookHeart,
  Megaphone,
  Plus,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Pencil,
  Trash2,
  CalendarClock,
  FileEdit,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { CoverUpload, SQUARE_PORTRAIT_RATIOS } from "@/components/admin/cover-upload"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  getHomeDevotionals,
  saveHomeDevotional,
  repostHomeDevotional,
  deleteHomeDevotional,
  type HomeContentKind,
  type HomeDevotionalRow,
  type HomeDevotionalStatus,
} from "@/app/actions/home-content"

/**
 * Notice Board for a Home. A single publishing surface that is deliberately
 * multi-purpose: an admin posts either a general **Notice** (title + body,
 * optional cover) or a scripture-led **Devotional** (adds reference + verse and
 * an optional prayer). Both share the one lifecycle — draft, scheduled,
 * published — with edit, delete and re-post, and both publish only to this Home.
 *
 * The whole surface follows the admin-console design language: glass cards
 * (rounded-2xl, hairline border, backdrop blur), uppercase micro-label eyebrows
 * and the Home accent (`--home-accent`) for primary emphasis.
 */
export function ContentManager({ handle, homeName }: { handle: string; homeName: string }) {
  const { data, mutate, isLoading } = useSWR([handle, "home-notices"], () => getHomeDevotionals(handle), {
    revalidateOnFocus: false,
  })
  const [showForm, setShowForm] = useState(false)
  // The row currently being edited, or null when composing a brand-new one.
  const [editing, setEditing] = useState<HomeDevotionalRow | null>(null)
  // The kind to compose when creating a new item (ignored while editing).
  const [newKind, setNewKind] = useState<HomeContentKind>("notice")

  function openNew(kind: HomeContentKind) {
    setNewKind(kind)
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

  const items = data ?? []

  return (
    <div className="space-y-6">
      {/* Header: title + intent, plus the two create actions. */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card/50 p-5 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span
            className="flex size-11 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: "var(--home-accent)" }}
          >
            <Megaphone className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold leading-tight text-foreground">Notice Board</h2>
            <p className="text-xs text-muted-foreground">Posts publish only to {homeName}</p>
          </div>
        </div>
        {!showForm && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => openNew("notice")}
              style={{ backgroundColor: "var(--home-accent)" }}
              className="text-white"
            >
              <Plus className="mr-1 size-4" />
              New notice
            </Button>
            <Button size="sm" variant="outline" onClick={() => openNew("devotional")}>
              <BookHeart className="mr-1 size-4" />
              Devotional
            </Button>
          </div>
        )}
      </div>

      {showForm && (
        <ContentForm
          handle={handle}
          initial={editing}
          initialKind={editing?.kind ?? newKind}
          onDone={() => {
            close()
            mutate()
          }}
          onCancel={close}
        />
      )}

      {/* Feed of posted items. */}
      <div className="space-y-2.5">
        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 px-4 py-12 text-center backdrop-blur-xl">
            <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
              <Megaphone className="size-5" />
            </span>
            <p className="font-display text-[15px] font-semibold text-foreground">Nothing posted yet</p>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
              Post a notice or a devotional and it appears on your Home&apos;s landing page for members to read.
            </p>
          </div>
        ) : (
          items.map((d) => (
            <ContentRow key={d.id} handle={handle} row={d} onEdit={() => openEdit(d)} onChange={mutate} />
          ))
        )}
      </div>
    </div>
  )
}

const STATUS_STYLES: Record<string, string> = {
  published: "bg-emerald-500/15 text-emerald-400",
  scheduled: "bg-amber-500/15 text-amber-400",
  draft: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
}

function ContentRow({
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
  const isDevotional = row.kind === "devotional"

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

  // Secondary line: reference for a devotional, else a body preview.
  const subtitle = isDevotional ? row.verseRef : row.body.replace(/\s+/g, " ").trim()

  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 px-4 py-3.5 backdrop-blur-xl transition-colors hover:border-border">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl",
            isDevotional ? "bg-[var(--home-accent)]/15 text-[var(--home-accent)]" : "bg-muted/70 text-foreground",
          )}
        >
          {isDevotional ? <BookHeart className="size-4.5" /> : <Megaphone className="size-4.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">{row.title}</p>
            <span className="shrink-0 rounded-full bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {isDevotional ? "Devotional" : "Notice"}
            </span>
          </div>
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground">
              {subtitle}
              {scheduledLabel ? ` · Goes live ${scheduledLabel}` : ""}
            </p>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
            STATUS_STYLES[row.status] ?? "bg-muted text-muted-foreground",
          )}
        >
          {row.status}
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-1 border-t border-border/50 pt-2.5">
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
            onClick={() => run(() => repostHomeDevotional(handle, row.id), "Published to your Home")}
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
            run(() => deleteHomeDevotional(handle, row.id), "Deleted")
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

function ContentForm({
  handle,
  initial,
  initialKind,
  onDone,
  onCancel,
}: {
  handle: string
  initial: HomeDevotionalRow | null
  initialKind: HomeContentKind
  onDone: () => void
  onCancel: () => void
}) {
  const [pending, start] = useTransition()
  const [busyStatus, setBusyStatus] = useState<HomeDevotionalStatus | null>(null)
  const [kind, setKind] = useState<HomeContentKind>(initialKind)
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

  const isDevotional = kind === "devotional"

  function submit(status: HomeDevotionalStatus) {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error("Title and body are both required.")
      return
    }
    if (isDevotional && (!form.verseRef.trim() || !form.verse.trim())) {
      toast.error("A devotional needs a scripture reference and verse.")
      return
    }
    if (status === "scheduled" && !scheduledFor) {
      toast.error("Pick a date and time to schedule this.")
      return
    }
    setBusyStatus(status)
    start(async () => {
      try {
        await saveHomeDevotional({
          handle,
          id: initial?.id,
          kind,
          title: form.title,
          // Only send scripture fields for a devotional; a notice clears them.
          verseRef: isDevotional ? form.verseRef : "",
          verse: isDevotional ? form.verse : "",
          body: form.body,
          prayer: isDevotional ? form.prayer : "",
          cover,
          status,
          scheduledFor: status === "scheduled" ? new Date(scheduledFor).toISOString() : null,
        })
        toast.success(
          status === "draft"
            ? "Draft saved"
            : status === "scheduled"
              ? "Scheduled"
              : "Published to your Home",
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
    <div className="space-y-4 rounded-2xl border border-border/50 bg-card/50 p-5 backdrop-blur-xl">
      {/* Type toggle — the single decision that reshapes the form. Locked while
          editing an existing item so its kind never silently changes. */}
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Post type</Label>
        <div className="grid grid-cols-2 gap-2">
          <KindOption
            active={kind === "notice"}
            disabled={initial != null}
            onClick={() => setKind("notice")}
            icon={<Megaphone className="size-4" />}
            label="Notice"
            hint="Announcement or update"
          />
          <KindOption
            active={kind === "devotional"}
            disabled={initial != null}
            onClick={() => setKind("devotional")}
            icon={<BookHeart className="size-4" />}
            label="Devotional"
            hint="Scripture-led reading"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-title">Title</Label>
        <Input
          id="c-title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder={isDevotional ? "Walking in grace" : "This Sunday's service is online"}
        />
      </div>

      {/* Scripture fields only exist for a devotional. */}
      {isDevotional && (
        <div className="space-y-4 rounded-xl border border-[var(--home-accent)]/25 bg-[var(--home-accent)]/[0.05] p-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-ref">Reference</Label>
            <Input
              id="c-ref"
              value={form.verseRef}
              onChange={(e) => setForm({ ...form, verseRef: e.target.value })}
              placeholder="Ephesians 2:8"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-verse">Verse</Label>
            <Textarea
              id="c-verse"
              value={form.verse}
              onChange={(e) => setForm({ ...form, verse: e.target.value })}
              rows={2}
              placeholder="For it is by grace you have been saved…"
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="c-body">{isDevotional ? "Reflection" : "Message"}</Label>
        <Textarea
          id="c-body"
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          rows={isDevotional ? 5 : 4}
          placeholder={
            isDevotional
              ? "Write the reflection. Separate paragraphs with a blank line."
              : "Write the notice. Separate paragraphs with a blank line."
          }
        />
      </div>

      {/* Prayer is a devotional-only closing note. */}
      {isDevotional && (
        <div className="space-y-1.5">
          <Label htmlFor="c-prayer">Prayer (optional)</Label>
          <Textarea
            id="c-prayer"
            value={form.prayer}
            onChange={(e) => setForm({ ...form, prayer: e.target.value })}
            rows={2}
            placeholder="A short closing prayer."
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Cover image (optional)</Label>
        <CoverUpload value={cover} onChange={setCover} ratios={SQUARE_PORTRAIT_RATIOS} compact hideLabel />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-schedule">Schedule for (optional)</Label>
        <Input
          id="c-schedule"
          type="datetime-local"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">
          Set a future date and time, then tap Schedule to have it go live automatically.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/50 pt-4">
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

function KindOption({
  active,
  disabled,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
        active
          ? "border-[var(--home-accent)] bg-[var(--home-accent)]/10"
          : "border-border/60 bg-background/40 hover:border-border",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
          active ? "bg-[var(--home-accent)] text-white" : "bg-muted/70 text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-[11px] leading-tight text-muted-foreground">{hint}</span>
      </span>
    </button>
  )
}
