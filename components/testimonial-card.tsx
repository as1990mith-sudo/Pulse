"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import { Share2, Star, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LikeHeart } from "@/components/like-heart"
import { CommentIcon } from "@/components/comment-icon"
import { ShareSheet } from "@/components/share-sheet"
import { PostCard } from "@/components/mind-feed"
import { setPostLike, type FeedPostView } from "@/app/actions/feed"
import { haptic } from "@/lib/haptics"
import type { CurrentUser } from "@/lib/session"
import type { ShareTarget } from "@/lib/share-types"
import { cn } from "@/lib/utils"

// Colorful-but-dark gradient washes for the testimony tiles. Each keeps a deep,
// low-luminance base so white text stays fully legible while the grid reads
// vibrant and editorial rather than flat black. A tile picks one deterministically
// from its post id (see hashToIndex) so a given testimony always looks the same
// and neighbours stay varied.
const TILE_GRADIENTS = [
  "bg-gradient-to-br from-orange-500/25 via-card to-rose-500/20",
  "bg-gradient-to-br from-violet-500/25 via-card to-indigo-500/20",
  "bg-gradient-to-br from-emerald-500/25 via-card to-teal-500/20",
  "bg-gradient-to-br from-sky-500/25 via-card to-blue-500/20",
  "bg-gradient-to-br from-amber-500/25 via-card to-orange-500/20",
  "bg-gradient-to-br from-fuchsia-500/25 via-card to-purple-500/20",
  "bg-gradient-to-br from-rose-500/25 via-card to-pink-500/20",
  "bg-gradient-to-br from-cyan-500/25 via-card to-emerald-500/20",
]

/** Stable, well-distributed index from a string key (djb2-ish). */
function hashToIndex(key: string, mod: number) {
  let h = 5381
  for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) >>> 0
  return h % mod
}

/**
 * A row of five stars rendering an integer 1–5 rating in Frequency's gold/orange
 * accent. Filled stars up to `value`; the rest sit muted. Compact by default so
 * it can live in a tile header without overpowering the testimony text.
 */
function StarRating({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="flex items-center gap-0.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={cn("size-3.5", n <= value ? "fill-primary text-primary" : "text-white/25")}
          />
        ))}
      </div>
      <span className="text-xs font-semibold tabular-nums text-primary">{value}/5</span>
      <span className="sr-only">{`Rated ${value} out of 5 stars`}</span>
    </div>
  )
}

/**
 * A single testimonial tile for the iTestify two-column grid. It is deliberately
 * NOT the Instagram-style PostCard: the testimony TEXT is the primary content,
 * shown up front alongside the author, date and star rating so the whole story
 * reads at a glance without opening anything.
 *
 * Like / comment / share live directly on the tile and reuse the app's existing
 * systems — `setPostLike`, the shared `CommentSheet` (via the detail view) and
 * `ShareSheet` — so this introduces no parallel interaction model. Tapping the
 * body (or "Read more") opens the full testimony in the existing `PostCard`,
 * which carries comments, sharing and any media.
 */
export function TestimonialCard({
  post,
  currentUser,
  allPosts,
  onChanged,
}: {
  post: FeedPostView
  currentUser: CurrentUser
  /** Sibling testimonies, forwarded to the detail view's immersive video viewer. */
  allPosts: FeedPostView[]
  /** Called after a like settles so the parent can revalidate its SWR list. */
  onChanged: () => void
}) {
  const [liked, setLiked] = useState(post.liked)
  const [likes, setLikes] = useState(post.likes)
  const [shareOpen, setShareOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  // Whether the detail view should auto-open the comment sheet (i.e. the tile's
  // Comment button was the trigger, not a plain body tap).
  const [detailComments, setDetailComments] = useState(false)
  const [, startTransition] = useTransition()

  // Measure whether the clamped text actually overflows, so "Read more" only
  // appears when there is more to read.
  const textRef = useRef<HTMLParagraphElement>(null)
  const [clamped, setClamped] = useState(false)
  useEffect(() => {
    const el = textRef.current
    if (!el) return
    setClamped(el.scrollHeight - el.clientHeight > 2)
  }, [post.text])

  function toggleLike() {
    if (!currentUser) return
    const next = !liked
    setLiked(next)
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)))
    if (next) haptic("light")
    startTransition(async () => {
      try {
        await setPostLike({ postId: post.id, liked: next })
        onChanged()
      } catch {
        // Roll back on failure so the count can't drift from the server.
        setLiked(!next)
        setLikes((n) => Math.max(0, n + (next ? -1 : 1)))
      }
    })
  }

  function openDetail(withComments = false) {
    setDetailComments(withComments)
    setDetailOpen(true)
  }

  const shareTarget: ShareTarget = {
    type: "post",
    key: String(post.id),
    title: `${post.user} on Frequency`,
    subtitle: post.text ? post.text.slice(0, 120) : null,
    url: `/feed?post=${post.id}`,
  }

  const rating = typeof post.rating === "number" ? post.rating : null
  const commentCount = post.comments.length
  const gradient = TILE_GRADIENTS[hashToIndex(String(post.id), TILE_GRADIENTS.length)]

  return (
    <>
      <article
        className={cn(
          "flex h-full flex-col rounded-2xl border border-white/10 p-3.5 font-display text-white shadow-sm transition-colors hover:border-white/20 sm:p-4",
          gradient,
        )}
      >
        {/* Author + date */}
        <header className="flex items-center gap-2.5">
          <Avatar className="size-8 shrink-0">
            {post.authorImage && <AvatarImage src={post.authorImage || "/placeholder.svg"} alt="" />}
            <AvatarFallback className={cn("text-xs", post.color)}>{post.initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{post.user}</p>
            <p className="truncate text-xs text-white/60">{post.postedAt}</p>
          </div>
        </header>

        {/* Star rating — omitted entirely for legacy testimonies with no rating. */}
        {rating != null && <StarRating value={rating} className="mt-2.5" />}

        {/* Testimony text — the primary content. Clamped to keep the grid tidy,
            with an in-place "Read more" that opens the full detail view. */}
        <button
          type="button"
          onClick={() => openDetail(false)}
          className="mt-2 flex-1 text-left"
          aria-label="Open testimony"
        >
          <p ref={textRef} className="whitespace-pre-wrap text-pretty text-sm leading-relaxed line-clamp-6">
            {post.text}
          </p>
          {clamped && <span className="mt-1 inline-block text-xs font-medium text-primary">Read more</span>}
        </button>

        {/* Interaction row — like / comment / share, directly on the tile. */}
        <div className="mt-3 flex items-center gap-1 border-t border-white/10 pt-2.5 text-white/70">
          <button
            type="button"
            onClick={toggleLike}
            className="flex items-center gap-1.5 rounded-full py-1 pr-2 text-xs font-medium transition-colors hover:text-white"
            aria-pressed={liked}
            aria-label={liked ? "Unlike" : "Like"}
          >
            <LikeHeart liked={liked} className="size-[18px]" />
            {likes > 0 && <span className="tabular-nums">{likes}</span>}
          </button>

          <button
            type="button"
            onClick={() => openDetail(true)}
            className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors hover:text-white"
            aria-label="Comment"
          >
            <CommentIcon className="size-[18px]" strokeWidth={2} />
            {commentCount > 0 && <span className="tabular-nums">{commentCount}</span>}
          </button>

          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="ml-auto flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors hover:text-white"
            aria-label="Share"
          >
            <Share2 className="size-[18px]" strokeWidth={2} />
          </button>
        </div>
      </article>

      <ShareSheet
        target={shareTarget}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />

      {detailOpen && (
        <TestimonialDetail
          post={post}
          currentUser={currentUser}
          allPosts={allPosts}
          rating={rating}
          wantComments={detailComments}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </>
  )
}

/**
 * Full-testimony overlay. Renders the star rating (the one thing PostCard has no
 * concept of) as a header, then the existing PostCard for the rest — so likes,
 * comments, sharing and any media all reuse the app's established behaviour with
 * zero duplication.
 */
function TestimonialDetail({
  post,
  currentUser,
  allPosts,
  rating,
  wantComments,
  onClose,
}: {
  post: FeedPostView
  currentUser: CurrentUser
  allPosts: FeedPostView[]
  rating: number | null
  wantComments: boolean
  onClose: () => void
}) {
  // PostCard's `openCommentsSignal` ignores its value on mount and only reacts
  // to a CHANGE, so we start at 0 and bump it once after mount when the Comment
  // button was the trigger — that genuine change opens the shared comment sheet.
  const [commentsSignal, setCommentsSignal] = useState(0)
  useEffect(() => {
    if (!wantComments) return
    const id = window.setTimeout(() => setCommentsSignal(1), 60)
    return () => window.clearTimeout(id)
  }, [wantComments])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  if (typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain p-4 sm:p-6" role="dialog" aria-modal="true">
      <button className="fixed inset-0 bg-background/85 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 my-auto w-full max-w-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Testimony</h2>
          <button
            onClick={onClose}
            className="rounded-full bg-card/80 p-2 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-2xl">
          {rating != null && (
            <div className="border-b border-border/50 px-4 pt-4">
              <StarRating value={rating} />
            </div>
          )}
          <PostCard
            post={post}
            currentUser={currentUser}
            variant="card"
            videoFeedPosts={allPosts}
            openCommentsSignal={commentsSignal}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
