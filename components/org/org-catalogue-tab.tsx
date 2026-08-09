"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Clock, FileText, Headphones, Loader2, MoreVertical, Play, Plus, Radio, Search, Trash2 } from "lucide-react"
import {
  createCatalogueItem,
  deleteCatalogueItem,
  type CatalogueItemView,
  type CatalogueKind,
} from "@/app/actions/org-content"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// The stored `video` kind is surfaced as "Live" in the UI (Radio icon), mirroring
// the individual-profile Catalogue whose middle tab is Live rather than Video.
const KIND_META: Record<CatalogueKind, { label: string; icon: React.ReactNode }> = {
  audio: { label: "Audio", icon: <Headphones className="size-4" /> },
  video: { label: "Live", icon: <Radio className="size-4" /> },
  document: { label: "Documents", icon: <FileText className="size-4" /> },
}

// Icon components for the segmented toggle (need the component, not an element).
const KIND_ICON: Record<CatalogueKind, React.ComponentType<{ className?: string }>> = {
  audio: Headphones,
  video: Radio,
  document: FileText,
}

// Tab order: Audio · Live · Documents (Video is folded into Live).
const KIND_ORDER: CatalogueKind[] = ["audio", "video", "document"]

type LiveKind = "video" | "audio"

/**
 * Best-effort split of a Live resource into its media kind so the Live tab can
 * offer the same Video / Audio sub-toggle as the profile Catalogue. Org
 * catalogue rows don't store a media sub-kind, so we infer it from the link
 * (and fall back to "video" when a cover image is present).
 */
function liveMediaKind(item: CatalogueItemView): LiveKind {
  const u = item.url.toLowerCase()
  if (/youtube|youtu\.be|vimeo|\.mp4|\.webm|\.mov|\.m3u8/.test(u)) return "video"
  if (/\.mp3|\.wav|\.m4a|\.aac|soundcloud|spotify|anchor|podcast|audiomack/.test(u)) return "audio"
  return item.cover ? "video" : "audio"
}

/**
 * The organisation Catalogue — a mirror of the individual-profile Catalogue
 * (see EpisodeCatalog): an Audio / Video / Document segmented toggle, a search
 * box, EpisodeRow-style compact divided rows for audio & documents, and a
 * VideoCard-style grid for video. Owners can delete items from each row's menu;
 * publishing new items happens from the overlay header (NewCatalogueDialog).
 */
export function OrgEpisodeCatalog({
  items,
  isOwner,
  orgId,
}: {
  items: CatalogueItemView[]
  isOwner: boolean
  orgId: string
}) {
  const [query, setQuery] = useState("")
  // Video / Audio subtab within the Live tab (mirrors the profile Catalogue).
  const [liveKind, setLiveKind] = useState<LiveKind>("video")

  const counts = useMemo(() => {
    let audio = 0
    let video = 0
    let document = 0
    for (const it of items) {
      if (it.kind === "video") video++
      else if (it.kind === "document") document++
      else audio++
    }
    return { audio, video, document }
  }, [items])

  // Live recordings split by inferred media kind, for the Live subtab counters.
  const liveCounts = useMemo(() => {
    let video = 0
    let audio = 0
    for (const it of items) {
      if (it.kind !== "video") continue
      if (liveMediaKind(it) === "video") video++
      else audio++
    }
    return { video, audio }
  }, [items])

  // Default to the first kind that actually has items so the view isn't empty.
  const [tab, setTab] = useState<CatalogueKind>(() => KIND_ORDER.find((k) => counts[k] > 0) ?? "audio")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((it) => {
      if (it.kind !== tab) return false
      if (q && !it.title.toLowerCase().includes(q)) return false
      // In the Live tab, only show recordings matching the chosen subtab kind.
      if (tab === "video" && liveMediaKind(it) !== liveKind) return false
      return true
    })
  }, [items, tab, query, liveKind])

  const searchNoun = tab === "video" ? `live ${liveKind}` : KIND_META[tab].label.toLowerCase()

  return (
    <div className="space-y-4">
      {/* Audio / Live / Documents section nav — editorial underline style
          matching the Articles hub (thin orange active underline + counts). */}
      <div
        role="tablist"
        aria-label="Filter resources by type"
        className="-mx-4 border-b border-border/50 px-4 sm:-mx-6 sm:px-6"
      >
        <div className="flex items-center">
          {KIND_ORDER.map((k) => {
            const active = tab === k
            const Icon = KIND_ICON[k]
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(k)}
                className={cn(
                  "-mb-px flex flex-1 min-w-0 items-center justify-center gap-2 border-b-2 py-3 text-sm font-medium transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("size-4 shrink-0", active && "text-primary")} />
                <span className="truncate">{KIND_META[k].label}</span>
                <span className={cn("text-xs tabular-nums", active ? "text-primary" : "text-muted-foreground/60")}>
                  {counts[k]}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Live subtoggle: Video / Audio — quieter secondary underline row. */}
      {tab === "video" && (
        <div role="tablist" aria-label="Filter live recordings by media type" className="flex items-center">
          {(
            [
              { key: "video", label: "Video", icon: Radio, count: liveCounts.video },
              { key: "audio", label: "Audio", icon: Headphones, count: liveCounts.audio },
            ] as const
          ).map(({ key, label, icon: Icon, count }) => {
            const active = liveKind === key
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setLiveKind(key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 text-[13px] font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("size-3.5", active && "text-primary")} />
                {label}
                <span className={cn("text-xs tabular-nums", active ? "text-primary" : "text-muted-foreground/60")}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Title search for the active view. */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${searchNoun} resources by title…`}
          aria-label="Search resources by title"
          className="w-full rounded-xl border border-border/50 bg-card/40 py-2.5 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/60 focus:bg-card"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-muted-foreground">
          {query ? `No ${searchNoun} resources match “${query}”.` : `No ${searchNoun} resources yet.`}
        </p>
      ) : (
        // Every view uses the same compact edge-to-edge divided list, exactly
        // like the profile Catalogue's Live subtab (video & audio alike).
        <div className="-mx-4 divide-y divide-border/60 border-y border-border/60 sm:-mx-6">
          {filtered.map((it) => (
            <OrgCatalogueRow key={it.id} item={it} orgId={orgId} isOwner={isOwner} />
          ))}
        </div>
      )}
    </div>
  )
}

/** External href, guaranteeing a protocol so `target="_blank"` works. */
function externalHref(url: string) {
  return /^https?:\/\//.test(url) ? url : `https://${url}`
}

// EpisodeRow-style compact row for audio & document resources.
function OrgCatalogueRow({ item, orgId, isOwner }: { item: CatalogueItemView; orgId: string; isOwner: boolean }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const meta = KIND_META[item.kind]
  const href = externalHref(item.url)

  function handleDelete() {
    startTransition(async () => {
      await deleteCatalogueItem({ id: item.id, organizationId: orgId })
      setConfirming(false)
      router.refresh()
    })
  }

  return (
    <div className="group relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/40 sm:px-6">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${item.title}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-muted-foreground sm:size-14">
          {item.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.cover || "/placeholder.svg"}
              alt=""
              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            meta.icon
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="truncate font-display text-sm font-semibold leading-tight tracking-tight transition-colors group-hover:text-live">
            {item.title}
          </h3>
          {item.description && (
            <p className="line-clamp-1 text-xs leading-tight text-muted-foreground">{item.description}</p>
          )}
          <div className="mt-0.5 flex items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              {meta.icon} {meta.label}
            </span>
            {item.duration && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" /> {item.duration}
              </span>
            )}
          </div>
        </div>
      </a>

      <div className="flex shrink-0 items-center gap-1">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${item.title}`}
          className="flex size-9 items-center justify-center rounded-full bg-secondary text-foreground transition-colors group-hover:bg-live group-hover:text-white"
        >
          <Play className="size-4 translate-x-px" />
        </a>

        {isOwner && (
          <DropdownMenu
            onOpenChange={(open) => {
              if (!open) setConfirming(false)
            }}
          >
            <DropdownMenuTrigger
              aria-label={`More options for ${item.title}`}
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary data-[state=open]:text-foreground"
            >
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {confirming ? (
                <DropdownMenuItem variant="destructive" closeOnClick={false} onClick={handleDelete} disabled={isPending}>
                  {isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Confirm delete
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem variant="destructive" closeOnClick={false} onClick={() => setConfirming(true)}>
                  <Trash2 className="size-4" /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

/**
 * The "add resource" form. Its trigger is a compact circular + button intended
 * for the Catalogue overlay header (mirrors the profile Catalogue's upload +).
 */
export function NewCatalogueDialog({ organizationId }: { organizationId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [kind, setKind] = useState<CatalogueKind>("audio")
  const [url, setUrl] = useState("")
  const [cover, setCover] = useState("")
  const [duration, setDuration] = useState("")

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        await createCatalogueItem({
          organizationId,
          title,
          description: description || undefined,
          kind,
          url,
          cover: cover || undefined,
          duration: duration || undefined,
        })
        setOpen(false)
        setTitle("")
        setDescription("")
        setKind("audio")
        setUrl("")
        setCover("")
        setDuration("")
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't add the resource.")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label="Add resource"
            className="tap-scale flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-105"
          >
            <Plus className="size-5" />
          </button>
        }
      />
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add resource</DialogTitle>
          <DialogDescription>Publish a sermon, teaching, worship set or document to your catalogue.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <Field label="Type">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(KIND_META) as CatalogueKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border py-3 text-xs font-medium transition-colors",
                    kind === k
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground hover:bg-muted",
                  )}
                >
                  {KIND_META[k].icon}
                  {KIND_META[k].label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Message title" />
          </Field>
          <Field label="Link">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="youtube.com/… or a file URL" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cover image URL (optional)">
              <Input value={cover} onChange={(e) => setCover(e.target.value)} placeholder="https://…" />
            </Field>
            <Field label="Duration (optional)">
              <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="42 min" />
            </Field>
          </div>
          <Field label="Description (optional)">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What is this about?"
            />
          </Field>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button className="rounded-full" onClick={submit} disabled={pending}>
            {pending ? "Adding..." : "Add resource"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}
