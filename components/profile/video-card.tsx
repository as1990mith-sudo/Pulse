"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Clock, Globe, Loader2, Lock, MoreVertical, Play, Trash2 } from "lucide-react"
import type { Show } from "@/lib/data"
import { deleteEpisode, setEpisodePrivacy } from "@/app/actions/shows"
import { MarqueeTitle } from "@/components/marquee-title"
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
export function VideoCard({ show, owned = false }: { show: Show; owned?: boolean }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isPrivate, setIsPrivate] = useState(Boolean(show.isPrivate))

  const href = `/live/${show.id}`
  const hasCover = Boolean(show.cover && show.cover !== "/placeholder.svg")
  const frameSrc = show.videoUrl
    ? show.videoUrl.includes("#")
      ? show.videoUrl
      : `${show.videoUrl}#t=0.1`
    : undefined

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
    <div className="group relative flex flex-col gap-2.5">
      <Link
        href={href}
        aria-label={`Watch ${show.title}`}
        className="relative block aspect-video w-full overflow-hidden rounded-xl bg-secondary ring-1 ring-border/50 transition-shadow group-hover:ring-primary/40 group-hover:shadow-lg"
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
            <Play className="size-8" />
          </div>
        )}

        {/* Hover play affordance */}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
          <span className="flex size-12 scale-90 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow-md backdrop-blur transition-all group-hover:scale-100 group-hover:opacity-100">
            <Play className="size-5 translate-x-px" />
          </span>
        </span>

        {/* Duration badge */}
        {show.duration && (
          <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
            <Clock className="size-3" /> {show.duration}
          </span>
        )}

        {owned && isPrivate && (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
            <Lock className="size-2.5" /> Private
          </span>
        )}
      </Link>

      {/* Meta row: title + menu. The uploader's name/avatar is intentionally
          omitted — the catalogue is always viewed on that owner's own profile. */}
      <div className="flex items-start gap-2.5">
        <Link href={href} className="min-w-0 flex-1">
          {/* Title stays on a single line; it auto-scrolls (marquee) when too long. */}
          <MarqueeTitle
            text={show.title}
            className="font-display text-sm font-semibold leading-snug tracking-tight transition-colors group-hover:text-primary"
          />
          {(show.category || show.publishedAt) && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {[show.category, show.publishedAt].filter(Boolean).join(" · ")}
            </p>
          )}
        </Link>

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
