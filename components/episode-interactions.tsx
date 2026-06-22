"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Heart, MessageCircle, Share2, Send, Loader2 } from "lucide-react"
import { ShareSheet } from "@/components/share-sheet"
import type { ShareTarget } from "@/lib/share-types"
import type { Show } from "@/lib/data"
import type { CurrentUser } from "@/lib/session"
import type { EpisodeCommentView } from "@/app/actions/episodes"
import {
  addEpisodeComment,
  setEpisodeLike,
  setEpisodeCommentLike,
  editEpisodeComment,
  deleteEpisodeComment,
  getEpisodeComments,
} from "@/app/actions/episodes"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { CommentThread, type ThreadComment } from "@/components/comment-thread"
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
  const [comments, setComments] = useState<EpisodeCommentView[]>(initialComments)
  const [draft, setDraft] = useState("")
  const [shareOpen, setShareOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

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

  function submitComment(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !currentUser) return
    setDraft("")
    startTransition(async () => {
      await addEpisodeComment({ episodeId: episodeId!, text })
      setComments(await getEpisodeComments(episodeId!))
    })
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

        <span className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-foreground">
          <MessageCircle className="size-5" />
          {comments.length > 0 && <span className="tabular-nums">{comments.length}</span>}
        </span>

        <button
          onClick={() => setShareOpen(true)}
          className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          aria-label="Share episode"
        >
          <Share2 className="size-5" />
          Share
        </button>
      </div>

      {/* Composer */}
      {currentUser ? (
        <form onSubmit={submitComment} className="flex items-center gap-2">
          <Avatar className="size-8">
            <AvatarImage src={currentUser.image || undefined} alt="" />
            <AvatarFallback style={{ backgroundColor: currentUser.color }} className="text-xs text-white">
              {currentUser.initials}
            </AvatarFallback>
          </Avatar>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            className="h-9 flex-1 rounded-full border border-border/60 bg-background px-4 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!draft.trim() || isPending}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            aria-label="Post comment"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>{" "}
          to like and comment.
        </p>
      )}

      {/* Comments */}
      <div className="pt-1">
        <CommentThread
          comments={comments.map(toThreadComment)}
          canInteract={Boolean(currentUser)}
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
      </div>

      <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  )
}
