"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Download, Loader2, Trash2 } from "lucide-react"
import type { Show } from "@/lib/data"
import { deleteEpisode } from "@/app/actions/shows"
import { cn } from "@/lib/utils"

/**
 * Download + delete controls shown over a user's own episode rows. Rendered as
 * an overlay so the buttons sit above the underlying ShowRow link; clicks are
 * stopped from bubbling/navigating to the episode page.
 */
export function EpisodeOwnerControls({ show }: { show: Show }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function stop(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleDelete(e: React.MouseEvent) {
    stop(e)
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
    <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
      {error && (
        <span className="rounded-md bg-destructive/90 px-2 py-1 text-[11px] font-medium text-destructive-foreground">
          {error}
        </span>
      )}

      {show.audioUrl ? (
        <a
          href={show.audioUrl}
          download={`${show.title}.audio`}
          onClick={stop}
          className="flex size-8 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-background hover:text-foreground"
          aria-label={`Download ${show.title}`}
          title="Download episode audio"
        >
          <Download className="size-4" />
        </a>
      ) : (
        <span
          onClick={stop}
          className="flex size-8 cursor-not-allowed items-center justify-center rounded-full bg-background/60 text-muted-foreground/40 shadow-sm backdrop-blur"
          aria-label="No audio available to download"
          title="No recorded audio to download"
        >
          <Download className="size-4" />
        </span>
      )}

      {confirming ? (
        <div className="flex items-center gap-1" onClick={stop}>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="flex h-8 items-center gap-1 rounded-full bg-destructive px-3 text-xs font-semibold text-destructive-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            Delete
          </button>
          <button
            type="button"
            onClick={(e) => {
              stop(e)
              setConfirming(false)
            }}
            disabled={isPending}
            className="flex h-8 items-center rounded-full bg-background/90 px-3 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            stop(e)
            setConfirming(true)
          }}
          className={cn(
            "flex size-8 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-destructive hover:text-destructive-foreground",
          )}
          aria-label={`Delete ${show.title}`}
          title="Delete episode"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  )
}
