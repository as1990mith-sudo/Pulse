"use client"

import { useEffect, useState } from "react"
import { type ThreadComment } from "@/components/comment-thread"
import { CommentSheet } from "@/components/comment-sheet"
import { authClient } from "@/lib/auth-client"
import { getAvatarColor, getInitials } from "@/lib/identity"
import {
  addEpisodeComment,
  deleteEpisodeComment,
  editEpisodeComment,
  getEpisodeComments,
  setEpisodeCommentLike,
  type EpisodeCommentView,
} from "@/app/actions/episodes"

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
 * Comment section for the immersive now-playing player. Renders the shared
 * Reels-style bottom sheet so comments look and behave identically everywhere.
 * Loads comments lazily when opened and reports the live count back so the
 * pinned action bar badge stays in sync.
 */
export function EpisodeCommentsInline({
  episodeId,
  open,
  onClose,
  onCountChange,
}: {
  episodeId: number
  open: boolean
  onClose: () => void
  onCountChange?: (count: number) => void
}) {
  const { data: session } = authClient.useSession()
  const user = session?.user ?? null

  const [comments, setComments] = useState<EpisodeCommentView[]>([])

  useEffect(() => {
    let active = true
    getEpisodeComments(episodeId)
      .then((c) => {
        if (!active) return
        setComments(c)
        onCountChange?.(c.length)
      })
      .catch(() => {})
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId])

  async function refresh() {
    const c = await getEpisodeComments(episodeId)
    setComments(c)
    onCountChange?.(c.length)
  }

  const currentUser = user
    ? { name: user.name, initials: getInitials(user.name), color: getAvatarColor(user.id), image: user.image ?? null }
    : null

  return (
    <CommentSheet
      open={open}
      onClose={onClose}
      comments={comments.map(toThreadComment)}
      currentUser={currentUser}
      onSubmit={async (text) => {
        await addEpisodeComment({ episodeId, text })
        await refresh()
      }}
      onLike={(commentId, liked) => void setEpisodeCommentLike({ commentId, liked })}
      onReply={async (parentId, value) => {
        await addEpisodeComment({ episodeId, text: value, parentId })
        await refresh()
      }}
      onEdit={async (commentId, value) => {
        await editEpisodeComment({ commentId, text: value })
        await refresh()
      }}
      onDelete={async (commentId) => {
        await deleteEpisodeComment(commentId)
        await refresh()
      }}
    />
  )
}
