"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  BookOpen,
  Clock,
  FileText,
  Headphones,
  ImageIcon,
  Loader2,
  MoreVertical,
  Play,
  Plus,
  Radio,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { compressImage, uploadMedia } from "@/lib/upload-media"
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
import type { Host, Show } from "@/lib/data"
import { isPlayable, useEpisodePlayer } from "@/components/episode-player-provider"

// A resource is playable in the in-app audio player when its URL is a direct
// media file (our own blob/R2/S3 storage or a known audio/video extension) —
// not an external page like YouTube/Spotify, which an <audio> element can't play.
function isDirectMediaFile(url: string): boolean {
  return (
    /\.(mp3|wav|m4a|aac|ogg|opus|flac|mp4|webm|mov|m4v)(\?|#|$)/i.test(url) ||
    /\bblob\.vercel-storage\.com|\.r2\.dev|amazonaws\.com|\.cloudfront\.net/i.test(url)
  )
}

/**
 * Convert a Catalogue resource into a `Show` for the shared full-control audio
 * player (loop / speed / skip / queue). Returns null when the item isn't
 * in-app-audio-playable — live *video* replays (they open the dedicated /live
 * watch page), documents, and external audio links — so the caller falls back
 * to a link for those. Live audio replays and directly-hosted audio uploads
 * both resolve to a Show here, giving them the new player instead of the old
 * open-in-new-tab / video-style experience.
 */
function catalogueItemToShow(item: CatalogueItemView, host: Host): Show | null {
  const isLive = Boolean(item.slug)
  // Live video replays keep the dedicated /live watch page; only audio here.
  if (isLive && item.mediaKind === "video") return null
  const isAudio = isLive ? item.mediaKind === "audio" : item.kind === "audio"
  if (!isAudio) return null
  if (!item.url || !isDirectMediaFile(item.url)) return null

  const show: Show = {
    // Live replays are episodes (numeric id + slug); use the slug so the id is
    // stable and matches the /live route. Uploads are namespaced to avoid any
    // collision with episode ids in the shared player's queue lookup.
    id: isLive ? String(item.slug) : `org-cat-${item.id}`,
    title: item.title,
    tagline: item.description ?? "",
    cover: item.cover ?? host.avatar ?? "/placeholder.svg",
    category: "Episode",
    host,
    status: "ended",
    listeners: 0,
    duration: item.duration ?? undefined,
    description: item.description ?? "",
    audioUrl: item.url,
    mediaType: "audio",
    source: isLive ? "live" : "upload",
    // Only live replays are real `episode` rows, so only they get an episodeId
    // (which drives likes/comments/views). Uploads aren't episodes — leaving it
    // undefined keeps engagement calls from hitting the wrong table.
    ...(isLive ? { episodeId: item.id } : {}),
  }
  return isPlayable(show) ? show : null
}

// The stored `audio` kind is surfaced as "Uploads" (manually added resources)
// and `video` as "Live" (Radio icon), mirroring the individual-profile
// Catalogue whose top tabs are Uploads · Live rather than Audio · Video.
const KIND_META: Record<CatalogueKind, { label: string; icon: React.ReactNode }> = {
  audio: { label: "Uploads", icon: <Headphones className="size-4" /> },
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
  // Auto-published replays carry an explicit media kind — trust it over guessing.
  if (item.mediaKind) return item.mediaKind
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
  orgName,
  orgLogo,
  orgHandle,
  tab,
  onTabChange,
}: {
  items: CatalogueItemView[]
  isOwner: boolean
  orgId: string
  orgName: string
  orgLogo: string | null
  orgHandle: string
  // Active kind is owned by the parent (OrgTabs) so the header's upload dialog
  // can tailor itself to — and be hidden on — the current tab.
  tab: CatalogueKind
  onTabChange: (kind: CatalogueKind) => void
}) {
  const [query, setQuery] = useState("")
  // Video / Audio subtab within the Live tab (mirrors the profile Catalogue).
  const [liveKind, setLiveKind] = useState<LiveKind>("video")

  // The organisation stands in as the "host" of its catalogue audio, so the
  // shared player shows the org's name + logo on the now-playing screen.
  const host: Host = useMemo(
    () => ({ id: orgId, name: orgName, avatar: orgLogo ?? "", handle: orgHandle }),
    [orgId, orgName, orgLogo, orgHandle],
  )

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

  // Convert the visible resources into playable Shows (null for non-audio /
  // external / live-video rows). The queue is every playable audio Show in the
  // current view, so the player's up-next / auto-advance walks this tab's list.
  const shows = useMemo(() => {
    const map = new Map<number, Show | null>()
    for (const it of filtered) map.set(it.id, catalogueItemToShow(it, host))
    return map
  }, [filtered, host])
  const queue = useMemo(() => filtered.map((it) => shows.get(it.id)).filter((s): s is Show => Boolean(s)), [filtered, shows])

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
                onClick={() => onTabChange(k)}
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
            // Ids come from two tables (catalogue_item + episode), so namespace
            // the key by source to keep it unique across the merged list.
            <OrgCatalogueRow
              key={`${it.slug ? "live" : "cat"}-${it.id}`}
              item={it}
              orgId={orgId}
              isOwner={isOwner}
              show={shows.get(it.id) ?? null}
              queue={queue}
            />
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
function OrgCatalogueRow({
  item,
  orgId,
  isOwner,
  show,
  queue,
}: {
  item: CatalogueItemView
  orgId: string
  isOwner: boolean
  // Playable Show for audio resources (live replays + directly-hosted uploads);
  // null for documents, external links and live *video* replays. `queue` is the
  // set of playable audio Shows in the current view for the player's up-next.
  show: Show | null
  queue: Show[]
}) {
  const router = useRouter()
  const { play, activeId } = useEpisodePlayer()
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const meta = KIND_META[item.kind]
  // Audio resources play in the shared full-control player (loop / speed / skip
  // / queue). Non-playable rows fall back to a link: live *video* replays open
  // the dedicated /live watch page, everything else is an external resource.
  const playable = Boolean(show)
  const isActive = playable && activeId === show!.id
  const isLive = Boolean(item.slug)
  // Documents are read, not played — the trailing action shows a read icon and a
  // "Read" label instead of the play triangle used by media/live-video rows.
  const isDocument = item.kind === "document"
  const href = isLive ? `/live/${item.slug}` : externalHref(item.url)
  const linkProps = isLive ? {} : { target: "_blank", rel: "noopener noreferrer" }

  function handleDelete() {
    startTransition(async () => {
      await deleteCatalogueItem({ id: item.id, organizationId: orgId })
      setConfirming(false)
      router.refresh()
    })
  }

  // The row body + trailing button either play in-app (audio) or link out.
  const bodyInner = (
    <>
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
        {/* Now-playing equaliser overlay (matches EpisodeRow). */}
        {isActive && (
          <span className="absolute inset-0 flex items-center justify-center gap-0.5 bg-black/55" aria-hidden="true">
            <span className="h-2.5 w-0.5 animate-pulse rounded-full bg-primary [animation-delay:-0.2s]" />
            <span className="h-3.5 w-0.5 animate-pulse rounded-full bg-primary" />
            <span className="h-2 w-0.5 animate-pulse rounded-full bg-primary [animation-delay:-0.4s]" />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3
          className={cn(
            "truncate font-display text-sm font-semibold leading-tight tracking-tight transition-colors",
            isActive ? "text-primary" : "group-hover:text-live",
          )}
        >
          {item.title}
        </h3>
        {isActive ? (
          <p className="text-xs font-medium leading-tight text-primary/80">Now playing</p>
        ) : (
          item.description && (
            <p className="line-clamp-1 text-xs leading-tight text-muted-foreground">{item.description}</p>
          )
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
    </>
  )

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 px-4 py-3 transition-colors sm:px-6",
        isActive ? "bg-primary/5" : "hover:bg-secondary/40",
      )}
    >
      {isActive && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden="true" />}
      {playable ? (
        <button
          type="button"
          onClick={() => play(show!, queue)}
          aria-label={`Play ${item.title}`}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {bodyInner}
        </button>
      ) : (
        <a href={href} {...linkProps} aria-label={`Open ${item.title}`} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {bodyInner}
        </a>
      )}

      <div className="flex shrink-0 items-center gap-1">
        {playable ? (
          <button
            type="button"
            onClick={() => play(show!, queue)}
            aria-label={`Play ${item.title}`}
            className={cn(
              "flex size-9 items-center justify-center rounded-full transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-foreground group-hover:bg-live group-hover:text-white",
            )}
          >
            <Play className="size-4 translate-x-px" />
          </button>
        ) : (
          <a
            href={href}
            {...linkProps}
            aria-label={`${isDocument ? "Read" : "Open"} ${item.title}`}
            className="flex size-9 items-center justify-center rounded-full bg-secondary text-foreground transition-colors group-hover:bg-live group-hover:text-white"
          >
            {isDocument ? <BookOpen className="size-4" /> : <Play className="size-4 translate-x-px" />}
          </a>
        )}

        {isOwner && !isLive && (
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
// Copy + field configuration for each uploadable resource type. Live is never
// here: recordings are auto-published from finished live sessions, so they can't
// be added manually. The dialog is scoped to whichever Catalogue tab is active.
const UPLOAD_META = {
  audio: {
    title: "Add audio",
    description: "Publish a sermon, teaching or worship set to your catalogue.",
    titlePlaceholder: "Message title",
    fileLabel: "Audio file",
    fileHint: "MP3, WAV, M4A or AAC",
    // The file <input> accept filter for this resource kind.
    accept: "audio/*",
    submit: "Add audio",
    showMedia: true,
  },
  document: {
    title: "Add document",
    description: "Publish a document, PDF or study guide to your catalogue.",
    titlePlaceholder: "Document title",
    fileLabel: "Document file",
    fileHint: "PDF, EPUB or Word document",
    accept: ".pdf,.epub,.doc,.docx,application/pdf,application/epub+zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    submit: "Add document",
    showMedia: false,
  },
} satisfies Record<"audio" | "document", Record<string, unknown>>

export function NewCatalogueDialog({
  organizationId,
  activeKind,
}: {
  organizationId: string
  activeKind: CatalogueKind
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The resource kind follows the active Catalogue tab. Live is not uploadable,
  // so the parent hides this dialog on the Live tab; the fallback is defensive.
  const kind: "audio" | "document" = activeKind === "document" ? "document" : "audio"
  const meta = UPLOAD_META[kind]

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [duration, setDuration] = useState("")
  // The resource itself and (audio only) its cover art are now chosen from the
  // device rather than pasted as links — they upload to Blob storage on submit.
  const [file, setFile] = useState<File | null>(null)
  const [cover, setCover] = useState<File | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setTitle("")
    setDescription("")
    setDuration("")
    setFile(null)
    setCover(null)
    setProgress(null)
    setError(null)
  }

  async function submit() {
    setError(null)
    if (!title.trim()) {
      setError("Please give the resource a title.")
      return
    }
    if (!file) {
      setError(`Please choose ${kind === "document" ? "a document" : "an audio file"} to upload.`)
      return
    }

    setBusy(true)
    try {
      // Upload the cover art first (quick, small) so the main file's progress
      // bar reflects the bulk of the wait.
      let coverUrl: string | undefined
      if (meta.showMedia && cover) {
        const compressed = await compressImage(cover)
        const up = await uploadMedia(compressed, "catalogue", "cover.jpg")
        coverUrl = up.url
      }

      setProgress(0)
      const uploaded = await uploadMedia(file, "catalogue", file.name, (p) => setProgress(p))

      await createCatalogueItem({
        organizationId,
        title,
        description: description || undefined,
        kind,
        url: uploaded.url,
        cover: coverUrl,
        duration: duration || undefined,
      })
      setOpen(false)
      reset()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the resource.")
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={meta.submit}
            className="tap-scale flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-105"
          >
            <Plus className="size-5" />
          </button>
        }
      />
      <DialogContent className="max-h-[85svh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-muted-foreground">{KIND_META[kind].icon}</span>
            {meta.title}
          </DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto py-2">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={meta.titlePlaceholder} />
          </Field>

          {/* File picker replaces the old link field — upload from the device. */}
          <Field label={meta.fileLabel}>
            <input
              ref={fileInputRef}
              type="file"
              accept={meta.accept}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setFile(f)
                e.target.value = ""
              }}
            />
            <FilePickerButton
              icon={kind === "document" ? <FileText className="size-4" /> : <Headphones className="size-4" />}
              fileName={file?.name ?? null}
              hint={meta.fileHint}
              onPick={() => fileInputRef.current?.click()}
              onClear={file ? () => setFile(null) : undefined}
            />
          </Field>

          {/* Cover art + duration only make sense for audio; documents skip them. */}
          {meta.showMedia && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cover image (optional)">
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) setCover(f)
                    e.target.value = ""
                  }}
                />
                <FilePickerButton
                  icon={<ImageIcon className="size-4" />}
                  fileName={cover?.name ?? null}
                  hint="JPG or PNG"
                  onPick={() => coverInputRef.current?.click()}
                  onClear={cover ? () => setCover(null) : undefined}
                />
              </Field>
              <Field label="Duration (optional)">
                <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="42 min" />
              </Field>
            </div>
          )}
          <Field label="Description (optional)">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What is this about?"
            />
          </Field>
          {progress !== null && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button className="rounded-full" onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {progress !== null ? `Uploading ${progress}%` : "Adding..."}
              </>
            ) : (
              meta.submit
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * A tappable field that opens the device file picker and then shows the chosen
 * file's name with a clear button. Keeps the upload UI consistent between the
 * media file and the optional cover art.
 */
function FilePickerButton({
  icon,
  fileName,
  hint,
  onPick,
  onClear,
}: {
  icon: React.ReactNode
  fileName: string | null
  hint: string
  onPick: () => void
  onClear?: () => void
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 transition-colors",
        fileName ? "border-primary/40 bg-primary/5" : "border-border/70 hover:border-border",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
        {icon}
      </span>
      <button type="button" onClick={onPick} className="min-w-0 flex-1 text-left">
        {fileName ? (
          <span className="block truncate text-sm font-medium text-foreground">{fileName}</span>
        ) : (
          <span className="block text-sm font-medium text-foreground">Choose file</span>
        )}
        <span className="block truncate text-xs text-muted-foreground">{fileName ? "Tap to replace" : hint}</span>
      </button>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Remove file"
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
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
