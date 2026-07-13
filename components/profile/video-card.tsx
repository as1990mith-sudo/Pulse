"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Clock, Globe, Loader2, Lock, MoreVertical, Play, Trash2 } from "lucide-react"
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

  // On-demand videos open the immersive full-screen player overlay (same as
  // audio) instead of navigating to a page that still shows the app header.
  const playable = isPlayable(show) && Boolean(queue && queue.length > 0)
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
        "group relative flex items-start gap-2 transition-colors hover:bg-card/60",
        // Flush rows are full-bleed rectangles; keep the right text off the
        // screen edge with padding while the thumbnail hugs the left border.
        flush ? "rounded-none pr-4 sm:rounded-xl sm:pr-0" : "rounded-xl",
      )}
    >
      <OpenTag
        {...openProps}
        aria-label={playable ? `Play ${show.title}` : `Watch ${show.title}`}
        className={cn(
          "relative block aspect-video w-32 shrink-0 overflow-hidden bg-secondary sm:w-40",
          // Perfect rectangle (no rounding) when immersive; rounded card otherwise.
          flush ? "rounded-none sm:rounded-xl" : "rounded-xl",
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

        {/* Duration badge */}
        {show.duration && (
          <span className="absolute bottom-1 right-1 inline-flex items-center gap-1 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
            <Clock className="size-2.5" /> {show.duration}
          </span>
        )}

        {owned && isPrivate && (
          <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
            <Lock className="size-2.5" /> Private
          </span>
        )}
      </OpenTag>

      {/* Meta column: video title (in place of display name), the uploader's
          @username (maintained), then views · published date. */}
      <div className="flex min-w-0 flex-1 items-start gap-1 py-0.5">
        <OpenTag {...openProps} className="min-w-0 flex-1 text-left">
          {/* Title wraps to at most two lines (YouTube-style) and truncates with
              an ellipsis, so it always fits the column and never runs under the
              menu button — no matter how long the title is. */}
          <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug tracking-tight transition-colors group-hover:text-primary">
            {show.title}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{show.host.handle}</p>
          {meta && <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>}
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
