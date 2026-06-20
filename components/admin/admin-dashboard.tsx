"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BookOpen, Mic, Plus, Trash2, Loader2, CheckCircle2, RotateCcw } from "lucide-react"
import {
  createDevotional,
  createEpisode,
  deleteDevotional,
  deleteEpisode,
  repostDevotional,
} from "@/app/actions/admin"
import type { devotional as devotionalTable, episode as episodeTable } from "@/lib/db/schema"
import { CoverUpload } from "@/components/admin/cover-upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type DevotionalRow = typeof devotionalTable.$inferSelect
type EpisodeRow = typeof episodeTable.$inferSelect

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {children}
    </label>
  )
}

export function AdminDashboard({
  adminName,
  devotionals,
  episodes,
}: {
  adminName: string
  devotionals: DevotionalRow[]
  episodes: EpisodeRow[]
}) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Content dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Signed in as {adminName}. Publish a devotional or add a catalogue episode — no code required.
        </p>
      </div>

      <Tabs defaultValue="devotionals">
        <TabsList>
          <TabsTrigger value="devotionals" className="gap-1.5">
            <BookOpen className="size-4" /> Devotionals
          </TabsTrigger>
          <TabsTrigger value="episodes" className="gap-1.5">
            <Mic className="size-4" /> Episodes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="devotionals" className="mt-6">
          <DevotionalManager devotionals={devotionals} />
        </TabsContent>
        <TabsContent value="episodes" className="mt-6">
          <EpisodeManager episodes={episodes} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function DevotionalManager({ devotionals }: { devotionals: DevotionalRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [title, setTitle] = useState("")
  const [verseRef, setVerseRef] = useState("")
  const [verse, setVerse] = useState("")
  const [readingMinutes, setReadingMinutes] = useState(3)
  const [body, setBody] = useState("")
  const [prayer, setPrayer] = useState("")
  const [cover, setCover] = useState<string | null>(null)

  function reset() {
    setTitle("")
    setVerseRef("")
    setVerse("")
    setReadingMinutes(3)
    setBody("")
    setPrayer("")
    setCover(null)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const res = await createDevotional({
        title,
        verseRef,
        verse,
        readingMinutes,
        body,
        prayer,
        cover,
      })
      if (res.ok) {
        setSuccess(true)
        reset()
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  function onDelete(id: number) {
    startTransition(async () => {
      await deleteDevotional(id)
      router.refresh()
    })
  }

  function onRepost(id: number) {
    startTransition(async () => {
      await repostDevotional(id)
      router.refresh()
    })
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <Card className="space-y-5 p-6">
        <div className="flex items-center gap-2">
          <Plus className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">New weekly devotional</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          This becomes the devotional shown on the homepage as soon as you publish it. Past devotionals are kept in your
          library below so you can repost any of them later.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Be Still and Listen" />
          </Field>

          <Field label="Reading time (minutes)">
            <Input
              type="number"
              min={1}
              max={60}
              value={readingMinutes}
              onChange={(e) => setReadingMinutes(Number(e.target.value))}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Verse reference">
              <Input value={verseRef} onChange={(e) => setVerseRef(e.target.value)} placeholder="Psalm 46:10" />
            </Field>
            <Field label="Verse text">
              <Input
                value={verse}
                onChange={(e) => setVerse(e.target.value)}
                placeholder="Be still, and know that I am God."
              />
            </Field>
          </div>

          <Field label="Devotional message" hint="Write as many paragraphs as you like. Leave a blank line between paragraphs.">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"We live in a world tuned to noise...\n\nYet the invitation in this verse is not to do more..."}
              className="min-h-40"
            />
          </Field>

          <Field label="Prayer for today">
            <Textarea
              value={prayer}
              onChange={(e) => setPrayer(e.target.value)}
              placeholder="Quiet my restless heart today..."
              className="min-h-24"
            />
          </Field>

          <CoverUpload value={cover} onChange={setCover} label="Cover image (optional)" />

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && (
            <p className="flex items-center gap-1.5 text-sm text-primary">
              <CheckCircle2 className="size-4" /> Devotional published.
            </p>
          )}

          <Button type="submit" disabled={isPending} className="gap-2">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Publish devotional
          </Button>
        </form>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Library ({devotionals.length})
        </h2>
        {devotionals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing published yet. The sample devotional is showing for now.</p>
        ) : (
          <ul className="space-y-3">
            {devotionals.map((d, i) => (
              <li key={d.id}>
                <Card className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{d.title}</p>
                      <p className="truncate text-sm text-muted-foreground">{d.verseRef}</p>
                    </div>
                    {i === 0 && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Showing now
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-8 gap-1.5"
                      onClick={() => onRepost(d.id)}
                      disabled={isPending || i === 0}
                      aria-label={`Repost ${d.title}`}
                    >
                      <RotateCcw className="size-3.5" />
                      {i === 0 ? "Live now" : "Repost"}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(d.id)}
                      aria-label={`Delete ${d.title}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function EpisodeManager({ episodes }: { episodes: EpisodeRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [title, setTitle] = useState("")
  const [tagline, setTagline] = useState("")
  const [category, setCategory] = useState("")
  const [hostName, setHostName] = useState("")
  const [duration, setDuration] = useState("")
  const [description, setDescription] = useState("")
  const [cover, setCover] = useState<string | null>(null)

  function reset() {
    setTitle("")
    setTagline("")
    setCategory("")
    setHostName("")
    setDuration("")
    setDescription("")
    setCover(null)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const res = await createEpisode({ title, tagline, category, hostName, duration, description, cover })
      if (res.ok) {
        setSuccess(true)
        reset()
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  function onDelete(id: number) {
    startTransition(async () => {
      await deleteEpisode(id)
      router.refresh()
    })
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <Card className="space-y-5 p-6">
        <div className="flex items-center gap-2">
          <Plus className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Add episode</h2>
        </div>
        <p className="text-sm text-muted-foreground">New episodes appear at the top of your catalogue.</p>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Episode title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Culture Cast — Ep. 13" />
          </Field>

          <Field label="Tagline" hint="A short one-line summary">
            <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="The winter of remixes" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Culture" />
            </Field>
            <Field label="Host name">
              <Input value={hostName} onChange={(e) => setHostName(e.target.value)} placeholder="Host name" />
            </Field>
          </div>

          <Field label="Duration (optional)" hint="For example: 58m or 1h 04m">
            <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="58m" />
          </Field>

          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A look back at the tracks that defined the season..."
              className="min-h-28"
            />
          </Field>

          <CoverUpload value={cover} onChange={setCover} label="Cover image (optional)" />

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && (
            <p className="flex items-center gap-1.5 text-sm text-primary">
              <CheckCircle2 className="size-4" /> Episode added.
            </p>
          )}

          <Button type="submit" disabled={isPending} className="gap-2">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add episode
          </Button>
        </form>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Your episodes ({episodes.length})
        </h2>
        {episodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No uploaded episodes yet. Sample episodes are showing for now.</p>
        ) : (
          <ul className="space-y-3">
            {episodes.map((ep) => (
              <li key={ep.id}>
                <Card className="flex items-center gap-3 p-4">
                  {ep.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ep.cover || "/placeholder.svg"}
                      alt=""
                      className="size-12 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Mic className="size-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{ep.title}</p>
                    <p className="truncate text-sm text-muted-foreground">{ep.category}</p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(ep.id)}
                    aria-label={`Delete ${ep.title}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
