"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import useSWR, { useSWRConfig } from "swr"
import {
  ArrowLeft,
  Check,
  Copy,
  Heart,
  Info,
  Loader2,
  Lock,
  MessageCircle,
  MoonStar,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { linkify } from "@/lib/linkify"
import { cn } from "@/lib/utils"
import { EDIT_WINDOW_MS } from "@/lib/interactions"
import {
  addDreamReply,
  createDream,
  deleteDream,
  deleteDreamReply,
  editDream,
  editDreamReply,
  getDreamReplies,
  getDreams,
  setDreamReplyLike,
  type DreamFeed,
  type DreamReplyView,
  type DreamView,
} from "@/app/actions/dreams"

const ANON_NAME = "Anonymous"

/* -------------------------------------------------------------------------- */
/*  Anonymous "dreamer" badge — shown to every member except the admin         */
/* -------------------------------------------------------------------------- */

function AnonIdentity({ postedAt, edited }: { postedAt: string; edited: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-11 shrink-0 ring-2 ring-blue-500/30">
        <AvatarFallback className="bg-blue-600 text-white">
          <MoonStar className="size-5" />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="font-semibold tracking-tight text-foreground">{ANON_NAME}</p>
        <p className="text-xs text-muted-foreground">
          {postedAt}
          {edited && " · edited"}
        </p>
      </div>
    </div>
  )
}

/** Shown to the dream's author on their OWN dream, and to the admin in the inbox. */
function SenderIdentity({ dream, asInbox }: { dream: DreamView; asInbox?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-11 shrink-0 ring-2 ring-border">
        {dream.senderImage && <AvatarImage src={dream.senderImage || "/placeholder.svg"} alt={dream.senderName ?? ""} />}
        <AvatarFallback className={cn("font-semibold text-white", dream.senderColor ?? "bg-muted")}>
          {dream.senderInitials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-semibold tracking-tight">{dream.senderName}</p>
          {dream.senderHandle && <span className="truncate text-xs text-muted-foreground">{dream.senderHandle}</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          {dream.postedAt}
          {dream.edited && " · edited"}
          {asInbox && (
            <span className="ml-1 font-medium text-blue-600 dark:text-blue-400">· anonymous to others</span>
          )}
        </p>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  A single admin interpretation — members can ONLY like or copy it          */
/* -------------------------------------------------------------------------- */

function DreamReplyItem({
  reply,
  isAdmin,
  onChanged,
}: {
  reply: DreamReplyView
  isAdmin: boolean
  onChanged: () => void
}) {
  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(reply.likes)
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(reply.body)
  const [, startTransition] = useTransition()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [menuOpen])

  const canEdit = isAdmin && Date.now() - reply.createdAtMs < EDIT_WINDOW_MS

  function toggleLike() {
    const next = !liked
    setLiked(next)
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)))
    startTransition(() => {
      void setDreamReplyLike({ replyId: reply.id, liked: next })
    })
  }

  function copy() {
    navigator.clipboard?.writeText(reply.body).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  function saveEdit() {
    const text = draft.trim()
    if (!text || text === reply.body) {
      setEditing(false)
      return
    }
    startTransition(async () => {
      await editDreamReply({ replyId: reply.id, body: text })
      setEditing(false)
      onChanged()
    })
  }

  return (
    <div className="flex gap-2.5">
      <Avatar className="size-8 shrink-0 ring-1 ring-blue-500/40">
        {reply.adminImage && <AvatarImage src={reply.adminImage || "/placeholder.svg"} alt={reply.adminName} />}
        <AvatarFallback className={cn("text-xs font-semibold text-white", reply.adminColor)}>
          {reply.adminInitials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-sm bg-blue-500/10 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{reply.adminName}</span>
            <Sparkles className="size-3 shrink-0 text-blue-600 dark:text-blue-400" />
            <span className="text-xs text-muted-foreground">Interpreter</span>
            <span className="text-xs text-muted-foreground">· {reply.postedAt}</span>
            {reply.edited && <span className="text-xs text-muted-foreground">· edited</span>}
          </div>
          {editing ? (
            <div className="mt-1.5">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="resize-none rounded-xl text-sm"
                autoFocus
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={saveEdit}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed">{linkify(reply.body)}</p>
          )}
        </div>

        {!editing && (
          <div className="mt-1 flex items-center gap-1 px-1.5 text-xs font-medium text-muted-foreground">
            <button
              type="button"
              onClick={toggleLike}
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-1 transition-colors hover:bg-secondary",
                liked && "text-live",
              )}
              aria-pressed={liked}
              aria-label="Like interpretation"
            >
              <Heart className={cn("size-3.5", liked && "fill-current")} />
              {likes > 0 ? <span className="tabular-nums">{likes}</span> : "Like"}
            </button>
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1 rounded-full px-2 py-1 transition-colors hover:bg-secondary"
              aria-label="Copy interpretation"
            >
              {copied ? <Check className="size-3.5 text-blue-600 dark:text-blue-400" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
            {isAdmin && (
              <div ref={menuRef} className="relative ml-auto">
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex items-center rounded-full p-1 transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label="Interpretation options"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <MoreHorizontal className="size-4" />
                </button>
                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-2xl border border-border/60 bg-card p-1 shadow-xl duration-150 animate-in fade-in zoom-in-95"
                  >
                    {canEdit && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false)
                          setDraft(reply.body)
                          setEditing(true)
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
                      >
                        <Pencil className="size-4" /> Edit
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        startTransition(async () => {
                          await deleteDreamReply(reply.id)
                          onChanged()
                        })
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 className="size-4" /> Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Interpretations under a dream (+ admin reply composer)                    */
/* -------------------------------------------------------------------------- */

function DreamReplies({
  dreamId,
  isAdmin,
  onCountChange,
}: {
  dreamId: number
  isAdmin: boolean
  onCountChange: (delta: number) => void
}) {
  const { data, isLoading, mutate } = useSWR(`dream-replies-${dreamId}`, () => getDreamReplies(dreamId))
  const [draft, setDraft] = useState("")
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    startTransition(async () => {
      const created = await addDreamReply({ dreamId, body: text })
      setDraft("")
      onCountChange(1)
      await mutate((prev) => [...(prev ?? []), created], { revalidate: false })
    })
  }

  return (
    <div className="mt-3 space-y-4 border-t border-border/60 pt-3">
      {isLoading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : data && data.length > 0 ? (
        <div className="flex flex-col gap-4">
          {data.map((r) => (
            <DreamReplyItem key={r.id} reply={r} isAdmin={isAdmin} onChanged={() => mutate()} />
          ))}
        </div>
      ) : (
        <p className="py-1 text-center text-sm text-muted-foreground">
          {isAdmin ? "No interpretation yet — reply below." : "Awaiting an interpretation."}
        </p>
      )}

      {isAdmin && (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Share your interpretation…"
            rows={2}
            maxLength={2000}
            className="resize-none rounded-2xl text-sm"
          />
          <Button type="submit" size="sm" className="gap-1.5 self-end rounded-full" disabled={isPending || !draft.trim()}>
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Interpret
          </Button>
        </form>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  A dream card                                                              */
/* -------------------------------------------------------------------------- */

function DreamItem({
  dream,
  isAdmin,
  onDeleted,
}: {
  dream: DreamView
  isAdmin: boolean
  onDeleted: (id: number) => void
}) {
  // The admin sees every dream's thread open as an inbox; members open on tap.
  const [open, setOpen] = useState(isAdmin)
  const [count, setCount] = useState(dream.replyCount)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(dream.body)
  const [draft, setDraft] = useState(dream.body)
  const [edited, setEdited] = useState(dream.edited)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [menuOpen])

  const canManage = dream.isSelf || isAdmin
  const showInbox = isAdmin

  function handleDelete() {
    setMenuOpen(false)
    startTransition(async () => {
      try {
        await deleteDream(dream.id)
        onDeleted(dream.id)
      } catch {
        /* ignore */
      }
    })
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
        const updated = await editDream({ dreamId: dream.id, body: text })
        setBody(updated)
        setEdited(true)
        setEditing(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save your changes.")
      }
    })
  }

  return (
    <article className="px-4 py-5 transition-colors hover:bg-secondary/20 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        {showInbox && dream.senderName ? (
          <SenderIdentity dream={dream} asInbox />
        ) : dream.isSelf ? (
          <SenderIdentity dream={dream} />
        ) : (
          <AnonIdentity postedAt={dream.postedAt} edited={edited} />
        )}

        {canManage && (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className={cn(
                "rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                menuOpen && "bg-secondary text-foreground",
              )}
              aria-label="Dream options"
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
                {dream.isSelf && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      setDraft(body)
                      setError(null)
                      setEditing(true)
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
                  >
                    <Pencil className="size-4" /> Edit
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleDelete}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" /> Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div className="mt-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            maxLength={2000}
            className="resize-none rounded-2xl text-[15px]"
            autoFocus
          />
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveEdit} disabled={isPending}>
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-pretty">
          {linkify(body)}
        </p>
      )}

      {!showInbox && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "mt-3 flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            open ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "text-muted-foreground hover:bg-secondary",
          )}
          aria-expanded={open}
        >
          <MessageCircle className="size-4" />
          {count > 0
            ? `${count} ${count === 1 ? "interpretation" : "interpretations"}`
            : "View interpretation"}
        </button>
      )}

      {open && (
        <DreamReplies
          dreamId={dream.id}
          isAdmin={isAdmin}
          onCountChange={(d) => setCount((c) => Math.max(0, c + d))}
        />
      )}
    </article>
  )
}

/* -------------------------------------------------------------------------- */
/*  Composer (share a dream anonymously)                                      */
/* -------------------------------------------------------------------------- */

function Composer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (d: DreamView) => void
}) {
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
        const created = await createDream(text)
        onCreated(created)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not share your dream.")
      }
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full max-w-lg rounded-t-3xl border border-border/60 bg-card p-5 shadow-2xl duration-200 animate-in slide-in-from-bottom sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="size-10 ring-2 ring-blue-500/30">
              <AvatarFallback className="bg-blue-600 text-white">
                <MoonStar className="size-5" />
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-foreground">{ANON_NAME}</p>
              <p className="text-xs text-muted-foreground">Only the interpreter sees who you are</p>
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
            placeholder="Describe your dream in as much detail as you can remember…"
            rows={5}
            maxLength={2000}
            className="resize-none rounded-2xl text-base"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{body.length}/2000</span>
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
          <Button type="submit" className="mt-3 w-full gap-2 rounded-full" disabled={isPending || !body.trim()}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Share dream
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

function InfoModal({ open, onClose, isAdmin }: { open: boolean; onClose: () => void; isAdmin: boolean }) {
  if (!open || typeof document === "undefined") return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full max-w-lg rounded-t-3xl border border-border/60 bg-card p-6 shadow-2xl duration-200 animate-in slide-in-from-bottom sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">How Dream Interpretation works</h2>
          <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-secondary" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <div className="flex gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
              <MoonStar className="size-4" />
            </span>
            <p>
              <span className="font-semibold text-foreground">Share your dream.</span> To everyone else you appear as{" "}
              <span className="font-medium text-foreground">&ldquo;Anonymous&rdquo;</span> — only the interpreter can
              see who sent each dream.
            </p>
          </div>
          <div className="flex gap-3">
            <Lock className="mt-0.5 size-7 shrink-0 text-primary" />
            <p>
              <span className="font-semibold text-foreground">Only the interpreter replies.</span> Other members can
              read every dream and interpretation, but cannot reply.
            </p>
          </div>
          <div className="flex gap-3">
            <Heart className="mt-0.5 size-7 shrink-0 text-primary" />
            <p>
              <span className="font-semibold text-foreground">React, don&apos;t reply.</span> You can like or copy an
              interpretation — that&apos;s it.
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-3 rounded-2xl bg-blue-500/10 p-3">
              <Sparkles className="mt-0.5 size-7 shrink-0 text-blue-600 dark:text-blue-400" />
              <p className="text-foreground">
                <span className="font-semibold">You are the interpreter.</span> Each dream shows you who sent it. Your
                reply appears to everyone as an interpretation under that dream.
              </p>
            </div>
          )}
          <div className="flex gap-3 rounded-2xl bg-destructive/10 p-3">
            <ShieldAlert className="mt-0.5 size-7 shrink-0 text-destructive" />
            <p className="text-foreground">
              <span className="font-semibold">Keep it respectful.</span> Anonymity is not an excuse to be hurtful.
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

export function DreamInterpretation({ initialFeed }: { initialFeed: DreamFeed }) {
  const { mutate } = useSWRConfig()
  const { data: feed = initialFeed } = useSWR("dream-feed", getDreams, {
    fallbackData: initialFeed,
    refreshInterval: 20000,
  })
  const isAdmin = feed.isAdmin
  const dreams = feed.dreams
  const [composerOpen, setComposerOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)

  function handleCreated(d: DreamView) {
    mutate(
      "dream-feed",
      (prev: DreamFeed | undefined) => ({
        isAdmin: prev?.isAdmin ?? isAdmin,
        dreams: [d, ...(prev?.dreams ?? [])],
      }),
      { revalidate: false },
    )
  }

  function handleDeleted(id: number) {
    mutate(
      "dream-feed",
      (prev: DreamFeed | undefined) => ({
        isAdmin: prev?.isAdmin ?? isAdmin,
        dreams: (prev?.dreams ?? []).filter((d) => d.id !== id),
      }),
      { revalidate: false },
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <Link
          href="/chatrooms"
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Back to chatrooms"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <Avatar className="size-9 ring-2 ring-blue-500/30">
          <AvatarFallback className="bg-blue-600 text-white">
            <MoonStar className="size-4" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-base font-bold tracking-tight">Dream Interpretation</h1>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-primary"
              aria-label="How Dream Interpretation works"
            >
              <Info className="size-4" />
            </button>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {isAdmin ? "Interpreter inbox · you can see every sender" : "Share your dream anonymously"}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scroll-smooth overscroll-contain">
        {dreams.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
            <Avatar className="size-16 ring-2 ring-blue-500/30">
              <AvatarFallback className="bg-blue-600 text-white">
                <MoonStar className="size-7" />
              </AvatarFallback>
            </Avatar>
            <p className="text-lg font-semibold">{isAdmin ? "No dreams yet" : "No dreams shared yet"}</p>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              {isAdmin
                ? "When members share their dreams, they'll appear here for you to interpret."
                : "Be the first to share a dream — only the interpreter will know it's you."}
            </p>
            {!isAdmin && (
              <Button onClick={() => setComposerOpen(true)} className="mt-2 gap-2 rounded-full">
                <Plus className="size-4" /> Share a dream
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/60 pb-28">
            {dreams.map((d) => (
              <DreamItem key={d.id} dream={d} isAdmin={isAdmin} onDeleted={handleDeleted} />
            ))}
          </div>
        )}
      </div>

      {!isAdmin && (
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="absolute bottom-6 right-5 z-30 flex h-14 items-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 sm:right-8"
        >
          <Plus className="size-5" />
          Share dream
        </button>
      )}

      <Composer open={composerOpen} onClose={() => setComposerOpen(false)} onCreated={handleCreated} />
      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} isAdmin={isAdmin} />
    </div>
  )
}
