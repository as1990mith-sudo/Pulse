"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { Loader2, Send, X } from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import { CommentThread, type ThreadComment } from "@/components/comment-thread"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { HomeVoiceSwitch, type HomeVoice } from "@/components/home-voice-switch"
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
  /**
   * Posts a new top-level comment. Should resolve once the add is queued.
   * `asHome` is the identity chosen in the switcher, and is undefined on
   * surfaces that don't offer one — existing callers can ignore it entirely.
   */
  onSubmit?: (text: string, asHome?: boolean) => Promise<void> | void
  /**
   * When set, an admin of the active Home may post the comment in the
   * organisation's voice. Omit to hide the switcher.
   */
  homeVoice?: HomeVoice | null
  onLike?: (commentId: number, liked: boolean) => void
  /** `asHome` mirrors `onSubmit`: the identity chosen in the reply composer. */
  onReply?: (parentId: number, text: string, asHome?: boolean) => Promise<void> | void
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
  /**
   * When provided, tapping a comment author opens a profile card via this
   * callback instead of navigating to their profile page. Passed straight
   * through to the underlying CommentThread.
   */
  onAuthorClick?: (authorId: string) => void
  placeholder?: string
  /** Empty-state copy. */
  emptyText?: string
  emptyHint?: string
  /** Hides the per-comment reply affordance (flat surfaces like QOTD). */
  allowReply?: boolean
  /**
   * Overrides the sheet's height classes. Defaults to a fixed `h-[70%]` so the
   * sheet matches the Reels comment sheet. Pass e.g. `"h-[85%]"` to override.
   */
  heightClassName?: string
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
  onAuthorClick,
  placeholder = "Add a comment…",
  emptyText = "No comments yet",
  emptyHint = "Start the conversation.",
  allowReply = true,
  heightClassName,
  homeVoice = null,
}: CommentSheetProps) {
  const [draft, setDraft] = useState("")
  // Admins default to their Home's voice, matching the main composer.
  const [asHome, setAsHome] = useState(true)
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
      await onSubmit(value, homeVoice ? asHome : undefined)
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
      {/* Theme-sensitive surface: uses design tokens so the sheet follows the
          app's light/dark theme instead of being permanently charcoal. */}
      <div
        className={cn(
          "relative flex flex-col rounded-t-[1.75rem] border-t border-border bg-background text-foreground shadow-2xl animate-in slide-in-from-bottom duration-300 ease-out",
          // Fixed 70% height to match the Reels comment sheet across every
          // comment surface (feed, devotional, episodes, articles, etc.).
          heightClassName ?? "h-[70%]",
        )}
      >
        {/* Grabber + title row */}
        <header className="relative shrink-0 px-4 pt-2.5">
          <span
            className="mx-auto mb-2.5 block h-1 w-9 rounded-full bg-muted-foreground/30"
            aria-hidden="true"
            onClick={onClose}
          />
          <div className="flex items-center justify-center pb-3">
            <div className="flex items-center gap-2">
              <CommentIcon className="size-[18px] text-muted-foreground" />
              <h2 className="text-[15px] font-semibold tracking-tight">{headerTitle}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
            >
              <X className="size-[18px]" />
            </button>
          </div>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 text-foreground">
          {children ? (
            children
          ) : count === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-secondary">
                <CommentIcon className="size-7 text-muted-foreground" />
              </span>
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">{emptyText}</p>
                <p className="text-xs text-muted-foreground">{emptyHint}</p>
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
              onAuthorClick={onAuthorClick}
              allowReply={allowReply}
              // Replies get the same identity choice as the top-level composer,
              // so an admin isn't offered the Home's voice for a comment and
              // then silently reverted to their own name for a reply.
              homeVoice={homeVoice}
              personalName={currentUser?.name ?? "You"}
            />
          )}
        </div>

        {children ? null : showComposer ? (
          <form
            onSubmit={submit}
            className="flex shrink-0 flex-col gap-2 border-t border-border bg-background/95 px-3.5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur"
          >
            {/* Only rendered for admins of the active Home; see HomeVoiceSwitch. */}
            <HomeVoiceSwitch
              voice={homeVoice}
              asHome={asHome}
              onChange={setAsHome}
              personalName={currentUser?.name ?? "You"}
              size="sm"
            />
            <div className="flex items-center gap-2.5">
            {currentUser && (
              <Avatar className="size-8 shrink-0 ring-1 ring-border">
                {homeVoice && asHome ? (
                  <>
                    {homeVoice.image && <AvatarImage src={homeVoice.image || "/placeholder.svg"} alt={homeVoice.name} />}
                    <AvatarFallback className="bg-primary/15 text-[11px] text-primary">
                      {homeVoice.initials}
                    </AvatarFallback>
                  </>
                ) : (
                  <>
                    {currentUser.image && (
                      <AvatarImage src={currentUser.image || "/placeholder.svg"} alt={currentUser.name} />
                    )}
                    <AvatarFallback className={cn("text-[11px]", currentUser.color)}>
                      {currentUser.initials}
                    </AvatarFallback>
                  </>
                )}
              </Avatar>
            )}
            <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-secondary pl-4 pr-1.5 ring-1 ring-inset ring-border transition focus-within:ring-ring">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={placeholder}
                aria-label="Add a comment"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                aria-label="Post comment"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:opacity-90 disabled:scale-90 disabled:bg-muted disabled:text-muted-foreground"
              >
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </button>
            </div>
            </div>
          </form>
        ) : (
          <p className="shrink-0 border-t border-border px-4 py-4 text-center text-sm text-muted-foreground">
            <Link href="/sign-in" className="font-semibold text-foreground underline">
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
