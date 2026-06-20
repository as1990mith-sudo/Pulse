"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Heart, MessageCircle, Share2, Check, Send, Loader2 } from "lucide-react"
import type { Show } from "@/lib/data"
import type { CurrentUser } from "@/lib/session"
import type { EpisodeCommentView } from "@/app/actions/episodes"
import {
  addEpisodeComment,
  setEpisodeLike,
  setEpisodeCommentLike,
  getEpisodeComments,
} from "@/app/actions/episodes"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

export function EpisodeInteractions({
  show,
  currentUser,
  initialComments,
}: {
  show: Show
  currentUser: CurrentUser | null
  initialComments: EpisodeCommentView[]
}) {
  const episodeId = show.episodeId
  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(show.likes ?? 0)
  const [comments, setComments] = useState<EpisodeCommentView[]>(initialComments)
  const [draft, setDraft] = useState("")
  const [shared, setShared] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (!episodeId) return null

  function toggleLike() {
    if (!currentUser) return
    const next = !liked
    setLiked(next)
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)))
    startTransition(async () => {
      await setEpisodeLike({ episodeId: episodeId!, liked: next })
    })
  }

  function submitComment(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !currentUser) return
    setDraft("")
    startTransition(async () => {
      await addEpisodeComment({ episodeId: episodeId!, text })
      setComments(await getEpisodeComments(episodeId!))
    })
  }

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : ""
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: `${show.title} on Frequency`, text: show.tagline, url })
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
      }
    } catch {
      // user dismissed the share sheet — ignore
    }
    setShared(true)
    setTimeout(() => setShared(false), 2000)
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4">
      {/* Action bar */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleLike}
          disabled={!currentUser}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50",
            liked ? "text-live" : "text-foreground",
          )}
          aria-pressed={liked}
          aria-label="Like episode"
        >
          <Heart className={cn("size-5", liked && "fill-current")} />
          {likes > 0 && <span className="tabular-nums">{likes}</span>}
        </button>

        <span className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-foreground">
          <MessageCircle className="size-5" />
          {comments.length > 0 && <span className="tabular-nums">{comments.length}</span>}
        </span>

        <button
          onClick={share}
          className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          aria-label="Share episode"
        >
          {shared ? <Check className="size-5 text-live" /> : <Share2 className="size-5" />}
          {shared ? "Copied" : "Share"}
        </button>
      </div>

      {/* Composer */}
      {currentUser ? (
        <form onSubmit={submitComment} className="flex items-center gap-2">
          <Avatar className="size-8">
            <AvatarImage src={currentUser.image || undefined} alt="" />
            <AvatarFallback style={{ backgroundColor: currentUser.color }} className="text-xs text-white">
              {currentUser.initials}
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
        <p className="text-sm text-muted-foreground">
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>{" "}
          to like and comment.
        </p>
      )}

      {/* Comments */}
      {comments.length > 0 && (
        <ul className="space-y-3 pt-1">
          {comments.map((c) => (
            <EpisodeCommentRow key={c.id} comment={c} canLike={Boolean(currentUser)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function EpisodeCommentRow({ comment, canLike }: { comment: EpisodeCommentView; canLike: boolean }) {
  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(comment.likes)
  const [, startTransition] = useTransition()

  function toggle() {
    if (!canLike) return
    const next = !liked
    setLiked(next)
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)))
    startTransition(async () => {
      await setEpisodeCommentLike({ commentId: comment.id, liked: next })
    })
  }

  return (
    <li className="flex gap-2.5">
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={comment.authorImage || undefined} alt="" />
        <AvatarFallback style={{ backgroundColor: comment.color }} className="text-xs text-white">
          {comment.initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-sm bg-secondary px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{comment.user}</span>
            <span className="text-xs text-muted-foreground">{comment.postedAt}</span>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">{comment.text}</p>
        </div>
        <button
          onClick={toggle}
          disabled={!canLike}
          className={cn(
            "mt-1 flex items-center gap-1 px-3 text-xs font-medium transition-colors disabled:opacity-50",
            liked ? "text-live" : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={liked}
          aria-label="Like comment"
        >
          <Heart className={cn("size-3.5", liked && "fill-current")} />
          {likes > 0 && <span className="tabular-nums">{likes}</span>}
          {likes === 0 && "Like"}
        </button>
      </div>
    </li>
  )
}
