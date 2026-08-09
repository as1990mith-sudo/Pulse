"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Clock, FileText, Headphones, Loader2, MoreVertical, Play, Plus, Search, Trash2, Video } from "lucide-react"
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

const KIND_META: Record<CatalogueKind, { label: string; icon: React.ReactNode }> = {
  audio: { label: "Audio", icon: <Headphones className="size-4" /> },
  video: { label: "Video", icon: <Video className="size-4" /> },
  document: { label: "Document", icon: <FileText className="size-4" /> },
}

// Icon components for the segmented toggle (need the component, not an element).
const KIND_ICON: Record<CatalogueKind, React.ComponentType<{ className?: string }>> = {
  audio: Headphones,
  video: Video,
  document: FileText,
}

const KIND_ORDER: CatalogueKind[] = ["audio", "video", "document"]

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

  // Default to the first kind that actually has items so the view isn't empty.
  const [tab, setTab] = useState<CatalogueKind>(() => KIND_ORDER.find((k) => counts[k] > 0) ?? "audio")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((it) => it.kind === tab && (!q || it.title.toLowerCase().includes(q)))
  }, [items, tab, query])

  const showsVideoGrid = tab === "video"
  const searchNoun = KIND_META[tab].label.toLowerCase()

  return (
    <div className="space-y-4">
      {/* Audio / Video / Document segmented toggle (mirrors EpisodeCatalog). */}
      <div
        role="tablist"
        aria-label="Filter resources by type"
        className="flex items-center gap-1 rounded-full border border-border/60 bg-card p-1"
      >
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
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {KIND_META[k].label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {counts[k]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Title search for the active view. */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${searchNoun} resources by title…`}
          aria-label="Search resources by title"
          className="w-full rounded-full border border-border/60 bg-card py-2 pl-9 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-muted-foreground">
          {query ? `No ${searchNoun} resources match “${query}”.` : `No ${searchNoun} resources yet.`}
        </p>
      ) : showsVideoGrid ? (
        // Video → YouTube-style grid of 16:9 thumbnail cards.
        <div className="-mx-4 grid grid-cols-1 gap-y-3 sm:mx-0 sm:grid-cols-2 sm:gap-x-2 lg:grid-cols-3">
          {filtered.map((it) => (
            <OrgCatalogueVideoCard key={it.id} item={it} orgId={orgId} isOwner={isOwner} />
          ))}
        </div>
      ) : (
        // Audio & Document → compact edge-to-edge divided list.
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

// VideoCard-style thumbnail card for video resources.
function OrgCatalogueVideoCard({
  item,
  orgId,
  isOwner,
}: {
  item: CatalogueItemView
  orgId: string
  isOwner: boolean
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const href = externalHref(item.url)

  function handleDelete() {
    startTransition(async () => {
      await deleteCatalogueItem({ id: item.id, organizationId: orgId })
      setConfirming(false)
      router.refresh()
    })
  }

  return (
    <div className="group relative flex items-start gap-2 rounded-none pr-4 transition-colors hover:bg-card/60 sm:rounded-xl sm:pr-0">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Watch ${item.title}`}
        className="relative block aspect-video w-32 shrink-0 overflow-hidden rounded-none bg-secondary sm:w-40 sm:rounded-xl"
      >
        {item.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.cover || "/placeholder.svg"}
            alt={`${item.title} thumbnail`}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Play className="size-7" />
          </div>
        )}

        {/* Hover play affordance */}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
          <span className="flex size-10 scale-90 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow-md backdrop-blur transition-all group-hover:scale-100 group-hover:opacity-100">
            <Play className="size-4 translate-x-px" />
          </span>
        </span>

        {item.duration && (
          <span className="absolute bottom-1 right-1 inline-flex items-center gap-1 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
            <Clock className="size-2.5" /> {item.duration}
          </span>
        )}
      </a>

      <div className="flex min-w-0 flex-1 items-start gap-1 py-0.5">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex max-h-[72px] min-w-0 flex-1 flex-col overflow-hidden text-left sm:max-h-[90px]"
        >
          <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug tracking-tight transition-colors group-hover:text-primary">
            {item.title}
          </h3>
          {item.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.description}</p>}
        </a>

        {isOwner && (
          <DropdownMenu
            onOpenChange={(open) => {
              if (!open) setConfirming(false)
            }}
          >
            <DropdownMenuTrigger
              aria-label={`More options for ${item.title}`}
              className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary"
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
