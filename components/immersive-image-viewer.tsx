"use client"

import { useEffect, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { X, Heart, Bookmark, Share2, ChevronLeft, ChevronRight } from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import { MediaCaption } from "@/components/media-caption"
import { CommentSheet } from "@/components/comment-sheet"
import { ShareSheet } from "@/components/share-sheet"
import {
  addPostComment,
  deletePostComment,
  editPostComment,
  setPostLike,
  setCommentLike,
  type FeedCommentView,
  type FeedPostView,
} from "@/app/actions/feed"
import { toggleSaveItem } from "@/app/actions/share"
import { toThreadComment, makeOptimisticComment } from "@/lib/feed-comment-view"
import { useHomeVoice } from "@/lib/use-home-voice"
import type { CurrentUser } from "@/lib/session"
import type { ShareTarget } from "@/lib/share-types"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

/**
 * Full-screen, natural-aspect-ratio image viewer opened by tapping a portrait
 * image in the feed. Unlike the contained feed preview, this respects the image's
 * true aspect (a 9:16 image fills the screen as 9:16). Carries the full post
 * action set — like, comment, share, save, and a link to the creator's profile.
 *
 * When the post has multiple images the viewer lets the user page through them
 * (arrows + swipe), while videos are handled by the immersive Reels viewer.
 */
export function ImmersiveImageViewer({
  post,
  images,
  startIndex = 0,
  currentUser,
  onClose,
}: {
  post: FeedPostView
  /** The image URLs from the post, in order. */
  images: string[]
  startIndex?: number
  currentUser: CurrentUser | null
  onClose: () => void
}) {
  const router = useRouter()
  // Read from the shared SWR cache the feed already populates, so the expanded
  // view offers an admin the same identity choice as the inline comment box
  // rather than silently forcing every comment to their personal name.
  const homeVoice = useHomeVoice()
  const [index, setIndex] = useState(startIndex)
  const [liked, setLiked] = useState(post.liked)
  const [likes, setLikes] = useState(post.likes)
  const [saved, setSaved] = useState(post.saved)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [comments, setComments] = useState<FeedCommentView[]>(post.comments ?? [])
  const [shareOpen, setShareOpen] = useState(false)
  const [, startTransition] = useTransition()
  // Tap the image to fade ALL overlay chrome (author, caption, action rail,
  // close, paging) out for an unobstructed view; tap again to bring it back.
  const [chromeVisible, setChromeVisible] = useState(true)

  // Applied to every overlay layer. `pointer-events-none` while hidden matters:
  // without it the invisible rail would keep swallowing the tap meant to reveal
  // the chrome again, leaving the user stuck with no way back.
  const chromeCls = cn(
    "transition-opacity duration-300",
    chromeVisible ? "opacity-100" : "pointer-events-none opacity-0",
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(images.length - 1, i + 1))
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1))
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [onClose, images.length])

  // Adopt refreshed server comments while the viewer stays open, so a comment
  // added elsewhere (or by someone else) still shows up here.
  //
  // Optimistic rows carry negative ids and are kept only until the server list
  // actually contains them — matched on author + text, since the placeholder
  // never learns its real id. Without that check a just-sent comment would
  // briefly appear twice: once as the placeholder and once as the saved row.
  useEffect(() => {
    const server = post.comments ?? []
    setComments((prev) => {
      const pending = prev.filter(
        (c) => c.id < 0 && !server.some((s) => s.authorId === c.authorId && s.text === c.text),
      )
      return [...server, ...pending]
    })
  }, [post.comments])

  function toggleLike() {
    // Authors may like their own posts, matching the main feed.
    if (!currentUser) return
    const next = !liked
    setLiked(next)
    setLikes((n) => (next ? n + 1 : n - 1))
    if (next) haptic("light")
    startTransition(async () => {
      try {
        await setPostLike({ postId: post.id, liked: next })
      } catch {
        setLiked(!next)
        setLikes((n) => (next ? n - 1 : n + 1))
      }
    })
  }

  function toggleSave() {
    // Authors may save their own posts, matching the main feed.
    if (!currentUser) return
    const next = !saved
    setSaved(next)
    haptic(next ? "light" : "select")
    startTransition(async () => {
      try {
        const res = await toggleSaveItem(shareTarget)
        setSaved(res.saved)
      } catch {
        setSaved(!next)
      }
    })
  }

  /**
   * Adds a comment (or reply) and shows it immediately.
   *
   * The list is held locally rather than read straight off the `post` prop:
   * this viewer is portaled out of the feed, so a `router.refresh()` alone
   * cannot update the prop it was handed while it stays mounted — which is why
   * a new comment previously only turned up after a manual page refresh. We
   * insert optimistically, then still refresh so the rest of the feed (and the
   * comment count on the card behind) catches up.
   */
  async function addComment(text: string, asHome?: boolean, parentId: number | null = null) {
    if (!currentUser) return
    const optimistic = makeOptimisticComment({
      currentUser,
      text,
      parentId,
      voice: asHome && homeVoice ? homeVoice : null,
    })
    setComments((prev) => [...prev, optimistic])
    try {
      await addPostComment({ postId: post.id, text, parentId: parentId ?? undefined, asOrganization: asHome })
      router.refresh()
    } catch (err) {
      // Roll the placeholder back so the user sees the send genuinely failed
      // instead of a comment that looks saved but was never persisted.
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id))
      throw err
    }
  }

  const shareTarget: ShareTarget = {
    type: "post",
    key: String(post.id),
    title: `${post.user} on Frequency`,
    subtitle: post.text ? post.text.slice(0, 120) : null,
    url: `/feed?post=${post.id}`,
    image: images[index] ?? post.image ?? null,
    downloadUrl: images[index] ?? null,
    downloadKind: "image",
  }

  // Mapped through the shared adapter, NOT cast: FeedCommentView names these
  // fields `user`/`authorImage` while ThreadComment expects `name`/`image`, so
  // the previous structural cast typechecked but delivered undefined for both —
  // which is why avatars here fell back to initials while the inline comment
  // list (which maps properly) showed the real photo.
  const threadComments = comments.map(toThreadComment)
  const commentCount = comments.length

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Image posted by ${post.user}`}
      className="fixed inset-0 z-[70] flex flex-col bg-black"
    >
      {/* Top bar: close only. The creator identity now lives bottom-left to match
          the Reels viewer.
          `pointer-events-none` on the gradient itself is essential: it spans the
          full width over the image, so without it the bar would swallow taps
          meant for the stage and the fade toggle would only work in a thin strip.
          The close button re-enables pointer events for itself. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-end bg-gradient-to-b from-black/60 to-transparent px-4 pb-8 pt-[calc(env(safe-area-inset-top)+0.75rem)]",
          chromeCls,
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Image stage — natural aspect ratio, letterboxed on the black backdrop.
          Tapping anywhere on the stage toggles the overlay chrome. The paging
          controls inside it stop propagation so paging never fades the chrome. */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onClick={() => setChromeVisible((v) => !v)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[index] || "/placeholder.svg"}
          alt={
            images.length > 1
              ? `Image ${index + 1} of ${images.length} posted by ${post.user}`
              : `Image posted by ${post.user}`
          }
          className="max-h-full max-w-full object-contain"
        />

        {/* Multi-image paging. */}
        {images.length > 1 && (
          <>
            {index > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setIndex((i) => i - 1)
                }}
                aria-label="Previous image"
                className={cn(
                  "absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/70",
                  chromeCls,
                )}
              >
                <ChevronLeft className="size-6" />
              </button>
            )}
            {index < images.length - 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setIndex((i) => i + 1)
                }}
                aria-label="Next image"
                className={cn(
                  "absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/70",
                  chromeCls,
                )}
              >
                <ChevronRight className="size-6" />
              </button>
            )}
            <div className={cn("absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5", chromeCls)}>
              {images.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === index ? "w-4 bg-white" : "w-1.5 bg-white/50",
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Action rail (right side), sitting at the base like the Reels rail.
          Reels can use a plain `bottom-9` because its rail stacks on top of a
          bottom bar that already carries the safe-area padding. This viewer has
          no such bar, so the same 2.25rem is added *on top of* the inset —
          otherwise the bookmark would tuck under the home indicator.
          The caption block's `pr-24` keeps the text clear of the rail, so the
          two can share this vertical band without colliding. */}
      <div
        className={cn(
          "absolute bottom-[calc(env(safe-area-inset-bottom)+2.25rem)] right-3 z-20 flex flex-col items-center gap-5",
          chromeCls,
        )}
      >
        <RailButton
          onClick={toggleLike}
          label={liked ? "Unlike" : "Like"}
          count={likes}
          active={liked}
        >
          <Heart className={cn("size-7", liked && "fill-current text-red-500")} />
        </RailButton>
        <RailButton onClick={() => setCommentsOpen(true)} label="Comments" count={commentCount}>
          <CommentIcon className="size-7" />
        </RailButton>
        <RailButton onClick={() => setShareOpen(true)} label="Share" count={post.shares}>
          <Share2 className="size-7" />
        </RailButton>
        <RailButton
          onClick={toggleSave}
          label={saved ? "Saved" : "Save"}
          active={saved}
        >
          <Bookmark className={cn("size-7", saved && "fill-current")} />
        </RailButton>
      </div>

      {/* Author + caption, bottom-left — mirrors the Reels viewer (position,
          avatar size, and font sizes) so the creator identity is consistent
          across both viewers. `pr-24` keeps the block clear of the action rail. */}
      {/* Same pointer-events treatment as the top bar: the gradient is decorative
          and full-width, so it must not intercept stage taps. The author link and
          caption opt back in individually. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent px-4 pb-8 pt-12 pr-24 text-white",
          chromeCls,
        )}
      >
        <Link
          href={`/u/${post.authorId}`}
          onClick={onClose}
          className="pointer-events-auto inline-flex min-w-0 items-center gap-2.5"
        >
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold ring-2 ring-white/70",
              post.color,
            )}
          >
            {post.authorImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.authorImage || "/placeholder.svg"} alt={post.user} className="size-full object-cover" />
            ) : (
              post.initials
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold leading-tight drop-shadow">{post.user}</span>
            <span className="block truncate text-xs text-white/70">@{post.handle.replace(/^@/, "")}</span>
          </span>
        </Link>

        {/* Caption — the same component the Reels viewer uses, so the font size
            and the one-line collapse with an inline "… Read more" are identical
            across both viewers by construction. Expanded captions scroll within
            a capped height so a long one never covers the whole image. */}
        {post.text && (
          <MediaCaption text={post.text} className="pointer-events-auto max-h-[45vh] overflow-y-auto" />
        )}
      </div>

      <CommentSheet
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        count={commentCount}
        comments={threadComments}
        currentUser={
          currentUser
            ? {
                name: currentUser.name,
                initials: currentUser.initials,
                color: currentUser.color,
                image: currentUser.image ?? null,
              }
            : undefined
        }
        onSubmit={(text, asHome) => addComment(text, asHome)}
        homeVoice={homeVoice}
        onLike={(commentId, isLiked) => {
          // Reflect the tap locally too, so the heart and count stay correct if
          // the list is re-rendered before the next server refresh lands.
          setComments((prev) =>
            prev.map((c) =>
              c.id === commentId ? { ...c, liked: isLiked, likes: Math.max(0, c.likes + (isLiked ? 1 : -1)) } : c,
            ),
          )
          void setCommentLike({ commentId, liked: isLiked })
        }}
        onReply={(parentId, text, asHome) => addComment(text, asHome, parentId)}
        onEdit={async (commentId, text) => {
          setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, text, edited: true } : c)))
          await editPostComment({ commentId, text })
          router.refresh()
        }}
        onDelete={async (commentId) => {
          // Drop the comment and any direct replies, matching the feed card.
          setComments((prev) => prev.filter((c) => c.id !== commentId && c.parentId !== commentId))
          await deletePostComment(commentId)
          router.refresh()
        }}
      />

      {shareOpen && <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />}
    </div>,
    document.body,
  )
}

function RailButton({
  onClick,
  label,
  count,
  active,
  disabled,
  children,
}: {
  onClick: () => void
  label: string
  count?: number
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex flex-col items-center gap-1 text-white transition-transform hover:scale-110 disabled:opacity-60",
        active && "text-white",
      )}
    >
      <span className="drop-shadow">{children}</span>
      {typeof count === "number" && count > 0 && (
        <span className="text-xs font-semibold tabular-nums drop-shadow">{count}</span>
      )}
    </button>
  )
}
