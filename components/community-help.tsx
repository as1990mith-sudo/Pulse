"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import useSWR, { useSWRConfig } from "swr"
import {
  ArrowLeft,
  Info,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  Share2,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ShareSheet } from "@/components/share-sheet"
import type { ShareTarget } from "@/lib/share-types"
import { linkify } from "@/lib/linkify"
import { cn } from "@/lib/utils"
import {
  addCommunityComment,
  createCommunityPost,
  deleteCommunityComment,
  deleteCommunityPost,
  getCommunityComments,
  getCommunityPosts,
  type CommunityCommentView,
  type CommunityPostView,
} from "@/app/actions/community"

const ANON_AVATAR = "/community-help-avatar.png"
const ANON_NAME = "I Need Answers"

/* -------------------------------------------------------------------------- */
/*  Anonymous identity badge (green "?" avatar + fixed name)                  */
/* -------------------------------------------------------------------------- */

function AnonIdentity({ postedAt }: { postedAt: string }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-11 shrink-0 ring-2 ring-emerald-500/30">
        <AvatarImage src={ANON_AVATAR || "/placeholder.svg"} alt="Anonymous asker" />
        <AvatarFallback className="bg-emerald-600 font-bold text-white">?</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">{ANON_NAME}</p>
        <p className="text-xs text-muted-foreground">{postedAt}</p>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Comments                                                                  */
/* -------------------------------------------------------------------------- */

function CommentSection({
  postId,
  onCountChange,
}: {
  postId: number
  onCountChange: (delta: number) => void
}) {
  const { data, isLoading, mutate } = useSWR(["community-comments", postId], () => getCommunityComments(postId))
  const [body, setBody] = useState("")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setError(null)
    startTransition(async () => {
      try {
        const created = await addCommunityComment({ postId, body: text })
        setBody("")
        onCountChange(1)
        await mutate((prev) => [...(prev ?? []), created], { revalidate: false })
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not post your reply.")
      }
    })
  }

  function handleDelete(comment: CommunityCommentView) {
    startTransition(async () => {
      try {
        await deleteCommunityComment(comment.id)
        onCountChange(-1)
        await mutate((prev) => (prev ?? []).filter((c) => c.id !== comment.id), { revalidate: false })
      } catch {
        /* ignore */
      }
    })
  }

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      {isLoading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : data && data.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {data.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5">
              <Link href={`/u/${c.userId}`} className="shrink-0">
                <Avatar className="size-8 ring-1 ring-border/60 transition-transform hover:scale-105">
                  {c.image && <AvatarImage src={c.image || "/placeholder.svg"} alt={c.userName} />}
                  <AvatarFallback className="text-xs font-semibold text-white" style={{ backgroundColor: c.color }}>
                    {c.initials}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-secondary/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Link href={`/u/${c.userId}`} className="truncate text-sm font-semibold hover:underline">
                    {c.userName}
                  </Link>
                  <span className="text-xs text-muted-foreground">{c.handle}</span>
                  <span className="text-xs text-muted-foreground">· {c.postedAt}</span>
                  {c.isSelf && (
                    <button
                      type="button"
                      onClick={() => handleDelete(c)}
                      className="ml-auto text-muted-foreground transition-colors hover:text-destructive"
                      aria-label="Delete your reply"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {linkify(c.body)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-1 text-center text-sm text-muted-foreground">Be the first to help out.</p>
      )}

      <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Offer your help…"
          rows={1}
          maxLength={1000}
          className="min-h-[40px] resize-none rounded-2xl"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSubmit(e)
            }
          }}
        />
        <Button type="submit" size="icon" className="size-10 shrink-0 rounded-full" disabled={isPending || !body.trim()}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          <span className="sr-only">Send reply</span>
        </Button>
      </form>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Post                                                                      */
/* -------------------------------------------------------------------------- */

function PostItem({
  post,
  onDeleted,
}: {
  post: CommunityPostView
  onDeleted: (id: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(post.commentCount)
  const [shareOpen, setShareOpen] = useState(false)
  const [, startTransition] = useTransition()

  const shareTarget: ShareTarget = {
    type: "community",
    key: String(post.id),
    title: "A question on Community Help",
    subtitle: post.body.length > 120 ? `${post.body.slice(0, 120)}…` : post.body,
    url: "/chatrooms/community",
    image: null,
    downloadUrl: null,
    downloadKind: null,
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteCommunityPost(post.id)
        onDeleted(post.id)
      } catch {
        /* ignore */
      }
    })
  }

  return (
    <article className="px-4 py-5 transition-colors hover:bg-secondary/20 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <AnonIdentity postedAt={post.postedAt} />
        {post.isSelf && (
          <button
            type="button"
            onClick={handleDelete}
            className="text-muted-foreground transition-colors hover:text-destructive"
            aria-label="Delete your post"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-pretty">
        {linkify(post.body)}
      </p>

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
          <MessageCircle className="size-4" />
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
      </div>

      {open && (
        <CommentSection postId={post.id} onCountChange={(d) => setCount((c) => Math.max(0, c + d))} />
      )}

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

function InfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
              <span className="font-medium text-emerald-600 dark:text-emerald-400">&ldquo;I Need Answers&rdquo;</span>. Ask
              anything and get honest opinions without revealing who you are.
            </p>
          </div>
          <div className="flex gap-3">
            <MessageCircle className="mt-0.5 size-7 shrink-0 text-primary" />
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

export function CommunityHelp({ initialPosts }: { initialPosts: CommunityPostView[] }) {
  const { mutate } = useSWRConfig()
  const { data: posts = initialPosts } = useSWR("community-posts", getCommunityPosts, {
    fallbackData: initialPosts,
    refreshInterval: 20000,
  })
  const [composerOpen, setComposerOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)

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
    <div className="flex h-full flex-col overflow-hidden">
      {/* Sticky header with title + info */}
      <header className="flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
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
            <h1 className="truncate text-base font-bold tracking-tight">Community Help</h1>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-primary"
              aria-label="How Community Help works"
            >
              <Info className="size-4" />
            </button>
          </div>
          <p className="truncate text-xs text-muted-foreground">Ask anonymously · anyone can help</p>
        </div>
      </header>

      {/* Immersive smooth-scrolling feed */}
      <div className="flex-1 overflow-y-auto scroll-smooth overscroll-contain">
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
            <Avatar className="size-16 ring-2 ring-emerald-500/30">
              <AvatarImage src={ANON_AVATAR || "/placeholder.svg"} alt="" />
              <AvatarFallback className="bg-emerald-600 text-2xl font-bold text-white">?</AvatarFallback>
            </Avatar>
            <p className="text-lg font-semibold">No questions yet</p>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Be the first to ask the community something — totally anonymously.
            </p>
            <Button onClick={() => setComposerOpen(true)} className="mt-2 gap-2 rounded-full">
              <Plus className="size-4" /> Ask anonymously
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/60 pb-28">
            {posts.map((post) => (
              <PostItem key={post.id} post={post} onDeleted={handleDeleted} />
            ))}
          </div>
        )}
      </div>

      {/* Floating ask button */}
      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        className="absolute bottom-6 right-5 z-30 flex h-14 items-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 sm:right-8"
      >
        <Plus className="size-5" />
        Ask
      </button>

      <Composer open={composerOpen} onClose={() => setComposerOpen(false)} onCreated={handleCreated} />
      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  )
}
