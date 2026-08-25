"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import {
  Bookmark,
  Film,
  Heart,
  Loader2,
  Play,
  Send,
  Share2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import type { FeedPostView, FeedCommentView } from "@/app/actions/feed"
import { addPostComment, setPostLike, setCommentLike, editPostComment, deletePostComment } from "@/app/actions/feed"
import { toggleSaveItem } from "@/app/actions/share"
import type { CurrentUser } from "@/lib/session"
import { haptic } from "@/lib/haptics"
import { renderMessageBody } from "@/lib/rich-text"
import { useSharedMute } from "@/lib/shared-mute"
import { getVideoPosition, setImmersiveViewerOpen } from "@/lib/video-handoff"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { CommentThread, type ThreadComment } from "@/components/comment-thread"

// Instagram-style cap: reels may run up to 3 minutes 15 seconds. Anything longer
// is filtered out client-side once its metadata reveals the true duration.
const MAX_REEL_SECONDS = 3 * 60 + 15

type Reel = { post: FeedPostView; url: string; key: string; poster?: string; trimStart?: number; trimEnd?: number }

/**
 * Caption under the author row. Mirrors the feed post caption exactly so the
 * two read identically: the same base font size and tight leading, clamped to a
 * single line when collapsed, with the last visible line fading directly into an
 * inline "… Read more" (never a separate line). Because the whole author/caption
 * block is bottom-anchored, expanding grows the block *upward*; tapping the body
 * text collapses it again. Line breaks are preserved and *markdown* emphasis is
 * parsed to bold.
 */
function ReelCaption({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const [clampable, setClampable] = useState(false)
  const textRef = useRef<HTMLDivElement>(null)

  // Match the feed caption's metrics: 1 collapsed line at leading-tight (1.25).
  const LINE_HEIGHT = 1.25
  const collapsedMaxEm = LINE_HEIGHT
  const isClamped = clampable && !expanded

  // Render with the shared rich-text renderer so `@[Name](id)` mentions,
  // **bold**/*bold*/_italic_ and links all match the feed exactly (newlines are
  // preserved by the container's `whitespace-pre-line`).
  const nodes = useMemo(
    () =>
      renderMessageBody(text, {
        link: true,
        linkClassName: "font-medium text-white underline-offset-2 [overflow-wrap:anywhere] hover:underline",
        mentionClassName: "font-semibold text-white hover:underline",
      }),
    [text],
  )

  // Only surface "Read more" when the caption genuinely overflows one line.
  // Re-measured on resize and when the text/expansion changes.
  useEffect(() => {
    const el = textRef.current
    if (!el) {
      setClampable(false)
      return
    }
    const measure = () => {
      const lineHeightPx = collapsedMaxEm * Number.parseFloat(getComputedStyle(el).fontSize || "16")
      setClampable(el.scrollHeight > lineHeightPx + 2)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, collapsedMaxEm, expanded])

  return (
    <div className="mt-2 max-w-md" data-no-swipe>
      <div
        ref={textRef}
        className={cn(
          "relative whitespace-pre-line text-base leading-tight drop-shadow transition-all",
          isClamped && "overflow-hidden",
          clampable && expanded && "cursor-pointer",
        )}
        style={isClamped ? { maxHeight: `${collapsedMaxEm}em` } : undefined}
        onClick={
          clampable && expanded
            ? (e) => {
                // Collapse when tapping the body, but let links/buttons through.
                if (!(e.target as HTMLElement).closest("a,button")) setExpanded(false)
              }
            : undefined
        }
      >
        {nodes}
        {isClamped && (
          // Sits on the last visible line; the text fades directly into the
          // inline "… Read more" via the horizontal gradient (same as the feed).
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="absolute bottom-0 right-0 flex items-baseline bg-gradient-to-l from-black from-50% to-transparent pl-14 text-base font-semibold leading-tight text-white/70 drop-shadow transition-colors hover:text-white"
          >
            <span aria-hidden className="text-white/90">…&nbsp;</span>
            Read more
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Full-screen, vertically-snapping reels experience. Flattens every video in the
 * feed (from all creators) into a randomized stack of clips. Each reel fills the
 * viewport; scrolling snaps to exactly one neighbour at a time, and the visible
 * clip autoplays while the rest pause — just like Instagram Reels.
 */
export function ReelsFeed({
  posts,
  onClose,
  header,
  currentUser = null,
  onSwipePrevTab,
  initialKey,
}: {
  posts: FeedPostView[]
  onClose?: () => void
  /** Optional custom top-bar content (e.g. the feed tab switcher). Replaces the
   *  default "Reels" title so the reels tab can float the For You / Following /
   *  Reels switcher over the video, TikTok-style. */
  header?: React.ReactNode
  /** Signed-in user, used for optimistic comment authoring and gating save. */
  currentUser?: CurrentUser | null
  /** Called on a horizontal swipe so the parent can switch to the neighbouring
   *  feed sub-tab on the left (Reels is the last tab, so left is the only way). */
  onSwipePrevTab?: () => void
  /** When set (a `${postId}-${mediaIndex}` key), the viewer opens on THAT clip
   *  instead of a shuffled stack — used when tapping a video in the feed. The
   *  remaining clips follow in feed order so vertical swiping keeps browsing. */
  initialKey?: string
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  // Manual, velocity-aware vertical navigation (replaces native scroll-snap so
  // transitions are a short, snappy tween rather than the browser's floaty snap).
  const animRef = useRef<number | null>(null)
  const animatingRef = useRef(false)
  const wheelLockRef = useRef(0)

  // One reel per video media item, shuffled once per open so the order feels
  // fresh but stays stable while the user keeps scrolling.
  const reels = useMemo<Reel[]>(() => {
    const items: Reel[] = []
    for (const p of posts) {
      p.media.forEach((m, i) => {
        if (m.type === "video" && m.url)
          items.push({
            post: p,
            url: m.url,
            key: `${p.id}-${i}`,
            poster: m.coverImageUrl,
            trimStart: m.trimStart,
            trimEnd: m.trimEnd,
          })
      })
    }
    // When opened from a specific feed video, preserve feed order and float the
    // tapped clip to the front so it's the first reel shown. Otherwise shuffle
    // for the standalone Reels experience.
    if (initialKey) {
      const idx = items.findIndex((it) => it.key === initialKey)
      if (idx > 0) {
        const [target] = items.splice(idx, 1)
        items.unshift(target)
      }
      return items
    }
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[items[i], items[j]] = [items[j], items[i]]
    }
    return items
  }, [posts, initialKey])

  // When opened as the immersive overlay from a feed clip (`initialKey`), tell
  // inline feed videos to pause and hand playback off, so the expanded reel is
  // the only thing playing. The standalone Reels tab (no `initialKey`) leaves
  // the flag untouched.
  useEffect(() => {
    if (!initialKey) return
    setImmersiveViewerOpen(true)
    return () => setImmersiveViewerOpen(false)
  }, [initialKey])

  // Clips whose real duration exceeds the cap are hidden once we learn it.
  const [tooLong, setTooLong] = useState<Set<string>>(new Set())
  const markTooLong = useCallback((key: string) => {
    setTooLong((prev) => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }, [])
  const visible = reels.filter((r) => !tooLong.has(r.key))

  // Sound is a single app-wide preference shared with the feed video previews,
  // so muting/unmuting here carries to the feed and vice-versa (and across reels
  // too). Starts muted so autoplay is allowed by the browser.
  const [muted, setMuted] = useSharedMute()

  // NOTE: We intentionally do NOT track a parent "activeIndex" here. Doing so
  // forced a re-render of *every* reel on each scroll settle and drove the
  // mount/unmount window from the top, which meant the next clip frequently had
  // no <video> source until after the scroll had already landed — producing the
  // load stall / double transition. Instead, each ReelItem self-observes with a
  // generous rootMargin (see below): neighbours mount and fully preload a real,
  // decoding <video> element while still off-screen and stay mounted across the
  // swipe, so the transition itself is purely the browser's GPU scroll-snap
  // transform — no re-render, no source assignment, no decode delay.

  // Lock background scroll while the immersive overlay is open, and signal the
  // app to hide the bottom nav so the reel is a whole, edge-to-edge experience.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.dispatchEvent(new CustomEvent("reels:active", { detail: true }))
    return () => {
      document.body.style.overflow = prev
      window.dispatchEvent(new CustomEvent("reels:active", { detail: false }))
    }
  }, [])

  // Controlled, velocity-aware vertical navigation. We drive `scrollTop`
  // ourselves (native scroll-snap is disabled) so a swipe follows the finger
  // live and commits on release using EITHER a distance threshold (30% of the
  // viewport) OR a fast flick (velocity), then tweens to the target reel in
  // ~220ms with an ease-out curve. Horizontal flicks still hand off to the
  // neighbouring feed tab. Gestures that begin on an interactive control (rail,
  // scrubber, caption, comments sheet — all `data-no-swipe`) are ignored so
  // their own scrolling/taps keep working. Listeners are non-passive so the
  // vertical drag can `preventDefault` the browser's own momentum scroll.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    const DISTANCE_RATIO = 0.3 // fraction of viewport height that commits a move
    const VELOCITY = 0.5 // px/ms — a quick flick commits regardless of distance
    const ANIM_MS = 220
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

    const cancelAnim = () => {
      if (animRef.current != null) cancelAnimationFrame(animRef.current)
      animRef.current = null
      animatingRef.current = false
    }
    const animateTo = (targetTop: number) => {
      cancelAnim()
      const start = scroller.scrollTop
      const dist = targetTop - start
      if (Math.abs(dist) < 1) {
        scroller.scrollTop = targetTop
        return
      }
      const t0 = performance.now()
      animatingRef.current = true
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / ANIM_MS)
        scroller.scrollTop = start + dist * easeOutCubic(p)
        if (p < 1) {
          animRef.current = requestAnimationFrame(step)
        } else {
          scroller.scrollTop = targetTop
          animatingRef.current = false
          animRef.current = null
        }
      }
      animRef.current = requestAnimationFrame(step)
    }
    const lastIndex = () => Math.max(0, Math.round(scroller.scrollHeight / scroller.clientHeight) - 1)
    const currentIndex = () => Math.round(scroller.scrollTop / scroller.clientHeight)
    const goTo = (index: number) => {
      const clamped = Math.max(0, Math.min(index, lastIndex()))
      animateTo(clamped * scroller.clientHeight)
    }

    let startX = 0
    let startY = 0
    let startScroll = 0
    let startTime = 0
    let axis: "" | "v" | "h" = ""
    let skip = false
    let tracking = false

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        tracking = false
        return
      }
      const t = e.touches[0]
      skip = Boolean((e.target as HTMLElement).closest("input, button, a, [data-no-swipe]"))
      startX = t.clientX
      startY = t.clientY
      startScroll = scroller.scrollTop
      startTime = performance.now()
      axis = ""
      tracking = true
      cancelAnim()
    }
    const onMove = (e: TouchEvent) => {
      if (!tracking || skip) return
      const t = e.touches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (!axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        axis = Math.abs(dy) >= Math.abs(dx) ? "v" : "h"
      }
      if (axis === "v") {
        e.preventDefault() // stop native momentum; we control the position
        const max = lastIndex() * scroller.clientHeight
        let next = startScroll - dy
        // Rubber-band resistance past the first/last reel.
        if (next < 0) next *= 0.35
        else if (next > max) next = max + (next - max) * 0.35
        scroller.scrollTop = next
      }
    }
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false
      if (skip) return
      const t = e.changedTouches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      const dt = Math.max(1, performance.now() - startTime)
      if (axis === "h") {
        if (onSwipePrevTab && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipePrevTab()
        return
      }
      if (axis !== "v") return
      const h = scroller.clientHeight
      const cur = Math.round(startScroll / h)
      const velocityUp = -dy / dt // + = flicking upward (toward the next reel)
      const ratio = -dy / h
      let target = cur
      if (ratio > DISTANCE_RATIO || velocityUp > VELOCITY) target = cur + 1
      else if (ratio < -DISTANCE_RATIO || velocityUp < -VELOCITY) target = cur - 1
      goTo(target)
    }
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return // ignore horizontal wheels
      e.preventDefault()
      const now = performance.now()
      if (animatingRef.current || now < wheelLockRef.current) return
      wheelLockRef.current = now + ANIM_MS + 120 // one notch = one reel
      goTo(currentIndex() + (e.deltaY > 0 ? 1 : -1))
    }

    scroller.addEventListener("touchstart", onStart, { passive: true })
    scroller.addEventListener("touchmove", onMove, { passive: false })
    scroller.addEventListener("touchend", onEnd, { passive: true })
    scroller.addEventListener("touchcancel", onEnd, { passive: true })
    scroller.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      cancelAnim()
      scroller.removeEventListener("touchstart", onStart)
      scroller.removeEventListener("touchmove", onMove)
      scroller.removeEventListener("touchend", onEnd)
      scroller.removeEventListener("touchcancel", onEnd)
      scroller.removeEventListener("wheel", onWheel)
    }
  }, [onSwipePrevTab])

  const overlay = (
    // Explicit viewport dimensions (not just `inset-0`) so the overlay fills the
    // screen even while the page-entry animation briefly makes the wrapper a
    // containing block — otherwise `inset-0` would resolve against a 0×0 box.
    // z-[60] sits above the sticky app header (z-40) and bottom nav.
    <div className="fixed left-0 top-0 z-[60] h-[100dvh] w-screen bg-black">
      <div
        ref={scrollerRef}
        className="h-full overflow-y-scroll overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-white/80">
            <Film className="size-10 text-white/50" />
            <p className="text-base font-semibold text-white">No reels yet</p>
            <p className="text-sm leading-relaxed text-white/60">
              Reels show short videos (up to 3:15) from creators across Frequency. Post a video to start the reel.
            </p>
          </div>
        ) : (
          visible.map((reel) => (
            <ReelItem
              key={reel.key}
              reel={reel}
              root={scrollerRef}
              muted={muted}
              onToggleMute={() => setMuted(!muted)}
              onTooLong={() => markTooLong(reel.key)}
              currentUser={currentUser}
              resumeFrom={reel.key === initialKey ? getVideoPosition(reel.url) : undefined}
            />
          ))
        )}
      </div>

      {/* Legibility scrim so the top bar / tabs read clearly over bright video. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/50 to-transparent" />

      {/* Persistent top bar (outside the scroller so it never scrolls away). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(env(safe-area-inset-top),1rem)]">
        {header ? (
          <div className="pointer-events-auto flex flex-1 justify-center">{header}</div>
        ) : (
          // No title text — an empty spacer keeps the close button right-aligned.
          <span aria-hidden className="flex-1" />
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close reels"
            className="pointer-events-auto flex size-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/60"
          >
            <X className="size-5" />
          </button>
        )}
      </div>
    </div>
  )

  // Portal to <body> so the immersive overlay escapes any transformed
  // page-transition ancestor, whose stacking context otherwise trapped it
  // *beneath* the sticky app header — hiding the close button. This mounts only
  // via user interaction, so `document` is always available on the client.
  return typeof document === "undefined" ? null : createPortal(overlay, document.body)
}

function ReelItem({
  reel,
  root,
  muted,
  onToggleMute,
  onTooLong,
  currentUser,
  resumeFrom,
}: {
  reel: Reel
  root: React.RefObject<HTMLDivElement | null>
  muted: boolean
  onToggleMute: () => void
  onTooLong: () => void
  currentUser: CurrentUser | null
  /** Absolute time (seconds) to resume from when this reel was expanded from a
   *  playing feed clip. Applied once so the reel continues instead of restarting. */
  resumeFrom?: number
}) {
  const { post, url } = reel
  // Ensures the feed-handoff resume position is applied only on the first
  // metadata load — not on loop or when the reel is revisited.
  const resumedRef = useRef(false)
  // Append a media-fragment (`#t=<start>`) so the browser decodes and paints the
  // first frame as the element's thumbnail immediately — even before playback
  // begins. Without this the freshly-mounted <video> shows a black box for a
  // few seconds while it buffers (the "dark before the video starts" bug on
  // expand). Uses the trimmed start when present, otherwise 0.1s.
  const posterTime = (reel.trimStart ?? 0) > 0 ? (reel.trimStart as number) : 0.1
  const posterSrc = url.includes("#") ? url : `${url}#t=${posterTime}`
  const videoRef = useRef<HTMLVideoElement>(null)
  const backdropRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Trim window (seconds). Playback and the scrubber are confined to this range
  // so the reel only ever shows the trimmed selection. Finalized against the
  // real duration on loadedmetadata.
  const windowStartRef = useRef(Math.max(0, reel.trimStart ?? 0))
  const windowEndRef = useRef(reel.trimEnd != null ? reel.trimEnd : Number.POSITIVE_INFINITY)
  const [active, setActive] = useState(false)
  const [paused, setPaused] = useState(false)
  // `shouldRender` mounts the real decoding <video> elements. Driven by a
  // generous rootMargin observer so it flips true while the reel is still a
  // screen-and-a-bit away — meaning the next/prev clip is already a live,
  // preloaded, first-frame-holding element before you swipe to it. Latches so a
  // clip never remounts (and re-buffers) while you linger on its neighbour.
  const [shouldRender, setShouldRender] = useState(false)

  // Robust muted autoplay: mobile browsers only permit autoplay while the video
  // is *genuinely* muted, and React's `muted` JSX prop is famously unreliable at
  // setting the DOM property in time. So we always force the muted property on
  // the element right before play(), and if a play attempt is still rejected we
  // hard-mute and retry — guaranteeing the clip actually starts.
  const playVideo = useCallback((v: HTMLVideoElement | null, forceMuted: boolean) => {
    if (!v) return
    v.muted = forceMuted
    const p = v.play()
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        v.muted = true
        v.play().catch(() => {})
      })
    }
  }, [])

  const [liked, setLiked] = useState(post.liked)
  const [likes, setLikes] = useState(post.likes)
  const [saved, setSaved] = useState(post.saved)
  // Hide the Follow button on the current user's own reels; otherwise seed it
  // from the post's follow state. Local-only for now — toggling is optimistic.
  const isOwnReel = currentUser?.id === post.authorId
  const [following, setFollowing] = useState(post.isFollowing)
  const [comments, setComments] = useState<FeedCommentView[]>(post.comments)
  const [commentsOpen, setCommentsOpen] = useState(false)

  // Playback progress (0–100) for the draggable scrubber. `scrubbing` freezes
  // the timeupdate-driven progress while the user drags the thumb.
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const scrubbingRef = useRef(false)
  const seekRef = useRef<HTMLDivElement>(null)

  // Latest muted value readable inside the (non-re-subscribing) observer.
  const mutedRef = useRef(muted)

  // Keep the element's mute state in sync with the global toggle. The blurred
  // backdrop copy is always muted.
  useEffect(() => {
    mutedRef.current = muted
    if (videoRef.current) videoRef.current.muted = muted
  }, [muted])

  // Render-window observer: fires while the reel is still ~1.4 screens away, so
  // the <video> mounts and preloads (holding its first frame) well before it
  // scrolls into view. Latches true and only releases once the reel is >2.5
  // screens away, so the immediate neighbours never remount mid-swipe — the
  // transition stays a pure scroll transform with zero load delay.
  useEffect(() => {
    const el = containerRef.current
    const scroller = root.current
    if (!el || !scroller) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setShouldRender(true)
      },
      { root: scroller, rootMargin: "140% 0px", threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [root])

  // Release far-away reels so we never hold more than a handful of decoders.
  // A wider margin than the mount observer gives hysteresis: a reel mounts at
  // 1.4 screens and only unmounts past 2.5, so hovering near it won't thrash.
  useEffect(() => {
    if (!shouldRender) return
    const el = containerRef.current
    const scroller = root.current
    if (!el || !scroller) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) setShouldRender(false)
      },
      { root: scroller, rootMargin: "250% 0px", threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [root, shouldRender])

  // Autoplay only the reel that is centered in the viewport; pause + rewind the
  // others so returning to a clip restarts it. Strict 0.6 ratio = "centered".
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        const isActive = entry.isIntersecting && entry.intersectionRatio >= 0.6
        setActive(isActive)
        const v = videoRef.current
        const bg = backdropRef.current
        if (!v) return
        if (isActive) {
          setPaused(false)
          playVideo(v, mutedRef.current)
          playVideo(bg, true)
        } else {
          v.pause()
          v.currentTime = 0
          setProgress(0)
          if (bg) {
            bg.pause()
            bg.currentTime = 0
          }
        }
      },
      { root: root.current, threshold: [0, 0.6, 1] },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [root, playVideo])

  // Safety net: if the active observer fired before this reel's <video> had a
  // source (e.g. a very fast fling that outran preload), re-attempt playback
  // once both the clip is centered and its element is mounted, so it never
  // stalls on a blank frame.
  useEffect(() => {
    if (active && shouldRender) {
      playVideo(videoRef.current, mutedRef.current)
      playVideo(backdropRef.current, true)
    }
  }, [active, shouldRender, playVideo])

  function togglePlay() {
    const v = videoRef.current
    const bg = backdropRef.current
    if (!v) return
    if (v.paused) {
      playVideo(v, mutedRef.current)
      playVideo(bg, true)
      setPaused(false)
    } else {
      v.pause()
      bg?.pause()
      setPaused(true)
    }
  }

  async function toggleLike() {
    const next = !liked
    setLiked(next)
    setLikes((n) => n + (next ? 1 : -1))
    haptic("select")
    try {
      await setPostLike({ postId: Number(post.id), liked: next })
    } catch {
      setLiked(!next)
      setLikes((n) => n + (next ? -1 : 1))
    }
  }

  // Save the reel's underlying post. It's stored as a "post", so it lands in the
  // Feed folder of the Saved menu (same folder as posts saved from the feed).
  function toggleSave() {
    if (!currentUser) return
    const next = !saved
    setSaved(next)
    haptic(next ? "light" : "select")
    ;(async () => {
      try {
        const res = await toggleSaveItem({
          type: "post",
          key: String(post.id),
          title: `${post.user} on Frequency`,
          subtitle: post.text ? post.text.slice(0, 120) : null,
          url: `/feed?post=${post.id}`,
          image: post.image ?? post.video ?? null,
          downloadUrl: post.video ?? post.image ?? null,
          downloadKind: post.video ? "video" : post.image ? "image" : null,
        })
        setSaved(res.saved)
      } catch {
        setSaved(!next)
      }
    })()
  }

  async function share() {
    const link = typeof window !== "undefined" ? `${window.location.origin}/feed?post=${post.id}` : ""
    const title = post.text ? post.text.slice(0, 80) : `${post.user} on Frequency`
    try {
      if (typeof navigator !== "undefined" && navigator.share) await navigator.share({ title, url: link })
      else await navigator.clipboard?.writeText(link)
    } catch {
      /* user cancelled */
    }
  }

  // Effective trimmed window length, falling back to full duration.
  function windowLen(v: HTMLVideoElement) {
    const end = Number.isFinite(windowEndRef.current) ? windowEndRef.current : v.duration || 0
    return Math.max(0, end - windowStartRef.current)
  }

  // Keep the scrubber in sync with playback and loop within the trim window.
  function onTimeUpdate() {
    const v = videoRef.current
    if (!v || !v.duration) return
    // Loop back to the window start once the trimmed end is reached.
    if (v.currentTime >= windowEndRef.current) {
      try {
        v.currentTime = windowStartRef.current
      } catch {
        /* ignore */
      }
    } else if (v.currentTime < windowStartRef.current - 0.05) {
      try {
        v.currentTime = windowStartRef.current
      } catch {
        /* ignore */
      }
    }
    if (scrubbingRef.current) return
    const len = windowLen(v)
    if (len > 0) setProgress(((v.currentTime - windowStartRef.current) / len) * 100)
  }

  // Translate a pointer x-position over the track into a seek time within the
  // trimmed window (drag or tap).
  const seekToClientX = useCallback((clientX: number) => {
    const v = videoRef.current
    const bar = seekRef.current
    if (!v || !bar || !v.duration) return
    const end = Number.isFinite(windowEndRef.current) ? windowEndRef.current : v.duration
    const len = Math.max(0, end - windowStartRef.current)
    if (len <= 0) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    v.currentTime = windowStartRef.current + ratio * len
    setProgress(ratio * 100)
  }, [])

  function onSeekPointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    scrubbingRef.current = true
    setDragging(true)
    seekToClientX(e.clientX)
  }
  function onSeekPointerMove(e: React.PointerEvent) {
    if (!scrubbingRef.current) return
    seekToClientX(e.clientX)
  }
  function onSeekPointerUp() {
    scrubbingRef.current = false
    setDragging(false)
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full snap-start snap-always items-center justify-center overflow-hidden [contain:layout_paint]"
    >
      {/* Blurred backdrop: the same clip stretched to cover the frame so off-ratio
          videos fill edge-to-edge (no black bars, nothing "hanging"), while the
          real clip plays contained on top so no content is ever cropped. */}
      {shouldRender && (
        <video
          ref={backdropRef}
          src={posterSrc}
          poster={reel.poster}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl"
          playsInline
          loop
          muted
          preload="metadata"
          tabIndex={-1}
        />
      )}
      <div aria-hidden="true" className="absolute inset-0 bg-black/30" />
      <video
        ref={videoRef}
        src={shouldRender ? posterSrc : undefined}
        poster={reel.poster}
        className="relative h-full w-full object-contain"
        playsInline
        loop
        muted={muted}
        preload={shouldRender ? "auto" : "none"}
        onClick={togglePlay}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget
          const real = el.duration && isFinite(el.duration) ? el.duration : 0
          // Finalize the trim window against the real duration.
          const ws = Math.max(0, Math.min(reel.trimStart ?? 0, real))
          const we = Math.min(reel.trimEnd != null ? reel.trimEnd : real, real)
          windowStartRef.current = ws
          windowEndRef.current = we > ws ? we : real
          // Cap is measured against the TRIMMED length, so a long source trimmed
          // to a short clip is allowed.
          if (windowEndRef.current - ws > MAX_REEL_SECONDS) onTooLong()
          // If expanded from a playing feed clip, resume from that exact spot
          // (clamped into the trim window); otherwise start at the trimmed
          // beginning. The resume applies only once.
          const end = Number.isFinite(windowEndRef.current) ? windowEndRef.current : real
          let startAt = ws
          if (resumeFrom != null && !resumedRef.current) {
            resumedRef.current = true
            startAt = Math.min(Math.max(resumeFrom, ws), Math.max(ws, end - 0.25))
          }
          if (startAt > 0) {
            try {
              el.currentTime = startAt
            } catch {
              /* not seekable yet */
            }
          }
        }}
      />

      {/* Center play glyph when the user has manually paused. */}
      {active && paused && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-black/45 backdrop-blur">
            <Play className="size-8 fill-white text-white" />
          </span>
        </button>
      )}

      {/* Bottom gradient for legibility of the caption/author. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/80 to-transparent" />

      {/* Right-hand action rail. Sits low near the caption (bottom-20) so it
          reads as anchored to the bottom controls rather than floating high up
          the clip; the caption's pr-24 reserves this right column so the two
          never overlap, and it still clears the full-width scrubber below.
          z-[3] keeps it above the full-width caption block (z-[1]) so its taps
          aren't swallowed by the caption's invisible box. Only shown for the
          active reel so a neighbouring reel's rail can't bleed in while scrolling. */}
      <div
        className={cn(
          "absolute bottom-20 right-3 z-[3] flex flex-col items-center gap-5 text-white transition-opacity duration-200",
          active ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        data-no-swipe
      >
        <button type="button" onClick={toggleLike} className="flex flex-col items-center gap-1" aria-pressed={liked}>
          <Heart
            className={cn(
              "size-8 drop-shadow transition-transform active:scale-90",
              liked && "fill-red-500 text-red-500",
            )}
          />
          <span className="text-xs font-semibold tabular-nums">{likes}</span>
        </button>
        <button
          type="button"
          onClick={() => setCommentsOpen(true)}
          className="flex flex-col items-center gap-1"
          aria-label="Comments"
        >
          <CommentIcon className="size-8 drop-shadow" />
          <span className="text-xs font-semibold tabular-nums">{comments.length}</span>
        </button>
        <button
          type="button"
          onClick={toggleSave}
          className="flex flex-col items-center gap-1"
          aria-pressed={saved}
          aria-label={saved ? "Remove from saved" : "Save"}
        >
          <Bookmark className={cn("size-8 drop-shadow transition-transform active:scale-90", saved && "fill-white")} />
          <span className="text-xs font-semibold">{saved ? "Saved" : "Save"}</span>
        </button>
        <button type="button" onClick={share} className="flex flex-col items-center gap-1" aria-label="Share">
          <Share2 className="size-7 drop-shadow transition-transform active:scale-90" />
          <span className="text-xs font-semibold">Share</span>
        </button>
        {/* Mute toggle — lives in the action rail alongside the other icons so it
            shares their icon + label design language. */}
        <button
          type="button"
          onClick={onToggleMute}
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
      </div>

      {/* Author + caption, bottom-left. Bottom-anchored so expanding the caption
          grows the block upward — pushing the author row up rather than covering
          the scrubber/controls below. Only shown for the centered (active) reel
          so a neighbouring reel's profile never bleeds into this one while
          scrolling — matching how Instagram/TikTok hide inactive-reel chrome. */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-[1] p-4 pb-12 pr-24 text-white transition-opacity duration-200",
          active ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div className="flex items-center gap-2.5">
          <Link href={`/u/${post.authorId}`} className="flex min-w-0 items-center gap-2.5">
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
              <span className="block truncate text-xs text-white/70">@{post.handle}</span>
            </span>
          </Link>
          {!isOwnReel && (
            <button
              type="button"
              data-no-swipe
              onClick={() => {
                setFollowing((f) => !f)
                haptic("select")
              }}
              aria-pressed={following}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                following
                  ? "border-white/60 bg-transparent text-white"
                  : "border-white bg-white text-black hover:bg-white/90",
              )}
            >
              {following ? "Following" : "Follow"}
            </button>
          )}
        </div>
        {post.text && <ReelCaption text={post.text} />}
      </div>

      {/* Draggable play tracker — full-width at the very bottom. Tap or drag the
          thumb anywhere along the track to seek to that point in the clip. Only
          the active reel's scrubber is shown so it can't bleed in from a
          neighbour while scrolling. */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-[2] px-3 pb-[max(env(safe-area-inset-bottom),0.4rem)] pt-3 transition-opacity duration-200",
          active ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        data-no-swipe
      >
        <div
          ref={seekRef}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          tabIndex={0}
          onPointerDown={onSeekPointerDown}
          onPointerMove={onSeekPointerMove}
          onPointerUp={onSeekPointerUp}
          onPointerCancel={onSeekPointerUp}
          className="group relative flex h-6 touch-none items-center"
        >
          <span className="block h-1 w-full overflow-hidden rounded-full bg-white/30">
            <span className="block h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
          </span>
          <span
            className={cn(
              "absolute size-3 -translate-x-1/2 rounded-full bg-white shadow transition-transform",
              dragging ? "scale-150" : "scale-100 group-hover:scale-125",
            )}
            style={{ left: `${progress}%` }}
          />
        </div>
      </div>

      {/* Comments — a bottom sheet layered over this reel. */}
      {commentsOpen && (
        <CommentsSheet
          post={post}
          comments={comments}
          setComments={setComments}
          currentUser={currentUser}
          onClose={() => setCommentsOpen(false)}
        />
      )}
    </div>
  )
}

// Maps a reel's feed comment into the shared CommentThread shape (identical to
// the "For you" feed), so reels get the same likes + nested replies UI.
function toThreadComment(c: FeedCommentView): ThreadComment {
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
 * Bottom-sheet comments for a reel. Uses the shared CommentThread — the exact
 * same component the "For you" feed uses — so reels support per-comment likes,
 * nested replies, and (for the author) edit/delete via long-press. Mutations
 * update the reel's local comment list optimistically so counts stay in sync
 * without a full refetch.
 */
function CommentsSheet({
  post,
  comments,
  setComments,
  currentUser,
  onClose,
}: {
  post: FeedPostView
  comments: FeedCommentView[]
  setComments: React.Dispatch<React.SetStateAction<FeedCommentView[]>>
  currentUser: CurrentUser | null
  onClose: () => void
}) {
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !currentUser || sending) return
    setSending(true)
    const optimistic = makeOptimistic(currentUser, text, null)
    setComments((prev) => [...prev, optimistic])
    setDraft("")
    haptic("light")
    try {
      await addPostComment({ postId: Number(post.id), text })
    } catch {
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id))
    } finally {
      setSending(false)
    }
  }

  function handleLike(commentId: number, liked: boolean) {
    void setCommentLike({ commentId, liked })
  }

  async function handleReply(parentId: number, value: string) {
    if (!currentUser) return
    const optimistic = makeOptimistic(currentUser, value, parentId)
    setComments((prev) => [...prev, optimistic])
    haptic("light")
    try {
      await addPostComment({ postId: Number(post.id), text: value, parentId })
    } catch {
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id))
    }
  }

  async function handleEdit(commentId: number, value: string) {
    setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, text: value, edited: true } : c)))
    await editPostComment({ commentId, text: value }).catch(() => {})
  }

  async function handleDelete(commentId: number) {
    // Drop the comment and any of its direct replies from the local list.
    setComments((prev) => prev.filter((c) => c.id !== commentId && c.parentId !== commentId))
    await deletePostComment(commentId).catch(() => {})
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end" data-no-swipe>
      <button
        type="button"
        aria-label="Close comments"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200"
      />
      {/* Force dark tokens so the shared (token-based) CommentThread always reads
          correctly on this dark immersive sheet, regardless of app theme. */}
      <div className="dark relative flex h-[70%] flex-col rounded-t-[1.75rem] border-t border-white/10 bg-neutral-950 text-white shadow-2xl animate-in slide-in-from-bottom duration-300 ease-out">
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
              <h2 className="text-[15px] font-semibold tracking-tight">
                {comments.length > 0
                  ? `${comments.length} ${comments.length === 1 ? "comment" : "comments"}`
                  : "Comments"}
              </h2>
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
          {comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-white/5">
                <CommentIcon className="size-7 text-white/40" />
              </span>
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-white/80">No comments yet</p>
                <p className="text-xs text-white/45">Start the conversation.</p>
              </div>
            </div>
          ) : (
            <CommentThread
              comments={comments.map(toThreadComment)}
              canInteract={!!currentUser}
              showCopy={false}
              enforceTimeWindows={false}
              onLike={handleLike}
              onReply={handleReply}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </div>

        {currentUser ? (
          <form
            onSubmit={submit}
            className="flex shrink-0 items-center gap-2.5 border-t border-white/10 bg-neutral-950/95 px-3.5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur"
          >
            <Avatar className="size-8 shrink-0 ring-1 ring-white/10">
              {currentUser.image && <AvatarImage src={currentUser.image || "/placeholder.svg"} alt={currentUser.name} />}
              <AvatarFallback className={cn("text-[11px]", currentUser.color)}>{currentUser.initials}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-white/[0.08] pl-4 pr-1.5 ring-1 ring-inset ring-white/10 transition focus-within:ring-white/25">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a comment…"
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
    </div>
  )
}

// Builds an optimistic comment/reply from the current user for instant display.
function makeOptimistic(currentUser: CurrentUser, text: string, parentId: number | null): FeedCommentView {
  return {
    id: Date.now(),
    parentId,
    authorId: currentUser.id,
    isSelf: true,
    user: currentUser.name,
    handle: currentUser.handle,
    initials: currentUser.initials,
    color: currentUser.color,
    authorImage: currentUser.image,
    // Reels comments are always personal — no org voice switcher on this surface.
    orgVerified: false,
    text,
    likes: 0,
    liked: false,
    edited: false,
    postedAt: "Just now",
    createdAtMs: Date.now(),
  }
}
