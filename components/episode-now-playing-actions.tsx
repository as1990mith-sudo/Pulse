"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Bookmark, Send } from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import { LikeHeart } from "@/components/like-heart"
import { authClient } from "@/lib/auth-client"
import type { Show } from "@/lib/data"
import type { ShareTarget } from "@/lib/share-types"
import { isEpisodeLiked, setEpisodeLike } from "@/app/actions/episodes"
import { isItemSaved, toggleSaveItem } from "@/app/actions/share"
import { ShareSheet } from "@/components/share-sheet"
import { cn } from "@/lib/utils"

/**
 * One column of the action row: icon stacked over its count, filling an equal
 * quarter of the bar. Never rendered `disabled` — a signed-out tap explains
 * itself instead of presenting a dead control.
 */
function ActionButton({
  icon,
  label,
  count,
  onClick,
  pressed,
  active,
  activeClassName = "text-primary hover:text-primary",
}: {
  icon: React.ReactNode
  label: string
  count: number
  onClick: () => void
  pressed?: boolean
  active?: boolean
  /**
   * Colour once the action is on — red for like, primary for the rest. Must
   * spell out its own `hover:` variant so the active colour survives hover;
   * Tailwind only sees classes written literally, so this can't be composed
   * from a prefix at runtime.
   */
  activeClassName?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      className={cn(
        "group flex flex-1 flex-col items-center gap-1 rounded-xl py-2 transition-colors",
        "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
        active && activeClassName,
      )}
    >
      {/* The icon scales on press rather than the whole column, so the count
          underneath stays put and the row never jitters. */}
      <span className="transition-transform duration-150 group-active:scale-90">{icon}</span>
      {/* Zero-width space holds the line's height when there's no count yet, so
          icons stay vertically aligned across all four columns. */}
      <span className="text-[11px] font-medium leading-none tabular-nums">
        {count > 0 ? new Intl.NumberFormat("en", { notation: "compact" }).format(count) : "\u200B"}
      </span>
    </button>
  )
}

/**
 * Pinned social action bar for the immersive episode player: Like, Comment,
 * Save, Share. Like/save are wired to the same server actions the episode page
 * uses. Comment is a controlled toggle owned by the player so it can expand /
 * collapse the inline comment section in the scroll area below.
 */
export function EpisodeNowPlayingActions({
  show,
  commentCount,
  commentsExpanded,
  onToggleComments,
  saveCount = 0,
  shareCount = 0,
}: {
  show: Show
  commentCount: number
  commentsExpanded: boolean
  onToggleComments: () => void
  /** Total saves/shares across all users, shown inline next to each icon. */
  saveCount?: number
  shareCount?: number
}) {
  const { data: session } = authClient.useSession()
  const signedIn = Boolean(session?.user)
  const episodeId = show.episodeId

  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(show.likes ?? 0)
  const [saved, setSaved] = useState(false)
  const [saves, setSaves] = useState(saveCount)
  const [shares, setShares] = useState(shareCount)
  const [shareOpen, setShareOpen] = useState(false)
  const [, startTransition] = useTransition()

  // Keep the local save/share counters in sync when the parent reloads them
  // (e.g. after switching tracks).
  useEffect(() => {
    setSaves(saveCount)
  }, [saveCount])
  useEffect(() => {
    setShares(shareCount)
  }, [shareCount])

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

  // Load saved/liked state for the current track.
  useEffect(() => {
    if (!episodeId) {
      setSaved(false)
      setLiked(false)
      return
    }
    let active = true
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
    // Open to every signed-in account, admins included — the server only
    // requires a session, so nothing here should narrow it further.
    if (!signedIn) {
      toast("Sign in to like this episode.")
      return
    }
    if (!episodeId) return
    const next = !liked
    setLiked(next)
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)))
    startTransition(async () => {
      await setEpisodeLike({ episodeId, liked: next }).catch(() => {})
    })
  }

  function toggleSave() {
    if (!signedIn) {
      toast("Sign in to save this episode.")
      return
    }
    const next = !saved
    setSaved(next)
    setSaves((n) => Math.max(0, n + (next ? 1 : -1)))
    startTransition(async () => {
      try {
        const r = await toggleSaveItem(shareTarget)
        setSaved(r.saved)
      } catch {
        // revert on failure
        setSaved(!next)
        setSaves((n) => Math.max(0, n + (next ? -1 : 1)))
      }
    })
  }


  return (
    <>
      {/* One evenly-weighted row: each action claims an equal share of the width
          so the four sit on a strict rhythm rather than bunching at one edge.
          The count sits under its icon, which keeps every column the same width
          however the numbers grow — no reflow as likes tick up. */}
      <div className="flex items-stretch">
        <ActionButton
          onClick={toggleLike}
          pressed={liked}
          label={liked ? "Unlike episode" : "Like episode"}
          count={likes}
          active={liked}
          activeClassName="text-like hover:text-like"
          icon={<LikeHeart liked={liked} className="size-[22px]" />}
        />
        <ActionButton
          onClick={onToggleComments}
          pressed={commentsExpanded}
          label={commentsExpanded ? "Hide comments" : "Show comments"}
          count={commentCount}
          active={commentsExpanded}
          icon={<CommentIcon className="size-[22px]" />}
        />
        <ActionButton
          onClick={toggleSave}
          pressed={saved}
          label={saved ? "Remove from saved" : "Save episode"}
          count={saves}
          active={saved}
          icon={<Bookmark className={cn("size-[22px]", saved && "fill-current")} />}
        />
        <ActionButton
          onClick={() => setShareOpen(true)}
          label="Share episode"
          count={shares}
          icon={<Send className="size-[22px]" />}
        />
      </div>

      <ShareSheet
        target={shareTarget}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        onShared={() => setShares((n) => n + 1)}
      />
    </>
  )
}
