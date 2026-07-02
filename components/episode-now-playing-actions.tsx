"use client"

import { useEffect, useState, useTransition } from "react"
import { Bookmark, Heart, MessageCircle, Repeat, Share2 } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import type { Show } from "@/lib/data"
import type { ShareTarget } from "@/lib/share-types"
import { getEpisodeComments, isEpisodeLiked, setEpisodeLike } from "@/app/actions/episodes"
import { isItemSaved, toggleSaveItem } from "@/app/actions/share"
import { ShareSheet } from "@/components/share-sheet"
import { EpisodeCommentsSheet } from "@/components/episode-comments-sheet"
import { cn } from "@/lib/utils"

/**
 * Social action bar for the immersive episode player: like, comment, loop,
 * save, and share. Like/comment/save are wired to the same server actions the
 * episode page uses; loop toggles the player's media element repeat flag.
 */
export function EpisodeNowPlayingActions({
  show,
  loop,
  onToggleLoop,
}: {
  show: Show
  loop: boolean
  onToggleLoop: () => void
}) {
  const { data: session } = authClient.useSession()
  const signedIn = Boolean(session?.user)
  const episodeId = show.episodeId

  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(show.likes ?? 0)
  const [saved, setSaved] = useState(false)
  const [commentCount, setCommentCount] = useState(0)
  const [shareOpen, setShareOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [, startTransition] = useTransition()

  const shareTarget: ShareTarget = {
    type: "episode",
    key: String(episodeId ?? show.id),
    title: `${show.title} on Frequency`,
    subtitle: show.tagline,
    url: `/live/${show.id}`,
    image: show.cover,
    downloadUrl: show.videoUrl ?? show.audioUrl ?? null,
    downloadKind: show.videoUrl ? "video" : show.audioUrl ? "audio" : null,
  }

  // Reset the like count baseline when the track changes; the actual liked
  // state is loaded from the server below so it persists across refreshes.
  useEffect(() => {
    setLikes(show.likes ?? 0)
  }, [show.id, show.likes])

  // Load comment count + saved/liked state for the current track.
  useEffect(() => {
    if (!episodeId) {
      setCommentCount(0)
      setSaved(false)
      setLiked(false)
      return
    }
    let active = true
    getEpisodeComments(episodeId)
      .then((c) => active && setCommentCount(c.length))
      .catch(() => {})
    if (signedIn) {
      isItemSaved("episode", String(episodeId))
        .then((s) => active && setSaved(s))
        .catch(() => {})
      isEpisodeLiked(episodeId)
        .then((l) => active && setLiked(l))
        .catch(() => {})
    } else {
      setSaved(false)
      setLiked(false)
    }
    return () => {
      active = false
    }
  }, [episodeId, signedIn])

  function toggleLike() {
    if (!signedIn || !episodeId) return
    const next = !liked
    setLiked(next)
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)))
    startTransition(async () => {
      await setEpisodeLike({ episodeId, liked: next }).catch(() => {})
    })
  }

  function toggleSave() {
    if (!signedIn) return
    setSaved((s) => !s)
    startTransition(async () => {
      try {
        const r = await toggleSaveItem(shareTarget)
        setSaved(r.saved)
      } catch {
        // revert on failure
        setSaved((s) => !s)
      }
    })
  }

  const baseBtn =
    "flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"

  return (
    <>
      <div className="mt-5 flex items-center justify-between gap-1 border-t border-foreground/10 pt-4">
        <button
          type="button"
          onClick={toggleLike}
          disabled={!signedIn}
          aria-pressed={liked}
          aria-label="Like episode"
          className={cn(baseBtn, liked && "text-live hover:text-live")}
        >
          <Heart className={cn("size-6", liked && "fill-current")} />
          <span className="tabular-nums">{likes > 0 ? likes : "Like"}</span>
        </button>

        <button
          type="button"
          onClick={() => setCommentsOpen(true)}
          disabled={!episodeId}
          aria-label="View comments"
          className={cn(baseBtn)}
        >
          <MessageCircle className="size-6" />
          <span className="tabular-nums">{commentCount > 0 ? commentCount : "Comment"}</span>
        </button>

        <button
          type="button"
          onClick={onToggleLoop}
          aria-pressed={loop}
          aria-label="Repeat episode"
          className={cn(baseBtn, loop && "text-primary hover:text-primary")}
        >
          <Repeat className="size-6" />
          <span>Loop</span>
        </button>

        <button
          type="button"
          onClick={toggleSave}
          disabled={!signedIn}
          aria-pressed={saved}
          aria-label="Save episode"
          className={cn(baseBtn, saved && "text-primary hover:text-primary")}
        >
          <Bookmark className={cn("size-6", saved && "fill-current")} />
          <span>{saved ? "Saved" : "Save"}</span>
        </button>

        <button
          type="button"
          onClick={() => setShareOpen(true)}
          aria-label="Share episode"
          className={cn(baseBtn)}
        >
          <Share2 className="size-6" />
          <span>Share</span>
        </button>
      </div>

      <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />
      {episodeId ? (
        <EpisodeCommentsSheet
          episodeId={episodeId}
          open={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          onCountChange={setCommentCount}
        />
      ) : null}
    </>
  )
}
