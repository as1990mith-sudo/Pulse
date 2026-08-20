"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import useSWR from "swr"
import { ArrowLeft, ChevronDown, Loader2, Send, Share2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ShareSheet } from "@/components/share-sheet"
import type { ShareTarget } from "@/lib/share-types"
import { linkify } from "@/lib/linkify"
import { cn } from "@/lib/utils"
import {
  addCommunityComment,
  deleteCommunityComment,
  editCommunityComment,
  getCommunityComments,
  setCommunityCommentLike,
  type CommunityCommentView,
  type CommunityPostView,
} from "@/app/actions/community"
import { CommentThread, type ThreadComment } from "@/components/comment-thread"
import { FeedVideo } from "@/components/feed-video"
import { setImmersiveViewerOpen } from "@/lib/video-handoff"
import { useMiniChat } from "@/components/mini-chat"
import { BibleChips, FeedPostImage, LikeButton, PostIdentity, SaveButton, ANON_AVATAR } from "@/components/community-help-shared"

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

/* -------------------------------------------------------------------------- */
/*  Reply composer (sticky bottom)                                            */
/* -------------------------------------------------------------------------- */

function ReplyComposer({ onSubmit }: { onSubmit: (text: string) => Promise<void> }) {
  const [value, setValue] = useState("")
  const [sending, setSending] = useState(false)

  async function submit() {
    const text = value.trim()
    if (!text || sending) return
    setSending(true)
    try {
      await onSubmit(text)
      setValue("")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-border/60 bg-background/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Enter submits; Shift+Enter is a newline. Respect IME composition.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault()
            void submit()
          }
        }}
        rows={1}
        maxLength={1000}
        placeholder="Share your wisdom…"
        className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl px-4 py-2.5 text-[15px]"
      />
      <Button
        type="button"
        size="icon"
        onClick={submit}
        disabled={sending || !value.trim()}
        className="size-11 shrink-0 rounded-full"
        aria-label="Post reply"
      >
        {sending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
      </Button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Related questions                                                         */
/* -------------------------------------------------------------------------- */

function RelatedQuestions({ posts, onOpen }: { posts: CommunityPostView[]; onOpen: (p: CommunityPostView) => void }) {
  const [open, setOpen] = useState(false)
  if (posts.length === 0) return null
  return (
    <section className="mt-8 border-t border-border/60 px-4 pt-6 sm:px-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-3 flex w-full items-center justify-between gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>More</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform duration-300", open ? "rotate-180" : "rotate-0")} />
      </button>
      <ul className={cn("space-y-1", !open && "hidden")}>
        {posts.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onOpen(p)}
              className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left transition-colors hover:bg-secondary/40"
            >
              <img
                src={ANON_AVATAR || "/placeholder.svg"}
                alt=""
                className="size-9 shrink-0 rounded-full ring-2 ring-border/70"
              />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[15px] leading-snug text-foreground text-pretty">
                  {p.body || (p.imageUrl ? "Shared a photo" : "")}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {p.commentCount > 0
                    ? `${p.commentCount} ${p.commentCount === 1 ? "reply" : "replies"}`
                    : "No replies yet"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Conversation screen                                                       */
/* -------------------------------------------------------------------------- */

export function CommunityConversation({
  post,
  related,
  onClose,
  onOpenRelated,
  onCountChange,
}: {
  post: CommunityPostView
  related: CommunityPostView[]
  onClose: () => void
  onOpenRelated: (p: CommunityPostView) => void
  onCountChange: (postId: number, delta: number) => void
}) {
  const [shareOpen, setShareOpen] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { openProfile } = useMiniChat()

  const { data: comments = [], mutate } = useSWR(["community-comments", post.id], () => getCommunityComments(post.id))

  // Lock background scroll + close on Escape while the conversation is open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  // Reset scroll to the top whenever we navigate to a different question.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [post.id])

  // While this overlay is open it owns video playback. Raise the shared
  // immersive-viewer flag so the inline feed clip behind it pauses instead of
  // playing on in the background; the overlay's own player opts out of the gate
  // and resumes from where the preview left off. Lower the flag on close.
  useEffect(() => {
    setImmersiveViewerOpen(true)
    return () => setImmersiveViewerOpen(false)
  }, [])

  if (typeof document === "undefined") return null

  const replyCount = comments.length
  const shareTarget: ShareTarget = {
    type: "community",
    key: String(post.id),
    title: "A question on Community Help",
    subtitle: post.body.length > 120 ? `${post.body.slice(0, 120)}…` : post.body,
    url: `/chatrooms/community?q=${post.id}`,
    image: null,
    downloadUrl: null,
    downloadKind: null,
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background duration-300 animate-in slide-in-from-right"
      role="dialog"
      aria-modal="true"
      aria-label="Conversation"
    >
      {/* Top bar */}
      <header className="flex items-center gap-2 border-b border-border/60 bg-background/95 px-2 py-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] backdrop-blur sm:px-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="flex-1 text-base font-bold tracking-tight">Conversation</h1>
        <LikeButton postId={post.id} initialLikes={post.likes} initialLiked={post.liked} variant="icon" />
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Share"
        >
          <Share2 className="size-5" />
        </button>
        <SaveButton postId={post.id} variant="icon" />
      </header>

      {/* Scrollable conversation body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-smooth overscroll-contain">
        {/* Anonymous question */}
        <div className="px-4 pt-5 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <PostIdentity post={post} edited={post.edited} size="lg" onAuthorClick={openProfile} />
          </div>
          {post.body && (
            <p className="mt-2 whitespace-pre-wrap break-words text-[17px] leading-relaxed text-foreground text-pretty">
              {linkify(post.body)}
            </p>
          )}
          {post.imageUrl && (
            <FeedPostImage src={post.imageUrl} onClick={() => setLightboxOpen(true)} className="mt-4" />
          )}
          {post.videoUrl && <PostVideo src={post.videoUrl} />}
          <BibleChips text={post.body} className="mt-4" />

          <div className="mt-5 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="tabular-nums">
              {replyCount > 0 ? `${replyCount} ${replyCount === 1 ? "reply" : "replies"}` : "No replies yet"}
            </span>
          </div>
        </div>

        {/* Connector line bridging the question into the replies (Threads-style) */}
        {replyCount > 0 && <div className="ml-[2.35rem] h-5 w-px bg-border/70 sm:ml-[3.1rem]" aria-hidden />}

        {/* Replies — real, non-anonymous Frequency identities */}
        <div className="px-4 pb-6 sm:px-6">
          {replyCount === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-base font-semibold text-foreground">Be the first to respond</p>
              <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                Offer encouragement, scripture, or a kind word. Your reply appears with your name and photo.
              </p>
            </div>
          ) : (
            <CommentThread
              comments={comments.map(toThreadComment)}
              canInteract
              density="comfortable"
              enforceDeleteWindow={false}
              onAuthorClick={openProfile}
              onLike={(commentId, liked) => void setCommunityCommentLike({ commentId, liked })}
              onReply={async (parentId, value) => {
                const created = await addCommunityComment({ postId: post.id, body: value, parentId })
                onCountChange(post.id, 1)
                await mutate((prev) => [...(prev ?? []), created], { revalidate: false })
              }}
              onEdit={async (commentId, value) => {
                await editCommunityComment({ commentId, body: value })
                await mutate()
              }}
              onDelete={async (commentId) => {
                await deleteCommunityComment(commentId)
                onCountChange(post.id, -1)
                await mutate((prev) => (prev ?? []).filter((c) => c.id !== commentId), { revalidate: false })
              }}
            />
          )}
        </div>

        <RelatedQuestions posts={related} onOpen={onOpenRelated} />
        <div className="h-6" />
      </div>

      {/* Sticky reply composer */}
      <ReplyComposer
        onSubmit={async (text) => {
          const created = await addCommunityComment({ postId: post.id, body: text })
          onCountChange(post.id, 1)
          await mutate((prev) => [...(prev ?? []), created], { revalidate: false })
        }}
      />

      <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />

      {lightboxOpen && post.imageUrl && (
        <ImageLightbox src={post.imageUrl} onClose={() => setLightboxOpen(false)} />
      )}
    </div>,
    document.body,
  )
}

/* -------------------------------------------------------------------------- */
/*  Full-screen image lightbox                                                */
/* -------------------------------------------------------------------------- */

/**
 * Minimal full-screen viewer for a single attached image. Shows the image at
 * its natural aspect ratio (object-contain) on a black backdrop; tapping the
 * backdrop or the close button dismisses it. Rendered in its own portal so it
 * sits above the conversation dialog.
 */
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Attached image"
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black duration-200 animate-in fade-in"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-10 flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
      >
        <X className="size-5" />
      </button>
      <img
        src={src || "/placeholder.svg"}
        alt="Attached to the question"
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full object-contain"
      />
    </div>,
    document.body,
  )
}

/* -------------------------------------------------------------------------- */
/*  Inline video player                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Plays an attached video inline using the same custom player as the main feed
 * (FeedVideo) — branded play button, tap-to-play/pause, ±10s skip, draggable
 * scrubber and shared mute — instead of the browser's native fullscreen
 * controls. Because it plays in place, the conversation's header actions and the
 * Reply / Share / Save / Like buttons stay visible while the clip plays.
 *
 * The frame sizes itself to the clip's real aspect ratio once known (clamped to
 * a sensible portrait↔landscape range) so vertical and horizontal videos both
 * sit naturally in the thread.
 */
function PostVideo({ src }: { src: string }) {
  const [ratio, setRatio] = useState<number | null>(null)
  // Tapping the inline clip opens a full-screen viewer with the premium player.
  const [fullscreen, setFullscreen] = useState(false)
  // Clamp between 9:16 and 16:9 so an extreme clip can't create a giant frame.
  const aspect = ratio ? Math.min(16 / 9, Math.max(9 / 16, ratio)) : 4 / 5
  return (
    <div
      className="relative mt-4 w-full overflow-hidden rounded-2xl border border-border/60 bg-black"
      style={{ aspectRatio: String(aspect), maxHeight: "24rem" }}
    >
      {/* While the full-screen viewer is open the inline clip is unmounted so
          only one <video> plays. Both instances share a playback position by
          `src`, so remounting with `resume` on close continues seamlessly. */}
      {!fullscreen && (
        <FeedVideo
          src={src}
          className="h-full w-full object-cover"
          onAspectRatio={setRatio}
          resume
          ignoreViewerGate
          onExpand={() => setFullscreen(true)}
        />
      )}
      {fullscreen && <VideoLightbox src={src} onClose={() => setFullscreen(false)} />}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Full-screen video viewer                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Full-screen viewer for an attached video. Renders the shared FeedVideo player
 * (branded play button, ±10s skip, draggable scrubber, shared mute) letterboxed
 * with object-contain on a black backdrop, so the clip fills the screen while
 * keeping its true aspect ratio. Tapping the video toggles play/pause; the
 * backdrop, close button, or Escape dismisses it. Rendered in its own portal so
 * it sits above the conversation dialog.
 *
 * `resume` continues from wherever the inline preview reached (shared by src),
 * and `ignoreViewerGate` lets this player own playback while the conversation's
 * immersive-viewer gate is active.
 */
function VideoLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Attached video"
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black duration-200 animate-in fade-in"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-10 flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
      >
        <X className="size-5" />
      </button>
      {/* Stop backdrop clicks so tapping the video toggles play instead of closing. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative h-full max-h-[100dvh] w-full max-w-[100vw]"
      >
        <FeedVideo src={src} className="h-full w-full object-contain" resume ignoreViewerGate />
      </div>
    </div>,
    document.body,
  )
}
