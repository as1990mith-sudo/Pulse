"use client"

import { useRouter } from "next/navigation"
import { type ThreadComment } from "@/components/comment-thread"
import { CommentSheet, type CommentSheetUser } from "@/components/comment-sheet"
import {
  addArticleComment,
  deleteArticleComment,
  editArticleComment,
  setArticleCommentLike,
} from "@/app/actions/articles"
import type { ArticleCommentView } from "@/lib/article-types"

/**
 * Flattens the server's nested article comments into the flat ThreadComment
 * list the shared CommentThread expects (it re-nests by parentId). Deleted
 * comments are omitted, and their replies are reparented to the nearest
 * surviving ancestor so the conversation stays intact — matching how the feed
 * comment sheet renders its thread.
 */
function flattenComments(comments: ArticleCommentView[]): ThreadComment[] {
  const out: ThreadComment[] = []
  const walk = (c: ArticleCommentView, parentId: number | null) => {
    const alive = !c.deleted
    if (alive) {
      out.push({
        id: Number(c.id),
        parentId,
        authorId: c.author.id,
        isSelf: c.isMine,
        name: c.author.name,
        handle: c.author.handle,
        initials: c.author.initials,
        color: c.author.color,
        image: c.author.image,
        text: c.body,
        likes: c.likes,
        liked: c.liked,
        edited: Boolean(c.editedAt),
        postedAt: c.timeAgo,
        createdAtMs: new Date(c.createdAt).getTime(),
      })
    }
    const nextParent = alive ? Number(c.id) : parentId
    for (const r of c.replies) walk(r, nextParent)
  }
  for (const c of comments) walk(c, null)
  return out
}

/** Total number of non-deleted comments (top-level + replies). */
export function countComments(comments: ArticleCommentView[]): number {
  let n = 0
  const walk = (c: ArticleCommentView) => {
    if (!c.deleted) n += 1
    c.replies.forEach(walk)
  }
  comments.forEach(walk)
  return n
}

/**
 * Article comments, presented through the exact same experience as the feed:
 * the shared bottom-sheet CommentSheet + CommentThread. This component is
 * controlled by the reader (open/onClose) and mirrors the feed's handler
 * pattern — call the server action, then refresh the route so the RSC re-reads
 * the thread.
 */
export function ArticleComments({
  open,
  onClose,
  articleId,
  comments,
  currentUser,
}: {
  open: boolean
  onClose: () => void
  articleId: string
  comments: ArticleCommentView[]
  currentUser: CommentSheetUser
}) {
  const router = useRouter()

  async function onSubmit(text: string) {
    if (!currentUser) return
    await addArticleComment({ articleId, body: text })
    router.refresh()
  }

  function onLike(commentId: number, liked: boolean) {
    void setArticleCommentLike({ commentId: String(commentId), liked })
  }

  async function onReply(parentId: number, text: string) {
    await addArticleComment({ articleId, body: text, parentId: String(parentId) })
    router.refresh()
  }

  async function onEdit(commentId: number, text: string) {
    await editArticleComment({ commentId: String(commentId), body: text })
    router.refresh()
  }

  async function onDelete(commentId: number) {
    await deleteArticleComment(String(commentId))
    router.refresh()
  }

  return (
    <CommentSheet
      open={open}
      onClose={onClose}
      comments={flattenComments(comments)}
      currentUser={currentUser}
      showCopy={false}
      enforceTimeWindows={false}
      onSubmit={onSubmit}
      onLike={onLike}
      onReply={onReply}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  )
}
