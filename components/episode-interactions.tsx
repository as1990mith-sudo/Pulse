"use client"

import { useEffect, useState, useTransition } from "react"
import { Bookmark, Heart, Share2 } from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import { ShareSheet } from "@/components/share-sheet"
import { isItemSaved, toggleSaveItem } from "@/app/actions/share"
import type { ShareTarget } from "@/lib/share-types"
import type { Show } from "@/lib/data"
import type { CurrentUser } from "@/lib/session"
import type { EpisodeCommentView } from "@/app/actions/episodes"
import {
  addEpisodeComment,
  isEpisodeLiked,
  setEpisodeLike,
  setEpisodeCommentLike,
  editEpisodeComment,
  deleteEpisodeComment,
  getEpisodeComments,
} from "@/app/actions/episodes"
import { type ThreadComment } from "@/components/comment-thread"
import { CommentSheet } from "@/components/comment-sheet"
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

export function EpisodeInteractions({
  show,
  currentUser,
  initialComments,
}: {
  show: Show
  currentUser: CurrentUser | null
  initialComments: EpisodeCommentView[]
}) {
  const episodeId = show.episodeId
  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(show.likes ?? 0)
  const [saved, setSaved] = useState(false)
  const [comments, setComments] = useState<EpisodeCommentView[]>(initialComments)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [, startTransition] = useTransition()

  // Load whether this episode is already saved / liked by the current user, so
  // the state persists across refreshes and a like can't be re-counted.
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

  if (!episodeId) return null

  const shareTarget: ShareTarget = {
    type: "episode",
    key: String(episodeId),
    title: `${show.title} on Frequency`,
    subtitle: show.tagline,
    url: typeof window !== "undefined" ? window.location.pathname + window.location.search : "/catalog",
    image: show.cover,
    downloadUrl: show.audioUrl ?? null,
    downloadKind: show.audioUrl ? "audio" : null,
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
    setSaved((s) => !s)
    startTransition(async () => {
      try {
        const r = await toggleSaveItem(shareTarget)
        setSaved(r.saved)
      } catch {
        // Revert optimistic state on failure.
        setSaved((s) => !s)
      }
    })
  }

  async function submitComment(text: string) {
    if (!currentUser) return
    await addEpisodeComment({ episodeId: episodeId!, text })
    setComments(await getEpisodeComments(episodeId!))
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4">
      {/* Action bar */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleLike}
          disabled={!currentUser}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50",
            liked ? "text-live" : "text-foreground",
          )}
          aria-pressed={liked}
          aria-label="Like episode"
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
          {comments.length > 0 && <span className="tabular-nums">{comments.length}</span>}
        </button>

        <button
          onClick={toggleSave}
          disabled={!currentUser}
          className={cn(
            "ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50",
            saved ? "text-primary" : "text-foreground",
          )}
          aria-pressed={saved}
          aria-label={saved ? "Unsave episode" : "Save episode"}
        >
          <Bookmark className={cn("size-5", saved && "fill-current")} />
          {saved ? "Saved" : "Save"}
        </button>

        <button
          onClick={() => setShareOpen(true)}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          aria-label="Share episode"
        >
          <Share2 className="size-5" />
          Share
        </button>
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

      <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  )
}
