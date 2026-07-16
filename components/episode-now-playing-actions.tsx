"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { Bookmark, Heart, MessageCircle, Share2 } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import type { Show } from "@/lib/data"
import type { ShareTarget } from "@/lib/share-types"
import { isEpisodeLiked, setEpisodeLike } from "@/app/actions/episodes"
import { isItemSaved, toggleSaveItem } from "@/app/actions/share"
import { getFollowingIds } from "@/app/actions/follow"
import { ShareSheet } from "@/components/share-sheet"
import { ProfileFollowButton } from "@/components/profile/profile-follow-button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

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

  // Inline follow for the host, shown on the left of the action bar. Only
  // relevant when signed in and viewing someone else's episode.
  const hostIsSelf = session?.user?.id === show.host.id
  const [followKnown, setFollowKnown] = useState(false)
  const [hostFollowing, setHostFollowing] = useState(false)

  useEffect(() => {
    if (!signedIn || hostIsSelf) {
      setFollowKnown(false)
      return
    }
    let active = true
    getFollowingIds()
      .then((ids) => {
        if (!active) return
        setHostFollowing(ids.includes(show.host.id))
        setFollowKnown(true)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [signedIn, hostIsSelf, show.host.id])

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

  const baseBtn =
    "flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"

  return (
    <>
      <div className="flex items-center gap-1">
        {/* Left: host avatar (opens the creator's profile) + inline Follow. */}
        <Link
          href={`/u/${show.host.id}`}
          className="tap-scale shrink-0"
          aria-label={`View ${show.host.name}'s profile`}
        >
          <Avatar className="size-9 ring-1 ring-border/60">
            {show.host.avatar && <AvatarImage src={show.host.avatar || "/placeholder.svg"} alt={show.host.name} />}
            <AvatarFallback className="text-xs">{show.host.name[0]}</AvatarFallback>
          </Avatar>
        </Link>
        {signedIn && !hostIsSelf && followKnown && (
          <ProfileFollowButton
            targetUserId={show.host.id}
            targetName={show.host.name}
            initialFollowing={hostFollowing}
            className="h-8 rounded-full px-3 text-xs"
          />
        )}

        {/* Right: engagement actions, pushed to the far edge. */}
        <div className="ml-auto flex items-center gap-1">
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
          onClick={onToggleComments}
          disabled={!episodeId}
          aria-pressed={commentsExpanded}
          aria-label={commentsExpanded ? "Hide comments" : "Show comments"}
          className={cn(baseBtn, commentsExpanded && "text-primary hover:text-primary")}
        >
          <MessageCircle className="size-6" />
          <span className="tabular-nums">{commentCount > 0 ? commentCount : "Comment"}</span>
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
          <span className="tabular-nums">{saves > 0 ? saves : saved ? "Saved" : "Save"}</span>
        </button>

        <button
          type="button"
          onClick={() => setShareOpen(true)}
          aria-label="Share episode"
          className={cn(baseBtn)}
        >
          <Share2 className="size-6" />
          <span className="tabular-nums">{shares > 0 ? shares : "Share"}</span>
        </button>
        </div>
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
