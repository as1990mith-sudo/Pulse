"use client"

import { useEffect, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { Loader2, Send, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { CommentThread, type ThreadComment } from "@/components/comment-thread"
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
import { cn } from "@/lib/utils"

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
 * Bottom-sheet comment thread for the immersive episode player. Reuses the
 * shared CommentThread + episode comment server actions, and reports the live
 * count back to the player so the action bar badge stays in sync.
 */
export function EpisodeCommentsSheet({
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

  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [comments, setComments] = useState<EpisodeCommentView[]>([])
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState("")
  const [isPending, startTransition] = useTransition()

  useEffect(() => setMounted(true), [])

  // Slide-up / fade transition driven by `open`.
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(id)
    }
    setVisible(false)
  }, [open])

  // Load comments whenever the sheet opens.
  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    getEpisodeComments(episodeId)
      .then((c) => {
        if (!active) return
        setComments(c)
        onCountChange?.(c.length)
      })
      .catch(() => {})
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, episodeId])

  async function refresh() {
    const c = await getEpisodeComments(episodeId)
    setComments(c)
    onCountChange?.(c.length)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !user) return
    setDraft("")
    startTransition(async () => {
      await addEpisodeComment({ episodeId, text })
      await refresh()
    })
  }

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Comments">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close comments"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/60 transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Sheet */}
      <div
        className={cn(
          "relative flex max-h-[80vh] flex-col rounded-t-3xl border-t border-border/60 bg-card shadow-2xl transition-transform duration-300 ease-out",
          visible ? "translate-y-0" : "translate-y-full",
        )}
      >
        {/* Grabber + header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <span className="w-8" />
          <div className="flex flex-col items-center">
            <span className="absolute top-1.5 h-1 w-10 rounded-full bg-foreground/20" />
            <h2 className="text-sm font-semibold">
              {comments.length > 0 ? `${comments.length} comment${comments.length === 1 ? "" : "s"}` : "Comments"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Thread */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No comments yet. Start the conversation.</p>
          ) : (
            <CommentThread
              comments={comments.map(toThreadComment)}
              canInteract={Boolean(user)}
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
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-border/60 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {user ? (
            <form onSubmit={submit} className="flex items-center gap-2">
              <Avatar className="size-8">
                <AvatarImage src={user.image || undefined} alt="" />
                <AvatarFallback
                  style={{ backgroundColor: getAvatarColor(user.id) }}
                  className="text-xs text-white"
                >
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a comment…"
                className="h-9 flex-1 rounded-full border border-border/60 bg-background px-4 text-sm outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={!draft.trim() || isPending}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                aria-label="Post comment"
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </button>
            </form>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/sign-in" className="font-medium text-primary hover:underline">
                Sign in
              </Link>{" "}
              to join the conversation.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
