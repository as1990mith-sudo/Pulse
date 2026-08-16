"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Globe, Loader2, Lock, MoreVertical, Play, Trash2 } from "lucide-react"
import type { Show } from "@/lib/data"
import { deleteEpisode, setEpisodePrivacy } from "@/app/actions/shows"
import { isPlayable, useEpisodePlayer } from "@/components/episode-player-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

/**
 * A YouTube-style video card: a large 16:9 thumbnail with a duration badge and
 * hover play affordance, the title below, and a host/meta line. Clicking the
 * card opens the episode's watch page. Owners get a small menu (privacy/delete).
 *
 * Thumbnail strategy (per product decision): use the uploaded cover art when
 * present; otherwise fall back to the video's first frame so cards never look
 * empty (a muted <video> seeked to 0.1s via a media fragment).
 */
export function VideoCard({
  show,
  owned = false,
  queue,
  flush = false,
}: {
  show: Show
  owned?: boolean
  queue?: Show[]
  /**
   * Immersive edge-to-edge presentation: a perfectly rectangular thumbnail with
   * no rounded corners that runs flush to the left screen border (used by the
   * mobile catalogue list). Defaults to the padded, rounded card look.
   */
  flush?: boolean
}) {
  const router = useRouter()
  const { play } = useEpisodePlayer()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isPrivate, setIsPrivate] = useState(Boolean(show.isPrivate))

  // Livestream replays (source === "live") must open the dedicated portrait
  // LiveReplayWatch experience, which lives at the /live/[id] page. So they
  // always navigate (the href branch) rather than opening the shared immersive
  // overlay used for uploaded videos.
  const isLiveReplay = show.source === "live"
  // Uploaded on-demand videos open the immersive full-screen player overlay
  // (same as audio) instead of navigating to a page that still shows the app
  // header. Live replays are excluded so they route to their own player.
  const playable = isPlayable(show) && Boolean(queue && queue.length > 0) && !isLiveReplay
  const href = `/live/${show.id}`
  // A play trigger when playable, otherwise a link to the watch page.
  const openProps = playable
    ? ({ type: "button" as const, onClick: () => play(show, queue!) } as const)
    : ({ href } as const)
  const OpenTag: any = playable ? "button" : Link
  const hasCover = Boolean(show.cover && show.cover !== "/placeholder.svg")
  const frameSrc = show.videoUrl
    ? show.videoUrl.includes("#")
      ? show.videoUrl
      : `${show.videoUrl}#t=0.1`
    : undefined

  // "View count" for a recorded episode is its session audience tally. Compact
  // formatting keeps the meta line short (e.g. "1.2K views").
  const viewLabel = `${new Intl.NumberFormat("en", { notation: "compact" }).format(show.listeners)} ${
    show.listeners === 1 ? "view" : "views"
  }`
  // Meta line replaces the template's episode count: views + when published.
  const meta = [viewLabel, show.publishedAt].filter(Boolean).join(" · ")

  function handleTogglePrivacy() {
    setError(null)
    const next = !isPrivate
    setIsPrivate(next)
    startTransition(async () => {
      const res = await setEpisodePrivacy(show.id, next)
      if (res.ok) router.refresh()
      else {
        setIsPrivate(!next)
        setError(res.error)
      }
    })
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const res = await deleteEpisode(show.id)
      if (res.ok) {
        setConfirming(false)
        router.refresh()
      } else setError(res.error)
    })
  }

  return (
    // Immersive, borderless horizontal row (mirrors the host-library template):
    // cover-art thumbnail on the left, then title / @username / views · date.
    <div
      className={cn(
        "group relative flex items-start gap-3.5 rounded-xl px-1 py-1 transition-[background-color,transform] duration-200 hover:bg-card/50 active:scale-[0.99] active:bg-card/70",
        // Flush rows keep the thumbnail hugging the left border while the text
        // stays clear of the screen edge with right padding.
        flush ? "pr-4 sm:pr-1" : "",
      )}
    >
      <OpenTag
        {...openProps}
        aria-label={playable ? `Play ${show.title}` : `Watch ${show.title}`}
        className={cn(
          "relative block shrink-0 overflow-hidden rounded-lg bg-secondary ring-1 ring-white/5",
          // A single, consistent cinematic 16:9 thumbnail for every catalogue
          // item — live replays and uploads alike — cropped to fill
          // (object-cover below) so cards never distort and the list reads as a
          // deliberate, uniform media library rather than mixed proportions.
          "aspect-video w-36 sm:w-44",
        )}
      >
        {hasCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={show.cover || "/placeholder.svg"}
            alt={`${show.title} thumbnail`}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : frameSrc ? (
          <video
            src={frameSrc}
            muted
            playsInline
            preload="metadata"
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

        {/* Duration badge — small, translucent, sits quietly over the artwork */}
        {show.duration && (
          <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur-sm">
            {show.duration}
          </span>
        )}

        {owned && isPrivate && (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <Lock className="size-2.5" /> Private
          </span>
        )}
      </OpenTag>

      {/* Meta column: video title (in place of display name), the uploader's
          @username (maintained), then views · published date. */}
      <div className="flex min-w-0 flex-1 items-start gap-1 py-0.5">
        <OpenTag
          {...openProps}
          className={cn(
            "flex min-w-0 flex-1 flex-col overflow-hidden text-left",
            // Cap the text column to the 16:9 thumbnail's height (w-36→81px,
            // w-44→99px) so the row never grows taller than its artwork.
            "max-h-[81px] sm:max-h-[99px]",
          )}
        >
          {/* Three deliberate levels of hierarchy: the title is the loudest
              (wraps to two lines, YouTube-style), the @handle is secondary, and
              views · date is quiet tertiary metadata. */}
          <h3 className="line-clamp-2 font-display text-[15px] font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
            {show.title}
          </h3>
          <p className="mt-1 truncate text-xs font-medium text-muted-foreground">{show.host.handle}</p>
          {meta && <p className="mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground/70">{meta}</p>}
        </OpenTag>

        {owned && (
          <DropdownMenu
            onOpenChange={(open) => {
              if (!open) {
                setConfirming(false)
                setError(null)
              }
            }}
          >
            <DropdownMenuTrigger
              aria-label={`More options for ${show.title}`}
              className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary"
            >
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem closeOnClick={false} onClick={handleTogglePrivacy} disabled={isPending}>
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : isPrivate ? (
                  <Globe className="size-4" />
                ) : (
                  <Lock className="size-4" />
                )}
                {isPrivate ? "Make public" : "Make private"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
