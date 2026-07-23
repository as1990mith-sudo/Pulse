"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bookmark, Heart, Radio, Share2 } from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import type { Show } from "@/lib/data"
import type { CurrentUser } from "@/lib/session"
import type { EpisodeCommentView } from "@/app/actions/episodes"
import {
  addEpisodeComment,
  deleteEpisodeComment,
  editEpisodeComment,
  getEpisodeComments,
  isEpisodeLiked,
  setEpisodeCommentLike,
  setEpisodeLike,
} from "@/app/actions/episodes"
import { isItemSaved, toggleSaveItem } from "@/app/actions/share"
import { getEpisodeEngagement, type EpisodeEngagement } from "@/app/actions/engagement"
import { getFollowingIds } from "@/app/actions/follow"
import type { ShareTarget } from "@/lib/share-types"
import { LiveReplayPlayer } from "@/components/live-replay-player"
import { type ThreadComment } from "@/components/comment-thread"
import { CommentSheet } from "@/components/comment-sheet"
import { ShareSheet } from "@/components/share-sheet"
import { VideoCard } from "@/components/profile/video-card"
import { ProfileFollowButton } from "@/components/profile/profile-follow-button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

function toThreadComment(c: EpisodeCommentView): ThreadComment {
  return {
    id: c.id,
    parentId: c.parentId,
    authorId: c.authorId,
    isSelf: c.isSelf,
    name: c.user,
    handle: c.handle,
    initials: c.initials,
    color: c.color,
    image: c.authorImage,
    text: c.text,
    likes: c.likes,
    liked: c.liked,
    edited: c.edited,
    postedAt: c.postedAt,
    createdAtMs: c.createdAtMs,
  }
}

/**
 * "Streamed …" label — reframes the episode's publish time as a past broadcast,
 * replacing any "LIVE NOW" indicator. Prefers the relative form ("Streamed 2w
 * ago"); the absolute date is shown alongside as "Originally streamed on …".
 */
function streamedLabel(show: Show): string {
  if (show.publishedAt) {
    const rel = show.publishedAt === "just now" ? "just now" : `${show.publishedAt}`
    return show.publishedAt === "just now" ? "Streamed just now" : `Streamed ${rel}`
  }
  if (show.publishedDate) return `Streamed on ${show.publishedDate}`
  return "Livestream replay"
}

/**
 * LiveReplayWatch — the watch page for archived *video livestream* replays.
 *
 * It mirrors the uploaded-video watch layout (pinned player + Like/Comment/
 * Save/Share bar, scrollable details beneath) so navigation feels identical, but
 * hosts the PORTRAIT `LiveReplayPlayer` and swaps the uploaded-video framing for
 * replay-specific info: a "Streamed …" label, total duration, replay-view count,
 * description and tags, plus three recommendation rails (more replays from this
 * creator, related livestreams, recommended uploads). No live-only affordances.
 */
export function LiveReplayWatch({
  show,
  currentUser,
  initialComments,
  creatorReplays,
  relatedReplays,
  recommendedUploads,
}: {
  show: Show
  currentUser: CurrentUser | null
  initialComments: EpisodeCommentView[]
  creatorReplays: Show[]
  relatedReplays: Show[]
  recommendedUploads: Show[]
}) {
  const episodeId = show.episodeId
  const router = useRouter()

  const [minimized, setMinimized] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)

  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(show.likes ?? 0)
  const [saved, setSaved] = useState(false)
  const [comments, setComments] = useState<EpisodeCommentView[]>(initialComments)
  const [shareOpen, setShareOpen] = useState(false)
  const [engagement, setEngagement] = useState<EpisodeEngagement | null>(null)
  const [saveCount, setSaveCount] = useState(0)
  const [shareCount, setShareCount] = useState(0)
  const [, startTransition] = useTransition()

  const hostIsSelf = currentUser?.id === show.host.id
  const [followKnown, setFollowKnown] = useState(false)
  const [hostFollowing, setHostFollowing] = useState(false)

  useEffect(() => {
    if (!currentUser || hostIsSelf) {
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
  }, [currentUser, hostIsSelf, show.host.id])

  useEffect(() => {
    if (!currentUser || !episodeId) {
      setSaved(false)
      setLiked(false)
      return
    }
    let active = true
    isItemSaved("episode", String(episodeId))
      .then((s) => active && setSaved(s))
      .catch(() => {})
    isEpisodeLiked(episodeId)
      .then((l) => active && setLiked(l))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [currentUser, episodeId])

  useEffect(() => {
    if (!episodeId) return
    let active = true
    getEpisodeEngagement(episodeId)
      .then((e) => {
        if (!active) return
        setEngagement(e)
        setSaveCount(e.saves)
        setShareCount(e.shares)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [episodeId])

  if (!episodeId) return null

  const shareTarget: ShareTarget = {
    type: "episode",
    key: String(episodeId),
    title: `${show.title} on Frequency`,
    subtitle: show.tagline,
    url: typeof window !== "undefined" ? window.location.pathname + window.location.search : "/catalog",
    image: show.cover,
    downloadUrl: show.videoUrl ?? null,
    downloadKind: show.videoUrl ? "video" : null,
  }

  function toggleLike() {
    if (!currentUser) return
    const next = !liked
    setLiked(next)
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)))
    startTransition(async () => {
      await setEpisodeLike({ episodeId: episodeId!, liked: next })
    })
  }

  function toggleSave() {
    if (!currentUser) return
    const next = !saved
    setSaved(next)
    setSaveCount((n) => Math.max(0, n + (next ? 1 : -1)))
    startTransition(async () => {
      try {
        const r = await toggleSaveItem(shareTarget)
        setSaved(r.saved)
      } catch {
        setSaved(!next)
        setSaveCount((n) => Math.max(0, n + (next ? -1 : 1)))
      }
    })
  }

  async function submitComment(text: string) {
    if (!currentUser) return
    await addEpisodeComment({ episodeId: episodeId!, text })
    setComments(await getEpisodeComments(episodeId!))
  }

  const count = comments.length
  const views = engagement?.views ?? show.listeners ?? 0
  const tags = show.category ? [show.category] : []

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-background">
      {/* ============================= SECTION 1 — pinned ===================== */}
      <div className="relative shrink-0">
        <LiveReplayPlayer
          show={show}
          minimized={minimized}
          onMinimize={() => setMinimized(true)}
          onRestore={() => setMinimized(false)}
          onClose={() => {
            if (window.history.length > 1) router.back()
            else router.push("/catalog")
          }}
        />

        {/* Action bar — hidden while the player is collapsed to a mini-player. */}
        {!minimized && (
          <div className="border-b border-border/60 px-2 py-1.5 sm:px-4">
            <div className="flex items-center gap-1">
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
              {currentUser && !hostIsSelf && followKnown && (
                <ProfileFollowButton
                  targetUserId={show.host.id}
                  targetName={show.host.name}
                  initialFollowing={hostFollowing}
                  className="h-8 rounded-full px-3 text-xs"
                />
              )}

              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={toggleLike}
                  disabled={!currentUser}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50",
                    liked ? "text-live" : "text-foreground",
                  )}
                  aria-pressed={liked}
                  aria-label="Like replay"
                >
                  <Heart className={cn("size-5", liked && "fill-current")} />
                  {likes > 0 && <span className="tabular-nums">{likes}</span>}
                </button>

                <button
                  onClick={() => setCommentsOpen(true)}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                  aria-label="View comments"
                >
                  <CommentIcon className="size-5" />
                  {count > 0 && <span className="tabular-nums">{count}</span>}
                </button>

                <button
                  onClick={toggleSave}
                  disabled={!currentUser}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50",
                    saved ? "text-primary" : "text-foreground",
                  )}
                  aria-pressed={saved}
                  aria-label={saved ? "Unsave replay" : "Save replay"}
                >
                  <Bookmark className={cn("size-5", saved && "fill-current")} />
                  <span className="tabular-nums">{saveCount > 0 ? saveCount : saved ? "Saved" : "Save"}</span>
                </button>

                <button
                  onClick={() => setShareOpen(true)}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                  aria-label="Share replay"
                >
                  <Share2 className="size-5" />
                  <span className="tabular-nums">{shareCount > 0 ? shareCount : "Share"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================= SECTION 2 — scrollable ==================== */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-6 px-4 py-4 pb-16 sm:px-6">
          {/* Replay information block. */}
          <section className="space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              <Radio className="size-3" /> Livestream replay
            </span>
            <h1 className="text-balance text-lg font-bold leading-tight">{show.title}</h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{streamedLabel(show)}</span>
              <span> · </span>
              <span className="tabular-nums">
                {new Intl.NumberFormat("en", { notation: "compact" }).format(views)} replay {views === 1 ? "view" : "views"}
              </span>
              {show.duration && (
                <>
                  <span> · </span>
                  <span className="tabular-nums">{show.duration}</span>
                </>
              )}
            </p>
            {show.publishedDate && (
              <p className="text-xs text-muted-foreground">Originally streamed on {show.publishedDate}</p>
            )}
          </section>

          {/* Creator card */}
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4">
            <Avatar className="size-11">
              {show.host.avatar && <AvatarImage src={show.host.avatar || "/placeholder.svg"} alt={show.host.name} />}
              <AvatarFallback>{show.host.name[0]}</AvatarFallback>
            </Avatar>
            <Link href={`/u/${show.host.id}`} className="min-w-0">
              <p className="truncate font-semibold leading-none hover:underline">{show.host.name}</p>
              <p className="truncate text-sm text-muted-foreground">{show.host.handle}</p>
            </Link>
          </div>

          {/* Description */}
          {show.description && (
            <div className="space-y-2 rounded-xl border border-border/60 bg-card p-5">
              <h2 className="text-sm font-semibold">About this stream</h2>
              <p className="whitespace-pre-wrap text-pretty leading-relaxed text-muted-foreground">{show.description}</p>
            </div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border/60 bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Recommendation rails. */}
          {creatorReplays.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">More replays from {show.host.name}</h2>
              <div className="flex flex-col gap-3">
                {creatorReplays.map((ep) => (
                  <VideoCard key={ep.id} show={ep} />
                ))}
              </div>
            </section>
          )}

          {relatedReplays.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Related livestreams</h2>
              <div className="flex flex-col gap-3">
                {relatedReplays.map((ep) => (
                  <VideoCard key={ep.id} show={ep} />
                ))}
              </div>
            </section>
          )}

          {recommendedUploads.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Recommended videos</h2>
              <div className="flex flex-col gap-3">
                {recommendedUploads.map((ep) => (
                  <VideoCard key={ep.id} show={ep} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <CommentSheet
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        comments={comments.map(toThreadComment)}
        currentUser={currentUser}
        onSubmit={submitComment}
        onLike={(commentId, liked) => void setEpisodeCommentLike({ commentId, liked })}
        onReply={async (parentId, value) => {
          await addEpisodeComment({ episodeId: episodeId!, text: value, parentId })
          setComments(await getEpisodeComments(episodeId!))
        }}
        onEdit={async (commentId, value) => {
          await editEpisodeComment({ commentId, text: value })
          setComments(await getEpisodeComments(episodeId!))
        }}
        onDelete={async (commentId) => {
          await deleteEpisodeComment(commentId)
          setComments(await getEpisodeComments(episodeId!))
        }}
      />

      <ShareSheet
        target={shareTarget}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        onShared={() => setShareCount((n) => n + 1)}
      />
    </div>
  )
}
