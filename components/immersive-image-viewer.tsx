"use client"

import { useEffect, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { X, Heart, Bookmark, Share2, ChevronLeft, ChevronRight } from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import { CommentSheet } from "@/components/comment-sheet"
import { ShareSheet } from "@/components/share-sheet"
import { addPostComment, setPostLike, setCommentLike, type FeedPostView } from "@/app/actions/feed"
import { toggleSaveItem } from "@/app/actions/share"
import type { ThreadComment } from "@/components/comment-thread"
import type { CurrentUser } from "@/lib/session"
import type { ShareTarget } from "@/lib/share-types"
import { haptic } from "@/lib/haptics"
import { renderMessageBody } from "@/lib/rich-text"
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
  const [index, setIndex] = useState(startIndex)
  const [liked, setLiked] = useState(post.liked)
  const [likes, setLikes] = useState(post.likes)
  const [saved, setSaved] = useState(post.saved)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [, startTransition] = useTransition()

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

  function toggleLike() {
    if (!currentUser || post.isSelf) return
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
    if (!currentUser || post.isSelf) return
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

  async function submitComment(text: string) {
    if (!currentUser) return
    await addPostComment({ postId: post.id, text })
    router.refresh()
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

  const threadComments = post.comments as unknown as ThreadComment[]
  const commentCount = post.comments?.length ?? 0

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Image posted by ${post.user}`}
      className="fixed inset-0 z-[70] flex flex-col bg-black"
    >
      {/* Top bar: close only. The creator identity now lives bottom-left to match
          the Reels viewer. */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-end bg-gradient-to-b from-black/60 to-transparent px-4 pb-8 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Image stage — natural aspect ratio, letterboxed on the black backdrop. */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
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
                onClick={() => setIndex((i) => i - 1)}
                aria-label="Previous image"
                className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/70"
              >
                <ChevronLeft className="size-6" />
              </button>
            )}
            {index < images.length - 1 && (
              <button
                type="button"
                onClick={() => setIndex((i) => i + 1)}
                aria-label="Next image"
                className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/70"
              >
                <ChevronRight className="size-6" />
              </button>
            )}
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
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

      {/* Action rail (right side), consistent with the reels layout. */}
      <div className="absolute bottom-24 right-3 z-20 flex flex-col items-center gap-5">
        <RailButton
          onClick={toggleLike}
          label={liked ? "Unlike" : "Like"}
          count={likes}
          active={liked}
          disabled={post.isSelf}
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
          disabled={post.isSelf}
        >
          <Bookmark className={cn("size-7", saved && "fill-current")} />
        </RailButton>
      </div>

      {/* Author + caption, bottom-left — mirrors the Reels viewer (position,
          avatar size, and font sizes) so the creator identity is consistent
          across both viewers. `pr-24` keeps the block clear of the action rail. */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent px-4 pb-8 pt-12 pr-24 text-white">
        <Link href={`/u/${post.authorId}`} onClick={onClose} className="flex min-w-0 items-center gap-2.5">
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

        {/* Caption. Rendered with the shared rich-text renderer (not raw text) so
            mention tokens like `@[Name](id)`, bold/italic markers, and links match
            exactly what the feed shows instead of leaking the raw markup. Shown in
            full (no line-clamp / "Read more") — a long caption scrolls within a
            capped height so it never covers the whole image. */}
        {post.text && (
          <p className="mt-2 max-h-[40vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-white/90">
            {renderMessageBody(post.text, {
              link: true,
              linkClassName: "font-medium text-white underline-offset-2 [overflow-wrap:anywhere] hover:underline",
              mentionClassName: "font-semibold text-white hover:underline",
            })}
          </p>
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
        onSubmit={submitComment}
        onLike={(commentId, isLiked) => void setCommentLike({ commentId, liked: isLiked })}
        onReply={async (parentId, text) => {
          await addPostComment({ postId: post.id, text, parentId })
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
