"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import useSWR, { useSWRConfig } from "swr"
import {
  ArrowLeft,
  Check,
  Copy,
  Info,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Share2,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ShareSheet } from "@/components/share-sheet"
import type { ShareTarget } from "@/lib/share-types"
import { linkify } from "@/lib/linkify"
import { useAutoHideChatChrome, useChatChromeHidden } from "@/lib/chat-chrome"
import { cn } from "@/lib/utils"
import {
  addCommunityComment,
  createCommunityPost,
  deleteCommunityComment,
  deleteCommunityPost,
  editCommunityComment,
  editCommunityPost,
  getCommunityComments,
  getCommunityPosts,
  setCommunityCommentLike,
  type CommunityCommentView,
  type CommunityPostView,
} from "@/app/actions/community"
import { type ThreadComment } from "@/components/comment-thread"
import { CommentSheet } from "@/components/comment-sheet"
import { MiniChatProvider, useMiniChat } from "@/components/mini-chat"
import { EditedIndicator } from "@/components/edited-indicator"

function toThreadComment(c: CommunityCommentView): ThreadComment {
  return {
    id: c.id,
    parentId: c.parentId,
    authorId: c.userId,
    isSelf: c.isSelf,
    name: c.userName,
    handle: c.handle,
    initials: c.initials,
    color: c.color,
    image: c.image,
    text: c.body,
    likes: c.likes,
    liked: c.liked,
    edited: c.edited,
    postedAt: c.postedAt,
    createdAtMs: c.createdAtMs,
  }
}

const ANON_AVATAR = "/community-help-avatar.png"
const ANON_NAME = "Anonymous"

/* -------------------------------------------------------------------------- */
/*  Anonymous identity badge (green "?" avatar + fixed name)                  */
/* -------------------------------------------------------------------------- */

function AnonIdentity({ postedAt, edited }: { postedAt: string; edited?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-11 shrink-0 ring-2 ring-emerald-500/30">
        <AvatarImage src={ANON_AVATAR || "/placeholder.svg"} alt="Anonymous asker" />
        <AvatarFallback className="bg-emerald-600 font-bold text-white">?</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-base font-bold tracking-tight text-foreground">
          {ANON_NAME}
          {edited && <EditedIndicator />}
        </p>
        <p className="text-xs text-muted-foreground">{postedAt}</p>
      </div>
    </div>
  )
}

/**
 * Shown to the post's author on their OWN post: their real name + avatar, with
 * a hint that everyone else still sees it anonymously.
 */
function SelfIdentity({ post, edited }: { post: CommunityPostView; edited?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-11 shrink-0 ring-2 ring-border">
        {post.authorImage && <AvatarImage src={post.authorImage || "/placeholder.svg"} alt={post.authorName ?? ""} />}
        <AvatarFallback className={cn("font-semibold text-white", post.authorColor ?? "bg-muted")}>
          {post.authorInitials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-base font-bold tracking-tight">
          {post.authorName}
          {edited && <EditedIndicator />}
        </p>
        <p className="text-xs text-muted-foreground">
          {post.postedAt} · <span className="font-medium text-foreground">You are anonymous in this room</span>
        </p>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Comments                                                                  */
/* -------------------------------------------------------------------------- */

function CommentSection({
  postId,
  open,
  onClose,
  onCountChange,
}: {
  postId: number
  open: boolean
  onClose: () => void
  onCountChange: (delta: number) => void
}) {
  // Only fetch once the sheet is opened, so closed posts don't fetch eagerly.
  const { data = [], mutate } = useSWR(open ? ["community-comments", postId] : null, () =>
    getCommunityComments(postId),
  )
  // Tapping a helper's name/avatar opens a profile card (Follow · Message ·
  // View profile) instead of leaving the feed.
  const { openProfile } = useMiniChat()

  return (
    <CommentSheet
      open={open}
      onClose={onClose}
      comments={data.map(toThreadComment)}
      currentUser={null}
      canComment
      onAuthorClick={openProfile}
      placeholder="Offer your help…"
      emptyText="No replies yet"
      emptyHint="Be the first to help out."
      onSubmit={async (text) => {
        const created = await addCommunityComment({ postId, body: text })
        onCountChange(1)
        await mutate((prev) => [...(prev ?? []), created], { revalidate: false })
      }}
      onLike={(commentId, liked) => void setCommunityCommentLike({ commentId, liked })}
      onReply={async (parentId, value) => {
        const created = await addCommunityComment({ postId, body: value, parentId })
        onCountChange(1)
        await mutate((prev) => [...(prev ?? []), created], { revalidate: false })
      }}
      onEdit={async (commentId, value) => {
        await editCommunityComment({ commentId, body: value })
        await mutate()
      }}
      onDelete={async (commentId) => {
        await deleteCommunityComment(commentId)
        onCountChange(-1)
        await mutate((prev) => (prev ?? []).filter((c) => c.id !== commentId), { revalidate: false })
      }}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  Post                                                                      */
/* -------------------------------------------------------------------------- */

function PostItem({
  post,
  onDeleted,
  highlighted = false,
}: {
  post: CommunityPostView
  onDeleted: (id: number) => void
  highlighted?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(post.commentCount)
  const [shareOpen, setShareOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(post.body)
  const [draft, setDraft] = useState(post.body)
  const [edited, setEdited] = useState(post.edited)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const menuRef = useRef<HTMLDivElement>(null)

  // Close the menu when clicking anywhere outside it.
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [menuOpen])

  const shareTarget: ShareTarget = {
    type: "community",
    key: String(post.id),
    title: "A question on Community Help",
    subtitle: body.length > 120 ? `${body.slice(0, 120)}…` : body,
    url: `/chatrooms/community?q=${post.id}`,
    image: null,
    downloadUrl: null,
    downloadKind: null,
  }

  function handleDelete() {
    setMenuOpen(false)
    startTransition(async () => {
      try {
        await deleteCommunityPost(post.id)
        onDeleted(post.id)
      } catch {
        /* ignore */
      }
    })
  }

  async function handleCopy() {
    setMenuOpen(false)
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  function startEdit() {
    setMenuOpen(false)
    setDraft(body)
    setError(null)
    setEditing(true)
  }

  function saveEdit() {
    const text = draft.trim()
    if (!text || text === body) {
      setEditing(false)
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const updated = await editCommunityPost({ postId: post.id, body: text })
        setBody(updated)
        setEdited(true)
        setEditing(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save your changes.")
      }
    })
  }

  return (
      <article
        id={`q-${post.id}`}
        className={cn(
          "scroll-mt-24 px-4 py-5 transition-colors hover:bg-secondary/20 sm:px-6",
          highlighted && "rounded-lg ring-2 ring-primary ring-inset",
        )}
      >
      <div className="flex items-start justify-between gap-3">
        {post.isSelf ? (
          <SelfIdentity post={post} edited={edited} />
        ) : (
          <AnonIdentity postedAt={post.postedAt} edited={edited} />
        )}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className={cn(
              "rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
              menuOpen && "bg-secondary text-foreground",
            )}
            aria-label="Post options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal className="size-5" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-2xl border border-border/60 bg-card p-1 shadow-xl duration-150 animate-in fade-in zoom-in-95"
            >
              {post.isSelf && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={startEdit}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
                >
                  <Pencil className="size-4" /> Edit
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={handleCopy}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
              >
                <Copy className="size-4" /> Copy text
              </button>
              {post.isSelf && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleDelete}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={1000}
            autoFocus
            className="resize-none rounded-2xl text-[17px]"
          />
          {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => setEditing(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 rounded-full"
              onClick={saveEdit}
              disabled={isPending || !draft.trim()}
            >
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-wrap break-words text-[17px] leading-relaxed text-pretty">
          {linkify(body)}
        </p>
      )}

      <div className="mt-3 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            open ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary",
          )}
          aria-expanded={open}
        >
          <CommentIcon className="size-4" />
          {count > 0 ? `${count} ${count === 1 ? "reply" : "replies"}` : "Reply"}
        </button>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
        >
          <Share2 className="size-4" />
          Share
        </button>
        {copied && (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5" /> Copied
          </span>
        )}
      </div>

      <CommentSection
        postId={post.id}
        open={open}
        onClose={() => setOpen(false)}
        onCountChange={(d) => setCount((c) => Math.max(0, c + d))}
      />

      <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />
    </article>
  )
}

/* -------------------------------------------------------------------------- */
/*  Composer (floating "ask anonymously")                                     */
/* -------------------------------------------------------------------------- */

function Composer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (p: CommunityPostView) => void }) {
  const [body, setBody] = useState("")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 50)
    else {
      setBody("")
      setError(null)
    }
  }, [open])

  if (!open || typeof document === "undefined") return null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setError(null)
    startTransition(async () => {
      try {
        const created = await createCommunityPost(text)
        onCreated(created)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not post your question.")
      }
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full max-w-lg rounded-t-3xl border border-border/60 bg-card p-5 shadow-2xl duration-200 animate-in slide-in-from-bottom sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="size-10 ring-2 ring-emerald-500/30">
              <AvatarImage src={ANON_AVATAR || "/placeholder.svg"} alt="" />
              <AvatarFallback className="bg-emerald-600 font-bold text-white">?</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-emerald-600 dark:text-emerald-400">{ANON_NAME}</p>
              <p className="text-xs text-muted-foreground">Your post is anonymous</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-secondary" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Ask anything… what's on your mind?"
            rows={4}
            maxLength={1000}
            className="resize-none rounded-2xl text-base"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{body.length}/1000</span>
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
          <Button type="submit" className="mt-3 w-full gap-2 rounded-full" disabled={isPending || !body.trim()}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Post anonymously
          </Button>
        </form>
      </div>
    </div>,
    document.body,
  )
}

/* -------------------------------------------------------------------------- */
/*  Info modal                                                                */
/* -------------------------------------------------------------------------- */

// Exported so the Chat Rooms two-tab hub can trigger the same information from
// the info (ⓘ) button beside the "Community Help" tab label — the standalone
// header that used to hold it is hidden in embedded mode.
export function CommunityHelpInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open || typeof document === "undefined") return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full max-w-lg rounded-t-3xl border border-border/60 bg-card p-6 shadow-2xl duration-200 animate-in slide-in-from-bottom sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">How Community Help works</h2>
          <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-secondary" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <div className="flex gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 font-bold text-white">?</span>
            <p>
          <span className="font-semibold text-foreground">Post anonymously.</span> Everyone here appears as{" "}
          <span className="font-medium text-foreground">&ldquo;Anonymous&rdquo;</span>. Ask
          anything and get honest opinions without revealing who you are.
            </p>
          </div>
          <div className="flex gap-3">
            <CommentIcon className="mt-0.5 size-7 shrink-0 text-primary" />
            <p>
              <span className="font-semibold text-foreground">Replies are public.</span> When you help someone by replying,
              your real profile picture and name are shown and link to your profile — so be kind and constructive.
            </p>
          </div>
          <div className="flex gap-3">
            <Info className="mt-0.5 size-7 shrink-0 text-primary" />
            <p>
              <span className="font-semibold text-foreground">Different from other chatrooms.</span> Regular chatrooms are
              private group inboxes you create and invite people to. Community Help is one open, app-wide feed of questions —
              not a private group chat.
            </p>
          </div>
          <div className="flex gap-3 rounded-2xl bg-destructive/10 p-3">
            <ShieldAlert className="mt-0.5 size-7 shrink-0 text-destructive" />
            <p className="text-foreground">
              <span className="font-semibold">Keep it respectful.</span> Harassment, hate speech, and offensive posts or
              comments are not tolerated and may be removed. Anonymity is not an excuse to be hurtful.
            </p>
          </div>
        </div>
        <Button onClick={onClose} className="mt-5 w-full rounded-full">
          Got it
        </Button>
      </div>
    </div>,
    document.body,
  )
}

/* -------------------------------------------------------------------------- */
/*  Root                                                                      */
/* -------------------------------------------------------------------------- */

export function CommunityHelp({
  initialPosts,
  // When rendered inside the Chat Rooms two-tab hub the page IS /chatrooms, so
  // the "Back to chatrooms" arrow would loop back to itself — hide it there.
  embedded = false,
}: {
  initialPosts: CommunityPostView[]
  embedded?: boolean
}) {
  const { mutate } = useSWRConfig()
  const { data: posts = initialPosts } = useSWR("community-posts", getCommunityPosts, {
    fallbackData: initialPosts,
    refreshInterval: 20000,
  })
  const [composerOpen, setComposerOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [highlightedQ, setHighlightedQ] = useState<string | null>(null)
  // "Community" shows everyone's questions; "My Posts" narrows to the ones the
  // signed-in user authored so they can track their own threads easily.
  const [scope, setScope] = useState<"community" | "mine">("community")
  // Auto-hide the global app header as the feed scrolls (Instagram/Telegram feel).
  const onFeedScroll = useAutoHideChatChrome()
  // Same scroll-direction signal that hides the global header — used here to
  // collapse this room's own header in lockstep (down = hide, up = reveal).
  const chromeHidden = useChatChromeHidden()

  const visiblePosts = scope === "mine" ? posts.filter((p) => p.isSelf) : posts
  const myCount = posts.filter((p) => p.isSelf).length

  // Deep link: arriving with ?q=<id> from a shared link scrolls to and briefly
  // highlights that exact question instead of just the top of the feed.
  useEffect(() => {
    if (typeof window === "undefined") return
    const targetId = new URLSearchParams(window.location.search).get("q")
    if (!targetId) return
    const t = setTimeout(() => {
      const el = document.getElementById(`q-${targetId}`)
      if (!el) return
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      setHighlightedQ(targetId)
      setTimeout(() => setHighlightedQ(null), 2400)
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleCreated(post: CommunityPostView) {
    mutate("community-posts", (prev: CommunityPostView[] | undefined) => [post, ...(prev ?? [])], { revalidate: false })
  }

  function handleDeleted(id: number) {
    mutate(
      "community-posts",
      (prev: CommunityPostView[] | undefined) => (prev ?? []).filter((p) => p.id !== id),
      { revalidate: false },
    )
  }

  return (
    <MiniChatProvider>
    <div className="flex h-full flex-col overflow-hidden">
      {/* Standalone header + "Community / My Posts" filter. Both are hidden when
          embedded in the Chat Rooms two-tab hub — there the top-level tab bar IS
          the section header, the info (ⓘ) lives beside the tab label, and the
          old "My Posts" concept is removed. Kept intact for the standalone
          /chatrooms/community route (reached from shared deep links). */}
      {!embedded && (
        <>
          {/* Header collapses + fades away on scroll-down and returns on scroll-up,
              mirroring the global chrome. max-height + opacity keep it in flow so
              the feed reclaims the space smoothly. */}
          <header
            className={cn(
              "flex items-center gap-3 overflow-hidden border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur transition-[max-height,opacity,padding] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none sm:px-6",
              chromeHidden ? "pointer-events-none max-h-0 border-transparent py-0 opacity-0" : "max-h-24 opacity-100",
            )}
          >
            <Link
              href="/chatrooms"
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Back to chatrooms"
            >
              <ArrowLeft className="size-5" />
            </Link>
            <Avatar className="size-9 ring-2 ring-emerald-500/30">
              <AvatarImage src={ANON_AVATAR || "/placeholder.svg"} alt="" />
              <AvatarFallback className="bg-emerald-600 font-bold text-white">?</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate text-xl font-bold tracking-tight">Community Help</h1>
                <button
                  type="button"
                  onClick={() => setInfoOpen(true)}
                  className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-primary"
                  aria-label="How Community Help works"
                >
                  <Info className="size-4" />
                </button>
              </div>
              <p className="truncate text-sm text-muted-foreground">Ask anonymously · anyone can help</p>
            </div>
          </header>

          {/* Community / My Posts toggle */}
          <div className="border-b border-border/60 bg-background/95 px-4 py-2.5 backdrop-blur sm:px-6">
            <div role="tablist" aria-label="Filter questions" className="flex gap-1 rounded-full bg-secondary/60 p-1">
              {(
                [
                  { key: "community", label: "Community" },
                  { key: "mine", label: "My Posts", count: myCount },
                ] as const
              ).map((t) => {
                const active = scope === t.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setScope(t.key)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-base font-semibold transition-colors",
                      active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.label}
                    {"count" in t && (
                      <span
                        className={cn(
                          "min-w-5 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums",
                          active
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {t.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Immersive smooth-scrolling feed */}
      <div onScroll={onFeedScroll} className="flex-1 overflow-y-auto scroll-smooth overscroll-contain">
        {visiblePosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
            <Avatar className="size-16 ring-2 ring-emerald-500/30">
              <AvatarImage src={ANON_AVATAR || "/placeholder.svg"} alt="" />
              <AvatarFallback className="bg-emerald-600 text-2xl font-bold text-white">?</AvatarFallback>
            </Avatar>
            <p className="text-lg font-semibold">{scope === "mine" ? "You haven't posted yet" : "No questions yet"}</p>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              {scope === "mine"
                ? "Questions you ask will appear here so you can track the replies you get."
                : "Be the first to ask the community something — totally anonymously."}
            </p>
            <Button onClick={() => setComposerOpen(true)} className="mt-2 gap-2 rounded-full">
              <Plus className="size-4" /> Ask anonymously
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/60 pb-28">
            {visiblePosts.map((post) => (
              <PostItem
                key={post.id}
                post={post}
                onDeleted={handleDeleted}
                highlighted={highlightedQ === String(post.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating ask button — slides away on scroll-down and returns on
          scroll-up, in lockstep with the header (same chrome scroll signal). */}
      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        className={cn(
          "absolute bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-5 z-30 inline-flex w-fit items-center gap-2 rounded-full bg-primary px-4 py-2 text-base font-semibold text-primary-foreground shadow-lg transition-[transform,opacity] duration-300 ease-out hover:scale-105 active:scale-95 sm:right-8",
          chromeHidden ? "pointer-events-none translate-y-[200%] opacity-0" : "translate-y-0 opacity-100",
        )}
      >
        <Plus className="size-5" />
        Ask
      </button>

      <Composer open={composerOpen} onClose={() => setComposerOpen(false)} onCreated={handleCreated} />
      <CommunityHelpInfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
    </MiniChatProvider>
  )
}
