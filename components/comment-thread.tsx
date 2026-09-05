"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { BadgeCheck, MoreHorizontal, Copy, Pencil, Trash2, Send, X } from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import { LikeHeart } from "@/components/like-heart"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { type SheetAction } from "@/components/action-sheet"
import { HomeVoiceSwitch, type HomeVoice } from "@/components/home-voice-switch"
import { canEdit, canDelete } from "@/lib/interactions"
import { renderMessageBody } from "@/lib/rich-text"
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
  /**
   * True when the comment speaks for a verified organisation, which shows a tick
   * beside the name. Optional so the many surfaces that have no notion of an
   * organisation voice (devotional, QOTD, articles…) need not pass it.
   */
  orgVerified?: boolean
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
  /**
   * `asHome` is the identity chosen in the reply composer's switcher, and is
   * undefined on surfaces without one (i.e. whenever `homeVoice` is null), so
   * callers can distinguish "chose personal" from "no choice offered".
   */
  onReply: (parentId: number, text: string, asHome?: boolean) => Promise<void> | void
  onEdit: (commentId: number, text: string) => Promise<void> | void
  onDelete: (commentId: number) => Promise<void> | void
  /**
   * The organisation the viewer may speak for. When set, each reply composer
   * offers the same individual/organisation choice as the top-level comment box,
   * so a reply can't be silently forced to a different identity than the comment
   * it hangs from. Null (the default) hides the control entirely.
   */
  homeVoice?: HomeVoice | null
  /** The viewer's own name, shown as the personal option in that switcher. */
  personalName?: string
  /** Viewer's photo + initials, so the personal voice chip shows their face. */
  personalImage?: string | null
  personalInitials?: string
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
  homeVoice = null,
  personalName = "",
  personalImage = null,
  personalInitials = "",
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

  // The reading-focused conversation screen (comfortable density) asks for a
  // clear, high-contrast rule between top-level threads. `foreground` is bright
  // white in dark mode and bright near-black in light mode, so a single divider
  // token satisfies both. Other surfaces (feed, reels, comment sheet) keep the
  // quieter spaced layout.
  const comfortable = density === "comfortable"

  return (
    <ul className={cn(comfortable ? "divide-y divide-foreground/70" : "space-y-4")}>
      {roots.map((comment) => (
        <li key={comment.id} className={cn(comfortable && "py-5 first:pt-0 last:pb-0")}>
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
            homeVoice={homeVoice}
            personalName={personalName}
            personalImage={personalImage}
            personalInitials={personalInitials}
          />
        </li>
      ))}
    </ul>
  )
}

/**
 * Reply depth is unbounded — every comment can be replied to, at any level, so
 * conversations nest as deeply as people take them. To keep deep chains legible
 * on narrow screens we stop *adding* left indentation past MAX_VISUAL_INDENT:
 * further levels still thread (and collapse/expand) correctly, they just render
 * flush with that level instead of marching off the right edge.
 */
const MAX_VISUAL_INDENT = 4

/**
 * Renders a comment plus its nested replies recursively, to any depth. Replies
 * are collapsed behind a "View N replies" toggle by default, matching Instagram,
 * and each level indents a little further to the right until MAX_VISUAL_INDENT.
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
  homeVoice = null,
  personalName = "",
  personalImage = null,
  personalInitials = "",
}: {
  comment: ThreadComment
  depth: number
  repliesByParent: Map<number, ThreadComment[]>
  canInteract: boolean
  allowReply?: boolean
  onLike: (commentId: number, liked: boolean) => void
  onReply: (parentId: number, text: string, asHome?: boolean) => Promise<void> | void
  onEdit: (commentId: number, text: string) => Promise<void> | void
  onDelete: (commentId: number) => Promise<void> | void
  showCopy: boolean
  enforceTimeWindows: boolean
  enforceDeleteWindow: boolean
  onAuthorClick?: (authorId: string) => void
  density?: "default" | "comfortable"
  homeVoice?: HomeVoice | null
  personalName?: string
  /** Viewer's photo + initials, so the personal voice chip shows their face. */
  personalImage?: string | null
  personalInitials?: string
}) {
  const replies = repliesByParent.get(comment.id) ?? []
  const [collapsed, setCollapsed] = useState(true)

  return (
    <div>
      <CommentItem
        comment={comment}
        canInteract={canInteract}
        canReply={allowReply && canInteract}
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
        homeVoice={homeVoice}
        personalName={personalName}
        personalImage={personalImage}
        personalInitials={personalInitials}
      />

      {replies.length > 0 && (
        <div className={cn("mt-2", depth < MAX_VISUAL_INDENT && "border-l border-border/50 pl-3.5")}>
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
                    homeVoice={homeVoice}
                    personalName={personalName}
                    personalImage={personalImage}
                    personalInitials={personalInitials}
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
  homeVoice = null,
  personalName = "",
  personalImage = null,
  personalInitials = "",
}: {
  comment: ThreadComment
  canInteract: boolean
  canReply?: boolean
  onLike: (commentId: number, liked: boolean) => void
  onReply: (parentId: number, text: string, asHome?: boolean) => Promise<void> | void
  onEdit: (commentId: number, text: string) => Promise<void> | void
  onDelete: (commentId: number) => Promise<void> | void
  showCopy: boolean
  enforceTimeWindows?: boolean
  enforceDeleteWindow?: boolean
  isReply?: boolean
  onAuthorClick?: (authorId: string) => void
  density?: "default" | "comfortable"
  homeVoice?: HomeVoice | null
  personalName?: string
  /** Viewer's photo + initials, so the personal voice chip shows their face. */
  personalImage?: string | null
  personalInitials?: string
}) {
  const [liked, setLiked] = useState(comment.liked)
  const [likes, setLikes] = useState(comment.likes)
  const [menuOpen, setMenuOpen] = useState(false)
  const [replying, setReplying] = useState(false)
  const [replyDraft, setReplyDraft] = useState("")
  // Replies default to the organisation's voice for the same reason posts do:
  // holding the right is what makes the option available. Resets each time the
  // composer closes, so a one-off personal reply doesn't stick.
  const [replyAsHome, setReplyAsHome] = useState(true)
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

  const editable = comment.isSelf && (!enforceTimeWindows || canEdit(comment.createdAtMs))
  // Deleting your own comment is permanent, never time-limited. Editing still
  // expires (a comment others have already replied to shouldn't change meaning
  // under them), but removal is the author's own content decision and there's no
  // point at which they should lose it. The matching server-side window was
  // removed too, so this isn't offering an action the action would then reject.
  const deletable = comment.isSelf
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
    // Replies attach to the comment being replied to, so threads can nest to any
    // depth. The chosen identity is only meaningful when a switcher was offered.
    await onReply(comment.id, value, homeVoice ? replyAsHome : undefined)
    setReplyDraft("")
    setReplying(false)
    setReplyAsHome(true)
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
    // items-start keeps the avatar top-aligned with the author name. Without it
    // the column stretches to the full comment height and the button-wrapped
    // (clickable) avatar gets vertically centered, drifting below the name.
    <div className="flex items-start gap-2.5">
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
            {comment.orgVerified && (
              <BadgeCheck className="size-4 shrink-0 text-sky-400" aria-label="Verified organisation" />
            )}
            {comment.handle && <span className="text-xs text-muted-foreground">{comment.handle}</span>}
            <span className="text-xs text-muted-foreground">· {comment.postedAt}</span>
            {edited && <span className="text-xs text-muted-foreground">· edited</span>}
            {copied && <span className="text-xs text-primary">Copied</span>}
          </div>

          {!editing && (
            <p className={cn("whitespace-pre-wrap text-pretty leading-relaxed text-foreground/90", comfortable ? "text-[15px]" : "text-sm")}>
              {renderMessageBody(text, { link: true, mention: true })}
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
            className={cn("flex items-center gap-1 transition-colors hover:text-like", liked && "text-like")}
            aria-pressed={liked}
            aria-label="Like comment"
          >
            <LikeHeart liked={liked} className="size-4" />
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
          <form onSubmit={submitReply} className="mt-2 space-y-2">
            {/* Only rendered for admins of the active Home; see HomeVoiceSwitch.
                Sized "sm" and capped in width so it reads as a property of this
                inline reply box rather than a second page-level control. */}
            <HomeVoiceSwitch
              voice={homeVoice}
              asHome={replyAsHome}
              onChange={setReplyAsHome}
              personalName={personalName}
              personalImage={personalImage}
              personalInitials={personalInitials}
              size="sm"
              className="max-w-[16rem]"
            />
            <div className="flex items-start gap-2">
              <Textarea
                autoFocus
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                placeholder="Reply…"
                rows={1}
                className="min-h-9 resize-none text-sm"
                aria-label="Write a reply"
              />
              <Button type="submit" size="icon" disabled={!replyDraft.trim()} aria-label="Send reply">
                <Send className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setReplying(false)}
                aria-label="Cancel reply"
              >
                <X className="size-4" />
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
