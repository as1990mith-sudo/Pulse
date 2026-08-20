"use client"

import { useState, useTransition } from "react"
import useSWR from "swr"
import { BookHeart, Plus, RefreshCw, Loader2, CheckCircle2, FileText, ImageIcon, Video, Megaphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { CoverUpload, SQUARE_PORTRAIT_RATIOS } from "@/components/admin/cover-upload"
import { toast } from "sonner"
import {
  getHomeDevotionals,
  publishHomeDevotional,
  repostHomeDevotional,
  type HomeDevotionalRow,
} from "@/app/actions/home-content"

/**
 * Content Management for a Home. The headline surface is the Daily Devotional
 * (spec §11–§12): the admin controls exactly which devotional their members
 * see, scoped to this Home. Other content types are surfaced as their existing
 * management entry points so the dashboard is the single control centre.
 */
export function ContentManager({ handle, homeName }: { handle: string; homeName: string }) {
  const { data, mutate, isLoading } = useSWR([handle, "home-devotionals"], () => getHomeDevotionals(handle), {
    revalidateOnFocus: false,
  })
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="space-y-8">
      {/* Daily Devotional */}
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
          <Button
            size="sm"
            onClick={() => setShowForm((v) => !v)}
            style={{ backgroundColor: "var(--home-accent)" }}
            className="text-white"
          >
            <Plus className="mr-1 size-4" />
            New
          </Button>
        </div>

        {showForm && (
          <DevotionalForm
            handle={handle}
            onDone={() => {
              setShowForm(false)
              mutate()
            }}
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
            data!.map((d) => <DevotionalRow key={d.id} handle={handle} row={d} onChange={mutate} />)
          )}
        </div>
      </section>

      {/* Other content entry points — reuse the existing Frequency composers so
          the dashboard stays the single control centre without rebuilding them. */}
      <section>
        <h2 className="mb-3 text-[15px] font-semibold text-foreground">More content</h2>
        <div className="grid grid-cols-2 gap-2.5">
          <ContentLink icon={Megaphone} label="Announcements" href={`/org/${handle}`} />
          <ContentLink icon={FileText} label="Articles" href="/articles" />
          <ContentLink icon={ImageIcon} label="Photos" href="/feed" />
          <ContentLink icon={Video} label="Videos & Replays" href="/watch" />
        </div>
      </section>
    </div>
  )
}

function ContentLink({ icon: Icon, label, href }: { icon: typeof FileText; label: string; href: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-2.5 rounded-2xl border border-border/70 bg-card px-3.5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
    >
      <Icon className="size-4 text-muted-foreground" />
      {label}
    </a>
  )
}

function DevotionalRow({
  handle,
  row,
  onChange,
}: {
  handle: string
  row: HomeDevotionalRow
  onChange: () => void
}) {
  const [pending, start] = useTransition()
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{row.title}</p>
        <p className="truncate text-xs text-muted-foreground">{row.verseRef}</p>
      </div>
      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
        {row.status}
      </span>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              await repostHomeDevotional(handle, row.id)
              toast.success("Devotional re-posted to the top of your Home")
              onChange()
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Something went wrong")
            }
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      </Button>
    </div>
  )
}

function DevotionalForm({ handle, onDone }: { handle: string; onDone: () => void }) {
  const [pending, start] = useTransition()
  const [form, setForm] = useState({ title: "", verseRef: "", verse: "", body: "", prayer: "" })
  const [cover, setCover] = useState<string | null>(null)

  function submit() {
    if (!form.title.trim() || !form.verseRef.trim() || !form.verse.trim() || !form.body.trim()) {
      toast.error("Title, reference, verse and body are all required.")
      return
    }
    start(async () => {
      try {
        await publishHomeDevotional({ handle, ...form, cover })
        toast.success("Devotional published to your Home")
        onDone()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong")
      }
    })
  }

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
        <CoverUpload
          value={cover}
          onChange={setCover}
          ratios={SQUARE_PORTRAIT_RATIOS}
          compact
          hideLabel
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={submit}
          disabled={pending}
          style={{ backgroundColor: "var(--home-accent)" }}
          className="text-white"
        >
          {pending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <CheckCircle2 className="mr-1 size-4" />}
          Publish
        </Button>
      </div>
    </div>
  )
}
