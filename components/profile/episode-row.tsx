"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Clock, Download, Loader2, MoreVertical, Play, Trash2 } from "lucide-react"
import type { Show } from "@/lib/data"
import { deleteEpisode } from "@/app/actions/shows"
import { Badge } from "@/components/ui/badge"
import { LiveBadge, ListenerCount } from "@/components/live-badge"
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
 * A single episode rendered as an edge-to-edge row (no card, no gaps — rows are
 * separated by divider lines by the parent list). The title scrolls when long.
 * A three-dot menu offers Download to everyone and Delete to the owner.
 */
export function EpisodeRow({ show, owned = false }: { show: Show; owned?: boolean }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

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

  return (
    <div className="group relative flex items-center gap-3 px-3 py-3 transition-colors hover:bg-secondary/40 sm:px-4">
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-lg sm:size-16">
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
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-border/60 text-[10px] text-muted-foreground">
              {show.category}
            </Badge>
            {show.status === "live" && <ListenerCount count={show.listeners} />}
          </div>
          <MarqueeTitle
            text={show.title}
            className="font-display text-[15px] font-semibold leading-tight tracking-tight transition-colors group-hover:text-live"
          />
          <p className="line-clamp-1 text-sm leading-relaxed text-muted-foreground">{show.tagline}</p>
        </div>
      </Link>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {show.status !== "live" && show.duration && (
          <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
            <Clock className="size-3" /> {show.duration}
          </span>
        )}
        <div className="flex items-center gap-1">
          <Link
            href={href}
            aria-label={`Open ${show.title}`}
            className="flex size-9 items-center justify-center rounded-full bg-secondary text-foreground transition-colors group-hover:bg-live group-hover:text-white"
          >
            <Play className="size-4" />
          </Link>

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
                {confirming ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={(e) => {
                      e.preventDefault()
                      handleDelete()
                    }}
                    disabled={isPending}
                  >
                    {isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    Confirm delete
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={(e) => {
                      e.preventDefault()
                      setConfirming(true)
                    }}
                  >
                    <Trash2 className="size-4" /> Delete
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>

      {error && (
        <span className="absolute bottom-1 right-3 rounded bg-destructive/90 px-2 py-0.5 text-[11px] font-medium text-destructive-foreground">
          {error}
        </span>
      )}
    </div>
  )
}
