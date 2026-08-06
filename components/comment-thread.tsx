"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Heart, MoreHorizontal, Copy, Pencil, Trash2, Send, X } from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { type SheetAction } from "@/components/action-sheet"
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
  liked: boolean
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
  /**
   * Fine-grained override for the DELETE window only. When omitted it inherits
   * `enforceTimeWindows`. Community Help sets this to false so authors can
   * always remove their own replies while editing still respects its window.
   */
  enforceDeleteWindow?: boolean
  /**
   * When provided, tapping a comment author's name/avatar calls this instead of
   * navigating to their profile page. Used by Community Help to pop a profile
   * card (Follow · Message · View profile) without leaving the feed.
   */
  onAuthorClick?: (authorId: string) => void
  /**
   * When false, hides the per-comment "Reply" affordance entirely. Used by flat
   * comment surfaces (e.g. Question of the Day, where each entry is a top-level
   * response with no sub-threads). Defaults to true.
   */
  allowReply?: boolean
  /**
   * Visual density of each comment. "comfortable" enlarges the author name,
   * body text and avatar for reading-focused surfaces (e.g. the Community Help
   * conversation screen). Defaults to "default" so existing surfaces are
   * unchanged.
   */
  density?: "default" | "comfortable"
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
  enforceDeleteWindow,
  onAuthorClick,
  allowReply = true,
  density = "default",
}: CommentThreadProps) {
  // Delete window inherits the edit/general window unless explicitly overridden.
  const deleteWindow = enforceDeleteWindow ?? enforceTimeWindows
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
          <CommentNode
            comment={comment}
            depth={0}
            repliesByParent={repliesByParent}
            canInteract={canInteract}
            allowReply={allowReply}
            onLike={onLike}
            onReply={onReply}
            onEdit={onEdit}
            onDelete={onDelete}
            showCopy={showCopy}
            enforceTimeWindows={enforceTimeWindows}
            enforceDeleteWindow={deleteWindow}
            onAuthorClick={onAuthorClick}
            density={density}
          />
        </li>
      ))}
    </ul>
  )
}

/** Max reply depth, Instagram-style: comment (0) → reply (1) → reply-to-reply (2). */
const MAX_DEPTH = 2

/**
 * Renders a comment plus its nested replies recursively (up to MAX_DEPTH).
 * Replies are collapsed behind a "View N replies" toggle by default, matching
 * Instagram, and each level indents a little further to the right.
 */
function CommentNode({
  comment,
  depth,
  repliesByParent,
  canInteract,
  allowReply = true,
  onLike,
  onReply,
  onEdit,
  onDelete,
  showCopy,
  enforceTimeWindows,
  enforceDeleteWindow,
  onAuthorClick,
  density = "default",
}: {
  comment: ThreadComment
  depth: number
  repliesByParent: Map<number, ThreadComment[]>
  canInteract: boolean
  allowReply?: boolean
  onLike: (commentId: number, liked: boolean) => void
  onReply: (parentId: number, text: string) => Promise<void> | void
  onEdit: (commentId: number, text: string) => Promise<void> | void
  onDelete: (commentId: number) => Promise<void> | void
  showCopy: boolean
  enforceTimeWindows: boolean
  enforceDeleteWindow: boolean
  onAuthorClick?: (authorId: string) => void
  density?: "default" | "comfortable"
}) {
  const replies = repliesByParent.get(comment.id) ?? []
  const [collapsed, setCollapsed] = useState(true)

  return (
    <div>
      <CommentItem
        comment={comment}
        canInteract={canInteract}
        canReply={allowReply && canInteract && depth < MAX_DEPTH}
        isReply={depth > 0}
        onLike={onLike}
        onReply={onReply}
        onEdit={onEdit}
        onDelete={onDelete}
        showCopy={showCopy}
        enforceTimeWindows={enforceTimeWindows}
        enforceDeleteWindow={enforceDeleteWindow}
        onAuthorClick={onAuthorClick}
        density={density}
      />

      {replies.length > 0 && (
        <div className="mt-2 border-l border-border/50 pl-3.5">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={!collapsed}
          >
            <span className="h-px w-5 bg-border" aria-hidden />
            {collapsed
              ? `View ${replies.length} ${replies.length === 1 ? "reply" : "replies"}`
              : "Hide replies"}
          </button>
          {!collapsed && (
            <ul className="space-y-3">
              {replies.map((reply) => (
                <li key={reply.id}>
                  <CommentNode
                    comment={reply}
                    depth={depth + 1}
                    repliesByParent={repliesByParent}
                    canInteract={canInteract}
                    allowReply={allowReply}
                    onLike={onLike}
                    onReply={onReply}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    showCopy={showCopy}
                    enforceTimeWindows={enforceTimeWindows}
                    enforceDeleteWindow={enforceDeleteWindow}
                    onAuthorClick={onAuthorClick}
                    density={density}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function CommentItem({
  comment,
  canInteract,
  canReply = false,
  onLike,
  onReply,
  onEdit,
  onDelete,
  showCopy,
  enforceTimeWindows = true,
  enforceDeleteWindow,
  isReply = false,
  onAuthorClick,
  density = "default",
}: {
  comment: ThreadComment
  canInteract: boolean
  canReply?: boolean
  onLike: (commentId: number, liked: boolean) => void
  onReply: (parentId: number, text: string) => Promise<void> | void
  onEdit: (commentId: number, text: string) => Promise<void> | void
  onDelete: (commentId: number) => Promise<void> | void
  showCopy: boolean
  enforceTimeWindows?: boolean
  enforceDeleteWindow?: boolean
  isReply?: boolean
  onAuthorClick?: (authorId: string) => void
  density?: "default" | "comfortable"
}) {
  const [liked, setLiked] = useState(comment.liked)
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
  const menuRef = useRef<HTMLDivElement>(null)
  let pressTimer: ReturnType<typeof setTimeout> | null = null

  // Close the anchored options menu when tapping/clicking anywhere outside it.
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [menuOpen])

  const deleteWindow = enforceDeleteWindow ?? enforceTimeWindows
  const editable = comment.isSelf && (!enforceTimeWindows || canEdit(comment.createdAtMs))
  const deletable = comment.isSelf && (!deleteWindow || canDelete(comment.createdAtMs))
  const comfortable = density === "comfortable"

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
    // Replies attach to the comment being replied to, so threads can nest
    // (capped at MAX_DEPTH by hiding the reply button deeper down).
    await onReply(comment.id, value)
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

  // When a surface supplies onAuthorClick (e.g. Community Help), the author's
  // name/avatar pops a profile card instead of navigating away. Otherwise fall
  // back to a plain profile link.
  const popsProfile = Boolean(comment.authorId && onAuthorClick)
  const NameTag = popsProfile ? "button" : comment.authorId ? Link : "span"
  const nameProps = popsProfile
    ? { type: "button" as const, onClick: () => onAuthorClick!(comment.authorId!) }
    : comment.authorId
      ? { href: `/u/${comment.authorId}` }
      : {}

  const avatar = (
    <Avatar className={cn("shrink-0", isReply ? (comfortable ? "size-8" : "size-7") : comfortable ? "size-10" : "size-8")}>
      {comment.image && <AvatarImage src={comment.image || "/placeholder.svg"} alt={comment.name} />}
      <AvatarFallback className={cn("text-xs", comment.color)}>{comment.initials}</AvatarFallback>
    </Avatar>
  )

  return (
    <div className="flex gap-2.5">
      {popsProfile ? (
        <button
          type="button"
          onClick={() => onAuthorClick!(comment.authorId!)}
          aria-label={`Open ${comment.name}'s profile`}
          className="shrink-0 rounded-full transition-opacity hover:opacity-80"
        >
          {avatar}
        </button>
      ) : (
        avatar
      )}
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
            <NameTag {...nameProps} className={cn(comfortable ? "text-[15px]" : "text-sm", "font-semibold", comment.authorId && "hover:underline")}>
              {comment.name}
            </NameTag>
            {comment.handle && <span className="text-xs text-muted-foreground">{comment.handle}</span>}
            <span className="text-xs text-muted-foreground">· {comment.postedAt}</span>
            {edited && <span className="text-xs text-muted-foreground">· edited</span>}
            {copied && <span className="text-xs text-primary">Copied</span>}
          </div>

          {!editing && (
            <p className={cn("whitespace-pre-wrap text-pretty leading-relaxed text-foreground/90", comfortable ? "text-[15px]" : "text-sm")}>
              {text}
            </p>
          )}
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
          {canReply && (
            <button
              type="button"
              onClick={() => setReplying((v) => !v)}
              className="flex items-center gap-1 transition-colors hover:text-foreground"
              aria-label="Reply to comment"
            >
              <CommentIcon className="size-4" /> Reply
            </button>
          )}
          {hasMenu && (
            <div ref={menuRef} className="relative ml-auto">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className={cn(
                  "flex items-center rounded-full p-1 transition-colors hover:text-foreground",
                  menuOpen && "text-foreground",
                )}
                aria-label="More options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <MoreHorizontal className="size-4" />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-2xl border border-border/60 bg-card p-1 shadow-xl duration-150 animate-in fade-in zoom-in-95"
                >
                  {actions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        void action.onClick()
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                        action.destructive
                          ? "text-destructive hover:bg-destructive/10"
                          : "hover:bg-secondary",
                      )}
                    >
                      <action.icon className="size-4" /> {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
    </div>
  )
}
