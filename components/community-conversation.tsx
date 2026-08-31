"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import useSWR from "swr"
import { ArrowLeft, ChevronDown, Loader2, Send, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ShareSheet } from "@/components/share-sheet"
import { HomeVoiceSwitch } from "@/components/home-voice-switch"
import { useHomeVoice } from "@/lib/use-home-voice"
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
import { CommunityMediaViewer } from "@/components/community-media-viewer"
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
    // Carries the verified tick when the reply speaks for an organisation.
    orgVerified: c.orgVerified,
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

function ReplyComposer({ onSubmit }: { onSubmit: (text: string, asHome?: boolean) => Promise<void> }) {
  const [value, setValue] = useState("")
  const [sending, setSending] = useState(false)
  // Admins of the active Home may answer as the organisation. Null for everyone
  // else, which renders nothing — ordinary members never see an inert control.
  const homeVoice = useHomeVoice()
  // Default to the Home's voice when one is available, matching the main feed's
  // composer so an admin's reply doesn't silently go out under their own name.
  const [asHome, setAsHome] = useState(true)

  async function submit() {
    const text = value.trim()
    if (!text || sending) return
    setSending(true)
    try {
      await onSubmit(text, homeVoice ? asHome : undefined)
      setValue("")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="border-t border-border/60 bg-background/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
      {/* Community doesn't load the viewer's profile (it's a signed-in-only
          surface that never needed one), so the personal option is labelled
          "You" — the same fallback the shared comment sheet uses. */}
      <HomeVoiceSwitch voice={homeVoice} asHome={asHome} onChange={setAsHome} personalName="You" size="sm" />
      <div className="flex items-end gap-2">
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
  // This thread first, then its related questions — the order the full-screen
  // viewer swipes through, so the clip that was tapped is always slide one.
  const mediaStack = useMemo(() => [post, ...related.filter((r) => r.id !== post.id)], [post, related])
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
    title: "A question on Community",
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
            <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground text-pretty">
              {linkify(post.body)}
            </p>
          )}
          {post.imageUrl && (
            <FeedPostImage src={post.imageUrl} onClick={() => setLightboxOpen(true)} className="mt-4" />
          )}
          {post.videoUrl && (
            <PostVideo
              src={post.videoUrl}
              post={post}
              siblings={mediaStack}
              onAuthorClick={openProfile}
              onCountChange={onCountChange}
            />
          )}
          <BibleChips text={post.body} className="mt-4" />

          <div className="mt-5 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="tabular-nums">
              {replyCount > 0 ? `${replyCount} ${replyCount === 1 ? "reply" : "replies"}` : "No replies yet"}
            </span>
          </div>
        </div>

        {/* Connector line bridging the question into the replies (Threads-style) */}
        {replyCount > 0 && <div className="ml-[2.35rem] h-5 w-px bg-border/70 sm:ml-[3.1rem]" aria-hidden />}

        {/* Replies — real, non-anonymous Frequency identities.
            `data-comments` marks the scroll target used when the reader taps the
            Comment button in the full-screen media viewer: that closes the
            overlay onto this thread, and landing on the question header would
            leave the replies below the fold, making the tap look like it did
            nothing. */}
        <div data-comments className="px-4 pb-6 sm:px-6">
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
              onReply={async (parentId, value, asHome) => {
                const created = await addCommunityComment({
                  postId: post.id,
                  body: value,
                  parentId,
                  asOrganization: asHome,
                })
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
        onSubmit={async (text, asHome) => {
          const created = await addCommunityComment({ postId: post.id, body: text, asOrganization: asHome })
          onCountChange(post.id, 1)
          await mutate((prev) => [...(prev ?? []), created], { revalidate: false })
        }}
      />

      <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />

      {lightboxOpen && post.imageUrl && (
        <CommunityMediaViewer
          kind="image"
          posts={mediaStack}
          startId={post.id}
          onClose={() => setLightboxOpen(false)}
          // The viewer now stacks the comment sheet over the photo itself, so
          // Comment no longer dismisses the lightbox to scroll the thread.
          onAuthorClick={openProfile}
          // Replies sent from that stacked sheet patch this thread's count.
          // The comment actions no longer revalidate /chatrooms (doing so tore
          // down the route and closed this lightbox mid-send).
          onCountChange={onCountChange}
        />
      )}
    </div>,
    document.body,
  )
}

/* The bespoke full-screen image lightbox that used to live here was replaced by
   the shared `CommunityMediaViewer`, so photos and videos in Community now carry
   the same chrome and actions as the main feed's viewers. */

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
function PostVideo({
  src,
  post,
  siblings,
  onAuthorClick,
  onCountChange,
}: {
  src: string
  post: CommunityPostView
  /** This thread plus its related questions, so full screen can swipe clips. */
  siblings: CommunityPostView[]
  onAuthorClick?: (authorId: string) => void
  /** Patches reply counts for replies sent from inside full screen. */
  onCountChange?: (postId: number, delta: number) => void
}) {
  const [ratio, setRatio] = useState<number | null>(null)
  // Tapping the inline clip opens a full-screen viewer with the premium player.
  const [fullscreen, setFullscreen] = useState(false)
  // Same card rule as the feed: a 1:1 or 16:9 clip keeps its own ratio; anything
  // else (portrait 9:16, 4:5, or any other crop) is presented in a uniform 4:5
  // card and object-cover-filled. The true ratio is revealed full screen.
  const isStandard = ratio != null && [1, 16 / 9].some((a) => Math.abs(ratio - a) < 0.02)
  const aspect = isStandard ? (ratio as number) : 4 / 5
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
      {fullscreen && (
        <CommunityMediaViewer
          kind="video"
          posts={siblings}
          startId={post.id}
          onClose={() => setFullscreen(false)}
          // Comments are a sheet over the clip now, so watching and replying no
          // longer trade off against each other.
          onAuthorClick={onAuthorClick}
          onCountChange={onCountChange}
        />
      )}
    </div>
  )
}


