"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { Loader2, Send, X } from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import { CommentThread, type ThreadComment } from "@/components/comment-thread"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

/** Minimal current-user shape the composer needs for its avatar. */
export type CommentSheetUser = {
  name: string
  initials: string
  color: string
  image: string | null
} | null

export type CommentSheetProps = {
  open: boolean
  onClose: () => void
  /**
   * Custom body. When provided, the sheet renders these children (a bespoke
   * list + composer) instead of the built-in CommentThread/composer. Used by
   * specialized surfaces like dream interpretation.
   */
  children?: React.ReactNode
  /** Header title override. Defaults to a count-based label. */
  title?: string
  /** Explicit comment count for the header (needed in children mode). */
  count?: number
  comments?: ThreadComment[]
  /** Signed-in user (enables the composer). Null shows a sign-in prompt. */
  currentUser?: CommentSheetUser
  /** Posts a new top-level comment. Should resolve once the add is queued. */
  onSubmit?: (text: string) => Promise<void> | void
  onLike?: (commentId: number, liked: boolean) => void
  onReply?: (parentId: number, text: string) => Promise<void> | void
  onEdit?: (commentId: number, text: string) => Promise<void> | void
  onDelete?: (commentId: number) => Promise<void> | void
  /**
   * Whether the composer is shown. Defaults to whether there's a current user.
   * Surfaces that assume a signed-in user (e.g. anonymous community help) can
   * force it true without providing avatar details.
   */
  canComment?: boolean
  showCopy?: boolean
  enforceTimeWindows?: boolean
  placeholder?: string
  /** Empty-state copy. */
  emptyText?: string
  emptyHint?: string
}

/**
 * The app-wide comment experience: a dark bottom sheet that slides up from the
 * bottom — identical look and behaviour to the Reels comment sheet. Wraps the
 * shared CommentThread plus a sticky composer, and is used by every comment
 * surface (feed, devotional, community, dream interpretation, episodes).
 */
export function CommentSheet({
  open,
  onClose,
  children,
  title,
  count: countProp,
  comments,
  currentUser = null,
  onSubmit,
  onLike,
  onReply,
  onEdit,
  onDelete,
  canComment,
  showCopy = true,
  enforceTimeWindows = true,
  placeholder = "Add a comment…",
  emptyText = "No comments yet",
  emptyHint = "Start the conversation.",
}: CommentSheetProps) {
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  // Portals need the DOM; only render into document.body after mount (SSR-safe).
  const [mounted, setMounted] = useState(false)
  // Height (px) the on-screen keyboard currently occupies. Used to lift the whole
  // sheet — composer included — above the keyboard so the text box is never hidden.
  const [keyboardInset, setKeyboardInset] = useState(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Lock body scroll while the sheet is open so only the list scrolls.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Track the software keyboard via the VisualViewport API. When the keyboard
  // opens the visual viewport shrinks while the layout viewport (what `fixed`
  // elements anchor to) does not, so a bottom-anchored composer ends up behind
  // the keyboard. We measure the difference and lift the sheet by that amount.
  useEffect(() => {
    if (!open) return
    const vv = typeof window !== "undefined" ? window.visualViewport : null
    if (!vv) return
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      // Ignore tiny insets (browser chrome jitter) to avoid needless reflow.
      setKeyboardInset(inset > 80 ? inset : 0)
    }
    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      setKeyboardInset(0)
    }
  }, [open])

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open || !mounted) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = draft.trim()
    if (!value || sending || !onSubmit) return
    setSending(true)
    try {
      await onSubmit(value)
      setDraft("")
    } finally {
      setSending(false)
    }
  }

  const count = countProp ?? comments?.length ?? 0
  const headerTitle = title ?? (count > 0 ? `${count} ${count === 1 ? "comment" : "comments"}` : "Comments")
  const showComposer = !children && (canComment ?? !!currentUser)

  return createPortal(
    // Portaled to <body> so `fixed` always anchors to the viewport (never a
    // transformed post/carousel ancestor) and slides up from the bottom of the
    // page. z-[70] keeps it above the episode player (z-58 fullscreen / z-60
    // docked mini). `bottom` is lifted by the keyboard height when one is open.
    <div
      className="fixed inset-x-0 top-0 z-[70] flex flex-col justify-end"
      style={{ bottom: keyboardInset }}
      data-no-swipe
    >
      <button
        type="button"
        aria-label="Close comments"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200"
      />
      {/* Force dark tokens so the shared (token-based) CommentThread always reads
          correctly on this dark immersive sheet, regardless of app theme. */}
      <div className="dark relative flex max-h-[82%] min-h-[52%] flex-col rounded-t-[1.75rem] border-t border-white/10 bg-neutral-950 text-white shadow-2xl animate-in slide-in-from-bottom duration-300 ease-out">
        {/* Grabber + title row */}
        <header className="relative shrink-0 px-4 pt-2.5">
          <span
            className="mx-auto mb-2.5 block h-1 w-9 rounded-full bg-white/25"
            aria-hidden="true"
            onClick={onClose}
          />
          <div className="flex items-center justify-center pb-3">
            <div className="flex items-center gap-2">
              <CommentIcon className="size-[18px] text-white/70" />
              <h2 className="text-[15px] font-semibold tracking-tight">{headerTitle}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-[18px]" />
            </button>
          </div>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 text-foreground">
          {children ? (
            children
          ) : count === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-white/5">
                <CommentIcon className="size-7 text-white/40" />
              </span>
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-white/80">{emptyText}</p>
                <p className="text-xs text-white/45">{emptyHint}</p>
              </div>
            </div>
          ) : (
            <CommentThread
              comments={comments ?? []}
              canInteract={canComment ?? !!currentUser}
              showCopy={showCopy}
              enforceTimeWindows={enforceTimeWindows}
              onLike={onLike ?? (() => {})}
              onReply={onReply ?? (() => {})}
              onEdit={onEdit ?? (() => {})}
              onDelete={onDelete ?? (() => {})}
            />
          )}
        </div>

        {children ? null : showComposer ? (
          <form
            onSubmit={submit}
            className="flex shrink-0 items-center gap-2.5 border-t border-white/10 bg-neutral-950/95 px-3.5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur"
          >
            {currentUser && (
              <Avatar className="size-8 shrink-0 ring-1 ring-white/10">
                {currentUser.image && <AvatarImage src={currentUser.image || "/placeholder.svg"} alt={currentUser.name} />}
                <AvatarFallback className={cn("text-[11px]", currentUser.color)}>{currentUser.initials}</AvatarFallback>
              </Avatar>
            )}
            <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-white/[0.08] pl-4 pr-1.5 ring-1 ring-inset ring-white/10 transition focus-within:ring-white/25">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={placeholder}
                aria-label="Add a comment"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                aria-label="Post comment"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:opacity-90 disabled:scale-90 disabled:bg-white/10 disabled:text-white/40"
              >
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </button>
            </div>
          </form>
        ) : (
          <p className="shrink-0 border-t border-white/10 px-4 py-4 text-center text-sm text-white/60">
            <Link href="/sign-in" className="font-semibold text-white underline">
              Sign in
            </Link>{" "}
            to join the conversation.
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
