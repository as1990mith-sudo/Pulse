"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Clock, Download, Eye, Globe, Loader2, Lock, MoreVertical, Play, Trash2 } from "lucide-react"
import type { Show } from "@/lib/data"
import { deleteEpisode, setEpisodePrivacy } from "@/app/actions/shows"
import { Badge } from "@/components/ui/badge"
import { LiveBadge, ListenerCount } from "@/components/live-badge"
import { MarqueeTitle } from "@/components/marquee-title"
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
 * A single episode rendered as a compact, premium edge-to-edge row (rows are
 * separated by divider lines by the parent list). On-demand episodes play in
 * the persistent app player (with the rest of the catalogue as an up-next
 * queue); live/upcoming rows navigate to their pages. The currently-playing
 * row gets a subtle accent + "Now playing" treatment.
 */
export function EpisodeRow({ show, owned = false, queue }: { show: Show; owned?: boolean; queue?: Show[] }) {
  const router = useRouter()
  const { play, activeId } = useEpisodePlayer()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // Optimistic privacy state so the menu label flips instantly on toggle.
  const [isPrivate, setIsPrivate] = useState(Boolean(show.isPrivate))

  // Live video recordings are portrait replays that must open the dedicated
  // /live/[id] watch experience — never the in-app audio player. Audio (live or
  // uploaded) still plays inline. This mirrors VideoCard's isLiveReplay guard.
  const isVideoReplay = show.source === "live" && Boolean(show.videoUrl)
  // On-demand episodes launch the in-app player instead of navigating.
  const playable = isPlayable(show) && Boolean(queue && queue.length > 0) && !isVideoReplay
  const isActive = activeId === show.id

  function handleTogglePrivacy() {
    setError(null)
    const next = !isPrivate
    setIsPrivate(next)
    startTransition(async () => {
      const res = await setEpisodePrivacy(show.id, next)
      if (res.ok) {
        router.refresh()
      } else {
        setIsPrivate(!next)
        setError(res.error)
      }
    })
  }

  const href = show.status === "upcoming" ? "/#upcoming" : `/live/${show.id}`

  const ext = show.audioUrl?.split("?")[0].split(".").pop()?.slice(0, 5) || "mp3"
  const downloadName = `${show.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.${ext}`

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const res = await deleteEpisode(show.id)
      if (res.ok) {
        setConfirming(false)
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  // The cover + text block: a play trigger for on-demand episodes, otherwise a link.
  const openProps = playable
    ? { onClick: () => play(show, queue!) }
    : ({ href } as const)
  const OpenTag: any = playable ? "button" : Link

  const inner = (
    <>
      <div className="relative size-12 shrink-0 overflow-hidden rounded-lg sm:size-14">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={show.cover || "/placeholder.svg"}
          alt={`${show.title} cover art`}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {show.status === "live" && (
          <span className="absolute left-1 top-1">
            <LiveBadge />
          </span>
        )}
        {/* Now-playing equaliser overlay */}
        {isActive && (
          <span className="absolute inset-0 flex items-center justify-center gap-0.5 bg-black/55" aria-hidden="true">
            <span className="h-2.5 w-0.5 animate-pulse rounded-full bg-primary [animation-delay:-0.2s]" />
            <span className="h-3.5 w-0.5 animate-pulse rounded-full bg-primary" />
            <span className="h-2 w-0.5 animate-pulse rounded-full bg-primary [animation-delay:-0.4s]" />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Category is intentionally not shown here — it's an optional/auto
            defaulted field (e.g. "Episode") that only duplicated the tagline
            below. We keep just the privacy + live-listener meta. */}
        {((owned && isPrivate) || show.status === "live") && (
          <div className="flex items-center gap-1.5">
            {owned && isPrivate && (
              <Badge variant="outline" className="gap-1 border-border/50 px-1.5 py-0 text-[10px] text-muted-foreground">
                <Lock className="size-2.5" /> Private
              </Badge>
            )}
            {show.status === "live" && <ListenerCount count={show.listeners} />}
          </div>
        )}
        <MarqueeTitle
          text={show.title}
          className={cn(
            "font-display text-sm font-semibold leading-tight tracking-tight transition-colors",
            isActive ? "text-primary" : "group-hover:text-live",
          )}
        />
        {isActive ? (
          <p className="text-xs font-medium leading-tight text-primary/80">Now playing</p>
        ) : (
          // Hide the tagline when it's just the category fallback (tagline ||
          // category) so we don't reintroduce "Episode" / the category label.
          show.tagline &&
          show.tagline !== show.category && (
            <p className="line-clamp-1 text-xs leading-tight text-muted-foreground">{show.tagline}</p>
          )
        )}
        {/* Views + duration sit directly under the title (not beside it) for
            on-demand rows. Live rows show listener count in the meta above. */}
        {show.status !== "live" && (
          <div className="mt-0.5 flex items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3" />
              {new Intl.NumberFormat("en", { notation: "compact" }).format(show.listeners)}
            </span>
            {show.duration && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" /> {show.duration}
              </span>
            )}
          </div>
        )}
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
      {/* Active accent bar */}
      {isActive && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden="true" />}

      <OpenTag
        {...openProps}
        aria-label={playable ? `Play ${show.title}` : `Open ${show.title}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {inner}
      </OpenTag>

      <div className="flex shrink-0 items-center gap-1">
        {playable ? (
          <button
            type="button"
            onClick={() => play(show, queue!)}
            aria-label={`Play ${show.title}`}
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
          <Link
            href={href}
            aria-label={`Open ${show.title}`}
            className="flex size-9 items-center justify-center rounded-full bg-secondary text-foreground transition-colors group-hover:bg-live group-hover:text-white"
          >
            <Play className="size-4 translate-x-px" />
          </Link>
        )}

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
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary data-[state=open]:text-foreground"
          >
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {show.audioUrl ? (
              <DropdownMenuItem
                render={
                  <a href={show.audioUrl} download={downloadName}>
                    <Download className="size-4" /> Download
                  </a>
                }
              />
            ) : (
              <DropdownMenuItem disabled>
                <Download className="size-4" /> No audio
              </DropdownMenuItem>
            )}

            {owned && (
              <>
                <DropdownMenuSeparator />
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
                  <DropdownMenuItem
                    variant="destructive"
                    closeOnClick={false}
                    onClick={() => handleDelete()}
                    disabled={isPending}
                  >
                    {isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    Confirm delete
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem variant="destructive" closeOnClick={false} onClick={() => setConfirming(true)}>
                    <Trash2 className="size-4" /> Delete
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {error && (
        <span className="absolute bottom-1 right-3 rounded bg-destructive/90 px-2 py-0.5 text-[11px] font-medium text-destructive-foreground">
          {error}
        </span>
      )}
    </div>
  )
}
