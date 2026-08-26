"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import { X, Bookmark, Share2, Volume2, VolumeX } from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import { LikeHeart } from "@/components/like-heart"
import { FeedVideo } from "@/components/feed-video"
import { ShareSheet } from "@/components/share-sheet"
import { ANON_AVATAR, communityMediaIdentity, toggleSaved, useIsSaved } from "@/components/community-help-shared"
import { setCommunityPostLike, type CommunityPostView } from "@/app/actions/community"
import { setImmersiveViewerOpen } from "@/lib/video-handoff"
import { useSharedMute } from "@/lib/shared-mute"
import { useOverlayHistory } from "@/lib/navigation/use-overlay-history"
import { haptic } from "@/lib/haptics"
import type { ShareTarget } from "@/lib/share-types"
import { cn } from "@/lib/utils"

/**
 * Full-screen viewer for Community Help media, carrying the same design as the
 * main feed's immersive viewers: media letterboxed at its true aspect on black,
 * a right-hand action rail of icon + label buttons, and a bottom-left author row
 * over a legibility gradient.
 *
 * It is a separate component from the feed's `ReelsFeed` / `ImmersiveImageViewer`
 * rather than a reuse of them, because those are bound to `FeedPostView` and call
 * the `feed_post` server actions (`setPostLike`, `addPostComment`, …). Pointing
 * them at a Community post would send a `community_post` id to the wrong table.
 * The *design* is shared; the data layer deliberately is not.
 *
 * Two behaviours differ by medium, each matching its feed counterpart:
 *  - **video** swipes vertically between the other Community clips, and lets the
 *    player own taps (tap = play/pause) exactly as Reels does.
 *  - **image** is a single slide, and tapping fades the chrome for an unobstructed
 *    look — the behaviour of the feed's photo viewer. A Community post carries one
 *    `imageUrl`, so there is nothing to page through.
 */
export function CommunityMediaViewer({
  kind,
  posts,
  startId,
  onClose,
  onOpenComments,
  onAuthorClick,
}: {
  kind: "video" | "image"
  /** Candidate stack. For video, every clip in it becomes swipeable. */
  posts: CommunityPostView[]
  startId: number
  onClose: () => void
  /** Opens the post's conversation thread, where Community comments live. */
  onOpenComments?: (post: CommunityPostView) => void
  onAuthorClick?: (authorId: string) => void
}) {
  // Video browses its siblings; a photo stands alone (see the note above).
  const stack = useMemo(() => {
    if (kind === "image") {
      const only = posts.find((p) => p.id === startId)
      return only ? [only] : []
    }
    return posts.filter((p) => p.videoUrl)
  }, [kind, posts, startId])

  const startIndex = Math.max(
    0,
    stack.findIndex((p) => p.id === startId),
  )
  const [active, setActive] = useState(startIndex)
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Back / back-gesture dismisses the overlay instead of leaving the page.
  useOverlayHistory(true, onClose, "community-media")

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)

    // Pause any feed video behind the overlay (ref-counted, so it composes with
    // an already-open conversation gate).
    setImmersiveViewerOpen(true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
      setImmersiveViewerOpen(false)
    }
  }, [onClose])

  // Jump to the tapped clip before the first paint the user can see, so opening
  // the 5th video doesn't visibly scroll past the first four.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || startIndex === 0) return
    scroller.scrollTop = startIndex * scroller.clientHeight
  }, [startIndex])

  // Track the centred slide so only it mounts a player and shows its chrome.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || stack.length < 2) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const i = Number((entry.target as HTMLElement).dataset.index)
            if (!Number.isNaN(i)) setActive(i)
          }
        }
      },
      { root: scroller, threshold: 0.6 },
    )
    for (const el of scroller.querySelectorAll("[data-index]")) observer.observe(el)
    return () => observer.disconnect()
  }, [stack.length])

  if (typeof document === "undefined") return null
  if (stack.length === 0) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={kind === "video" ? "Attached video" : "Attached photo"}
      className="fixed inset-0 z-[70] bg-black duration-200 animate-in fade-in"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-20 flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
      >
        <X className="size-5" />
      </button>

      <div
        ref={scrollerRef}
        className={cn(
          "h-full overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          // Only a multi-clip stack scrolls; a single slide must not rubber-band.
          stack.length > 1 ? "snap-y snap-mandatory overflow-y-scroll" : "overflow-hidden",
        )}
      >
        {stack.map((post, i) => (
          <Slide
            key={post.id}
            post={post}
            index={i}
            kind={kind}
            active={i === active}
            onClose={onClose}
            onOpenComments={onOpenComments}
            onAuthorClick={onAuthorClick}
          />
        ))}
      </div>
    </div>,
    document.body,
  )
}

/* -------------------------------------------------------------------------- */
/*  One full-screen slide                                                     */
/* -------------------------------------------------------------------------- */

function Slide({
  post,
  index,
  kind,
  active,
  onClose,
  onOpenComments,
  onAuthorClick,
}: {
  post: CommunityPostView
  index: number
  kind: "video" | "image"
  active: boolean
  onClose: () => void
  onOpenComments?: (post: CommunityPostView) => void
  onAuthorClick?: (authorId: string) => void
}) {
  const [liked, setLiked] = useState(post.liked)
  const [likes, setLikes] = useState(post.likes)
  const [shareOpen, setShareOpen] = useState(false)
  const [, startTransition] = useTransition()
  const saved = useIsSaved(post.id)
  const [muted, setMuted] = useSharedMute()

  // Photos fade their chrome on tap (feed photo-viewer behaviour). Videos leave
  // taps to the player so tap = play/pause, as in Reels.
  const [chromeVisible, setChromeVisible] = useState(true)
  const chromeCls = cn(
    "transition-opacity duration-300",
    chromeVisible ? "opacity-100" : "pointer-events-none opacity-0",
    // A neighbouring slide's chrome must never bleed into this one mid-swipe.
    active ? "" : "pointer-events-none opacity-0",
  )

  const identity = communityMediaIdentity(post)

  // How far the bottom chrome sits above the screen edge. A video's player draws
  // its own control bar (seek + elapsed time) across the bottom ~2rem, so the
  // rail and author row have to clear that as well as the home indicator —
  // otherwise the avatar crowds the duration tracker. A photo has no such bar,
  // so it only needs the safe-area inset.
  const bottomClearance =
    kind === "video" ? "calc(env(safe-area-inset-bottom) + 4rem)" : "calc(env(safe-area-inset-bottom) + 2.25rem)"

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

  function toggleLike() {
    const next = !liked
    setLiked(next)
    setLikes((n) => (next ? n + 1 : n - 1))
    if (next) haptic("light")
    startTransition(async () => {
      try {
        await setCommunityPostLike({ postId: post.id, liked: next })
      } catch {
        // Roll back so the heart never lies about what the server stored.
        setLiked(!next)
        setLikes((n) => (next ? n - 1 : n + 1))
      }
    })
  }

  return (
    <div
      data-index={index}
      className="relative flex h-full w-full snap-start snap-always items-center justify-center overflow-hidden"
    >
      {kind === "video" ? (
        // Only the centred slide mounts a player, so exactly one <video> ever
        // plays. `resume` continues from where the inline preview reached and
        // `ignoreViewerGate` lets this player own playback while the overlay
        // holds the pause gate up for everything behind it.
        active && post.videoUrl ? (
          <FeedVideo
            src={post.videoUrl}
            className="h-full w-full object-contain"
            resume
            ignoreViewerGate
            // The rail below already carries a mute button driving the same
            // shared state, so the player's own would be a second control for
            // one setting sitting directly beneath the first.
            hideMuteControl
          />
        ) : null
      ) : post.imageUrl ? (
        <button
          type="button"
          onClick={() => setChromeVisible((v) => !v)}
          className="flex h-full w-full items-center justify-center"
          aria-label={chromeVisible ? "Hide details" : "Show details"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.imageUrl || "/placeholder.svg"}
            alt="Attached to the question"
            className="max-h-full max-w-full object-contain"
          />
        </button>
      ) : null}

      {/* Legibility gradient behind the author row and rail. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/80 to-transparent",
          chromeCls,
        )}
      />

      {/* Action rail. Reels can use a bare `bottom-9` because its rail stacks on
          a bottom bar that already carries the safe-area padding; this overlay
          has none, so `bottomClearance` adds that inset (plus the player's
          control bar on video) to keep the last item reachable. The author row's
          `pr-24` reserves this column so the two never overlap. */}
      <div
        className={cn("absolute right-3 z-[3] flex flex-col items-center gap-5 text-white", chromeCls)}
        style={{ bottom: bottomClearance }}
        data-no-swipe
      >
        <button type="button" onClick={toggleLike} className="flex flex-col items-center gap-1" aria-pressed={liked}>
          <LikeHeart
            liked={liked}
            className="size-8 drop-shadow transition-transform active:scale-90"
            idleClassName="text-white"
          />
          <span className="text-xs font-semibold tabular-nums">{likes}</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenComments?.(post)}
          className="flex flex-col items-center gap-1"
          aria-label="Comments"
        >
          <CommentIcon className="size-8 drop-shadow" />
          <span className="text-xs font-semibold tabular-nums">{post.commentCount}</span>
        </button>

        <button
          type="button"
          onClick={() => toggleSaved(post.id)}
          className="flex flex-col items-center gap-1"
          aria-pressed={saved}
          aria-label={saved ? "Remove from saved" : "Save"}
        >
          <Bookmark className={cn("size-8 drop-shadow transition-transform active:scale-90", saved && "fill-white")} />
          <span className="text-xs font-semibold">{saved ? "Saved" : "Save"}</span>
        </button>

        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="flex flex-col items-center gap-1"
          aria-label="Share"
        >
          <Share2 className="size-7 drop-shadow transition-transform active:scale-90" />
          <span className="text-xs font-semibold">Share</span>
        </button>

        {/* Mute mirrors the feed rail. It drives the same app-wide shared mute as
            the player's own control, so the two can never disagree. */}
        {kind === "video" && (
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            className="flex flex-col items-center gap-1"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? (
              <VolumeX className="size-7 drop-shadow transition-transform active:scale-90" />
            ) : (
              <Volume2 className="size-7 drop-shadow transition-transform active:scale-90" />
            )}
            <span className="text-xs font-semibold">{muted ? "Muted" : "Sound"}</span>
          </button>
        )}
      </div>

      {/* Author row, bottom-left. Identity comes from the shared rule, so an
          anonymous asker shows the universal avatar and "Anonymous" here exactly
          as they do on the card. */}
      <div
        className={cn("absolute inset-x-0 bottom-0 z-[1] p-4 pr-24 text-white", chromeCls)}
        style={{ paddingBottom: bottomClearance }}
      >
        <IdentityRow identity={identity} postedAt={post.postedAt} onAuthorClick={onAuthorClick} />
      </div>

      <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  )
}

function IdentityRow({
  identity,
  postedAt,
  onAuthorClick,
}: {
  identity: ReturnType<typeof communityMediaIdentity>
  postedAt: string
  onAuthorClick?: (authorId: string) => void
}) {
  const avatar = (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold ring-2 ring-white/70",
        identity.color ?? "bg-white/10",
      )}
    >
      {identity.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={identity.image || "/placeholder.svg"} alt={identity.name} className="size-full object-cover" />
      ) : identity.initials ? (
        identity.initials
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ANON_AVATAR || "/placeholder.svg"} alt="Anonymous asker" className="size-full object-cover" />
      )}
    </span>
  )

  const label = (
    <span className="min-w-0">
      <span className="block truncate text-sm font-bold leading-tight drop-shadow">{identity.name}</span>
      <span className="block truncate text-xs text-white/70">
        {/* Handles are stored with the "@" already, so strip it before prefixing
            or it renders as "@@name" — same guard the feed's viewer uses. */}
        {identity.handle ? `@${identity.handle.replace(/^@/, "")}` : postedAt}
      </span>
    </span>
  )

  // Only an identifiable post is tappable through to a profile.
  if (identity.profileId && onAuthorClick) {
    return (
      <button
        type="button"
        onClick={() => onAuthorClick(identity.profileId!)}
        className="flex min-w-0 items-center gap-2.5 text-left"
      >
        {avatar}
        {label}
      </button>
    )
  }

  return <div className="flex min-w-0 items-center gap-2.5">{avatar}{label}</div>
}
