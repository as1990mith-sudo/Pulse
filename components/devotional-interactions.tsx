"use client"

import { useEffect, useState, useTransition } from "react"
import useSWR from "swr"
import { Share2 } from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import { LikeHeart } from "@/components/like-heart"
import {
  addDevotionalComment,
  getDevotionalComments,
  getDevotionalLikeState,
  setDevotionalLike,
  setDevotionalCommentLike,
  editDevotionalComment,
  deleteDevotionalComment,
  type DevotionalCommentView,
} from "@/app/actions/devotional"
import { ShareSheet } from "@/components/share-sheet"
import type { ShareTarget } from "@/lib/share-types"
import type { CurrentUser } from "@/lib/session"
import { Button } from "@/components/ui/button"
import { type ThreadComment } from "@/components/comment-thread"
import { CommentSheet } from "@/components/comment-sheet"
import { cn } from "@/lib/utils"

function toThreadComment(c: DevotionalCommentView): ThreadComment {
  return {
    id: c.id,
    parentId: c.parentId,
    authorId: c.authorId,
    isSelf: c.isSelf,
    name: c.user,
    handle: c.handle,
    initials: c.initials,
    color: c.color,
    image: null,
    text: c.text,
    likes: c.likes,
    liked: c.liked,
    edited: c.edited,
    postedAt: c.postedAt,
    createdAtMs: c.createdAtMs,
  }
}

export function DevotionalInteractions({
  title,
  devotionalDate,
  initialLikes,
  comments: initialComments,
  currentUser,
}: {
  title: string
  devotionalDate: string
  initialLikes: number
  comments: DevotionalCommentView[]
  currentUser: CurrentUser | null
}) {
  // Poll the comments so replies from others show up without a manual refresh.
  const { data: comments = initialComments, mutate: mutateComments } = useSWR(
    ["devotional-comments", devotionalDate],
    () => getDevotionalComments(devotionalDate),
    {
      fallbackData: initialComments,
      refreshInterval: 5000,
      revalidateOnFocus: true,
    },
  )
  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(initialLikes)
  const [shareOpen, setShareOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [, startTransition] = useTransition()

  // Load the persisted like count + this user's liked state so a daily like
  // survives refresh and can't be re-counted.
  useEffect(() => {
    let active = true
    getDevotionalLikeState(devotionalDate)
      .then((s) => {
        if (!active) return
        setLikes(s.likes)
        setLiked(s.liked)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [devotionalDate, currentUser])

  const shareTarget: ShareTarget = {
    type: "devotional",
    key: devotionalDate,
    title,
    subtitle: "Daily devotional on Frequency",
    url: typeof window !== "undefined" ? window.location.pathname + window.location.search : "/bible",
    image: null,
    downloadUrl: null,
    downloadKind: null,
  }

  function toggleLike() {
    if (!currentUser) return
    const next = !liked
    setLiked(next)
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)))
    startTransition(async () => {
      try {
        await setDevotionalLike({ devotionalDate, liked: next })
      } catch {
        // Revert optimistic state on failure.
        setLiked((prev) => !prev)
        setLikes((n) => Math.max(0, n + (next ? -1 : 1)))
      }
    })
  }

  async function submitComment(text: string) {
    if (!currentUser) return
    await addDevotionalComment({ devotionalDate, text })
    await mutateComments()
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Button
          variant={liked ? "default" : "secondary"}
          onClick={toggleLike}
          className={cn("gap-2", liked && "bg-like text-primary-foreground hover:bg-like/90")}
          aria-pressed={liked}
        >
          {/* On the filled button the surface itself turns red, so the heart
              stays white — red-on-red would erase it. */}
          <LikeHeart liked={liked} className="size-4" likedClassName="fill-current text-current" />
          {likes.toLocaleString()}
        </Button>

        <Button variant="secondary" onClick={() => setShareOpen(true)} className="gap-2">
          <Share2 className="size-4" />
          Share
        </Button>

        <Button
          variant="secondary"
          onClick={() => setCommentsOpen(true)}
          className="gap-2"
          aria-label="View comments"
        >
          <CommentIcon className="size-4" />
          {comments.length}
        </Button>
      </div>

      <CommentSheet
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        comments={comments.map(toThreadComment)}
        currentUser={currentUser}
        placeholder="Share a reflection, prayer, or encouragement…"
        emptyHint="Share a reflection to start the conversation."
        onSubmit={submitComment}
        onLike={(commentId, liked) => void setDevotionalCommentLike({ commentId, liked })}
        onReply={async (parentId, value) => {
          await addDevotionalComment({ devotionalDate, text: value, parentId })
          await mutateComments()
        }}
        onEdit={async (commentId, value) => {
          await editDevotionalComment({ commentId, text: value })
          await mutateComments()
        }}
        onDelete={async (commentId) => {
          await deleteDevotionalComment(commentId)
          await mutateComments()
        }}
      />

      <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  )
}
