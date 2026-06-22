"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Heart, MessageCircle, MoreHorizontal, Copy, Pencil, Trash2, Send, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ActionSheet, type SheetAction } from "@/components/action-sheet"
import { canEdit, canDelete } from "@/lib/interactions"
import { cn } from "@/lib/utils"

/**
 * Normalized comment used by every comment section (feed, episodes, devotional,
 * community). Each section maps its own view type into this shape.
 */
export type ThreadComment = {
  id: number
  parentId: number | null
  /** Author profile link target; null disables linking (e.g. devotional). */
  authorId: string | null
  isSelf: boolean
  name: string
  handle: string | null
  initials: string
  color: string
  image: string | null
  text: string
  likes: number
  edited: boolean
  postedAt: string
  createdAtMs: number
}

export type CommentThreadProps = {
  comments: ThreadComment[]
  canInteract: boolean
  onLike: (commentId: number, liked: boolean) => void
  onReply: (parentId: number, text: string) => Promise<void> | void
  onEdit: (commentId: number, text: string) => Promise<void> | void
  onDelete: (commentId: number) => Promise<void> | void
  /**
   * Whether the action menu offers a "Copy" option. Disabled for feed (post
   * tab) comments per product rules; enabled everywhere else.
   */
  showCopy?: boolean
  /**
   * When false, the author may always edit/delete their own comments regardless
   * of how long ago they were posted. When true (default), the 15-min edit /
   * 30-min delete windows apply. The post tab opts out so users keep full
   * control of their comments.
   */
  enforceTimeWindows?: boolean
}

/**
 * Renders a flat list of top-level comments, each with one level of nested
 * replies. Every comment supports like and reply, plus (for the author, within
 * the time windows) edit/delete — and optionally copy — via an action sheet.
 */
export function CommentThread({
  comments,
  canInteract,
  onLike,
  onReply,
  onEdit,
  onDelete,
  showCopy = true,
  enforceTimeWindows = true,
}: CommentThreadProps) {
  // Group replies under their parent. Unknown parents fall back to top level.
  const { roots, repliesByParent } = useMemo(() => {
    const ids = new Set(comments.map((c) => c.id))
    const roots: ThreadComment[] = []
    const repliesByParent = new Map<number, ThreadComment[]>()
    for (const c of comments) {
      if (c.parentId && ids.has(c.parentId)) {
        const list = repliesByParent.get(c.parentId) ?? []
        list.push(c)
        repliesByParent.set(c.parentId, list)
      } else {
        roots.push(c)
      }
    }
    return { roots, repliesByParent }
  }, [comments])

  if (comments.length === 0) return null

  return (
    <ul className="space-y-4">
      {roots.map((comment) => (
        <li key={comment.id}>
          <CommentItem
            comment={comment}
            canInteract={canInteract}
            onLike={onLike}
            onReply={onReply}
            onEdit={onEdit}
            onDelete={onDelete}
            showCopy={showCopy}
            enforceTimeWindows={enforceTimeWindows}
          />
          {(repliesByParent.get(comment.id) ?? []).length > 0 && (
            <ul className="mt-3 space-y-3 border-l border-border/50 pl-3.5">
              {(repliesByParent.get(comment.id) ?? []).map((reply) => (
                <li key={reply.id}>
                  <CommentItem
                    comment={reply}
                    canInteract={canInteract}
                    onLike={onLike}
                    onReply={onReply}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    showCopy={showCopy}
                    enforceTimeWindows={enforceTimeWindows}
                    isReply
                  />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}

function CommentItem({
  comment,
  canInteract,
  onLike,
  onReply,
  onEdit,
  onDelete,
  showCopy,
  enforceTimeWindows = true,
  isReply = false,
}: {
  comment: ThreadComment
  canInteract: boolean
  onLike: (commentId: number, liked: boolean) => void
  onReply: (parentId: number, text: string) => Promise<void> | void
  onEdit: (commentId: number, text: string) => Promise<void> | void
  onDelete: (commentId: number) => Promise<void> | void
  showCopy: boolean
  enforceTimeWindows?: boolean
  isReply?: boolean
}) {
  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(comment.likes)
  const [menuOpen, setMenuOpen] = useState(false)
  const [replying, setReplying] = useState(false)
  const [replyDraft, setReplyDraft] = useState("")
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState(comment.text)
  const [text, setText] = useState(comment.text)
  const [deleted, setDeleted] = useState(false)
  const [edited, setEdited] = useState(comment.edited)
  const [copied, setCopied] = useState(false)
  let pressTimer: ReturnType<typeof setTimeout> | null = null

  const editable = comment.isSelf && (!enforceTimeWindows || canEdit(comment.createdAtMs))
  const deletable = comment.isSelf && (!enforceTimeWindows || canDelete(comment.createdAtMs))

  function toggleLike() {
    if (!canInteract) return
    const next = !liked
    setLiked(next)
    setLikes((n) => (next ? n + 1 : n - 1))
    onLike(comment.id, next)
  }

  function copyText() {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  const actions: SheetAction[] = []
  if (showCopy) actions.push({ label: "Copy", icon: Copy, onClick: copyText })
  if (editable) actions.push({ label: "Edit", icon: Pencil, onClick: () => { setEditDraft(text); setEditing(true) } })
  if (deletable)
    actions.push({
      label: "Delete",
      icon: Trash2,
      destructive: true,
      onClick: async () => {
        await onDelete(comment.id)
        setDeleted(true)
      },
    })
  const hasMenu = actions.length > 0

  function startPress() {
    if (!hasMenu) return
    pressTimer = setTimeout(() => setMenuOpen(true), 450)
  }
  function cancelPress() {
    if (pressTimer) {
      clearTimeout(pressTimer)
      pressTimer = null
    }
  }

  async function submitReply(e: React.FormEvent) {
    e.preventDefault()
    const value = replyDraft.trim()
    if (!value) return
    // Replies attach to the top-level comment so the thread stays one level deep.
    await onReply(comment.parentId ?? comment.id, value)
    setReplyDraft("")
    setReplying(false)
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    const value = editDraft.trim()
    if (!value) return
    if (value !== text) {
      await onEdit(comment.id, value)
      setText(value)
      setEdited(true)
    }
    setEditing(false)
  }

  if (deleted) return null

  const NameTag = comment.authorId ? Link : "span"
  const nameProps = comment.authorId ? { href: `/u/${comment.authorId}` } : {}

  return (
    <div className="flex gap-2.5">
      <Avatar className={cn("shrink-0", isReply ? "size-7" : "size-8")}>
        {comment.image && <AvatarImage src={comment.image || "/placeholder.svg"} alt={comment.name} />}
        <AvatarFallback className={cn("text-xs", comment.color)}>{comment.initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div
          onPointerDown={startPress}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
          onContextMenu={(e) => {
            if (!hasMenu) return
            e.preventDefault()
            setMenuOpen(true)
          }}
          className="select-none"
        >
          <div className="flex flex-wrap items-center gap-x-2 text-sm">
            {/* @ts-expect-error polymorphic tag */}
            <NameTag {...nameProps} className={cn("font-medium", comment.authorId && "hover:underline")}>
              {comment.name}
            </NameTag>
            {comment.handle && <span className="text-xs text-muted-foreground">{comment.handle}</span>}
            <span className="text-xs text-muted-foreground">· {comment.postedAt}</span>
            {edited && <span className="text-xs text-muted-foreground">· edited</span>}
            {copied && <span className="text-xs text-primary">Copied</span>}
          </div>

          {!editing && <p className="whitespace-pre-wrap text-pretty text-sm leading-relaxed text-foreground/90">{text}</p>}
        </div>

        {editing && (
          <form onSubmit={submitEdit} className="mt-1 space-y-2">
            <Textarea
              autoFocus
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              className="min-h-10 resize-none text-sm"
              aria-label="Edit comment"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!editDraft.trim()}>
                Save
              </Button>
            </div>
          </form>
        )}

        {/* Action row */}
        <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={toggleLike}
            disabled={!canInteract}
            className={cn("flex items-center gap-1 transition-colors hover:text-primary", liked && "text-primary")}
            aria-pressed={liked}
            aria-label="Like comment"
          >
            <Heart className={cn("size-4", liked && "fill-current")} />
            {likes > 0 && <span className="tabular-nums">{likes}</span>}
          </button>
          {canInteract && !isReply && (
            <button
              type="button"
              onClick={() => setReplying((v) => !v)}
              className="flex items-center gap-1 transition-colors hover:text-foreground"
              aria-label="Reply to comment"
            >
              <MessageCircle className="size-4" /> Reply
            </button>
          )}
          {hasMenu && (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="ml-auto flex items-center transition-colors hover:text-foreground"
              aria-label="More options"
            >
              <MoreHorizontal className="size-4" />
            </button>
          )}
        </div>

        {replying && (
          <form onSubmit={submitReply} className="mt-2 flex items-start gap-2">
            <Textarea
              autoFocus
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              placeholder={`Reply to ${comment.name}…`}
              className="min-h-9 resize-none text-sm"
              aria-label="Write a reply"
            />
            <Button type="submit" size="icon" disabled={!replyDraft.trim()} aria-label="Send reply">
              <Send className="size-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" onClick={() => setReplying(false)} aria-label="Cancel reply">
              <X className="size-4" />
            </Button>
          </form>
        )}
      </div>

      {hasMenu && (
        <ActionSheet
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          title={comment.isSelf ? "Your comment" : comment.name}
          preview={text}
          actions={actions}
        />
      )}
    </div>
  )
}
