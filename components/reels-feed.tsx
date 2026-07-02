"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Heart, MessageCircle, Volume2, VolumeX, X, Film, Play } from "lucide-react"
import type { FeedPostView } from "@/app/actions/feed"
import { setPostLike } from "@/app/actions/feed"
import { ShareButton } from "@/components/store/store-cards"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

// Instagram-style cap: reels may run up to 3 minutes 15 seconds. Anything longer
// is filtered out client-side once its metadata reveals the true duration.
const MAX_REEL_SECONDS = 3 * 60 + 15

type Reel = { post: FeedPostView; url: string; key: string }

/**
 * Full-screen, vertically-snapping reels experience. Flattens every video in the
 * feed (from all creators) into a randomized stack of clips. Each reel fills the
 * viewport; scrolling snaps to exactly one neighbour at a time, and the visible
 * clip autoplays while the rest pause — just like Instagram Reels.
 */
export function ReelsFeed({ posts, onClose }: { posts: FeedPostView[]; onClose: () => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  // One reel per video media item, shuffled once per open so the order feels
  // fresh but stays stable while the user keeps scrolling.
  const reels = useMemo<Reel[]>(() => {
    const items: Reel[] = []
    for (const p of posts) {
      p.media.forEach((m, i) => {
        if (m.type === "video" && m.url) items.push({ post: p, url: m.url, key: `${p.id}-${i}` })
      })
    }
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[items[i], items[j]] = [items[j], items[i]]
    }
    return items
  }, [posts])

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

  // Sound is global across reels (toggling on one carries to the next), matching
  // Instagram. Start muted so autoplay is allowed by the browser.
  const [muted, setMuted] = useState(true)

  // Lock background scroll while the immersive overlay is open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div className="fixed inset-0 z-40 bg-black">
      <div
        ref={scrollerRef}
        className="h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              onToggleMute={() => setMuted((m) => !m)}
              onTooLong={() => markTooLong(reel.key)}
            />
          ))
        )}
      </div>

      {/* Persistent top bar (outside the scroller so it never scrolls away). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(env(safe-area-inset-top),1rem)]">
        <span className="text-lg font-bold text-white drop-shadow">Reels</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reels"
          className="pointer-events-auto flex size-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/60"
        >
          <X className="size-5" />
        </button>
      </div>
    </div>
  )
}

function ReelItem({
  reel,
  root,
  muted,
  onToggleMute,
  onTooLong,
}: {
  reel: Reel
  root: React.RefObject<HTMLDivElement | null>
  muted: boolean
  onToggleMute: () => void
  onTooLong: () => void
}) {
  const { post, url } = reel
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)
  const [paused, setPaused] = useState(false)

  const [liked, setLiked] = useState(post.liked)
  const [likes, setLikes] = useState(post.likes)

  // Keep the element's mute state in sync with the global toggle.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted
  }, [muted])

  // Autoplay only the reel that is centered in the viewport; pause + rewind the
  // others so returning to a clip restarts it.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        const isActive = entry.isIntersecting && entry.intersectionRatio >= 0.6
        setActive(isActive)
        const v = videoRef.current
        if (!v) return
        if (isActive) {
          setPaused(false)
          v.play().catch(() => {})
        } else {
          v.pause()
          v.currentTime = 0
        }
      },
      { root: root.current, threshold: [0, 0.6, 1] },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [root])

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play().catch(() => {})
      setPaused(false)
    } else {
      v.pause()
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

  return (
    <div ref={containerRef} className="relative flex h-full w-full snap-start snap-always items-center justify-center">
      <video
        ref={videoRef}
        src={url}
        className="h-full w-full object-contain"
        playsInline
        loop
        muted={muted}
        preload="metadata"
        onClick={togglePlay}
        onLoadedMetadata={(e) => {
          if (e.currentTarget.duration > MAX_REEL_SECONDS) onTooLong()
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

      {/* Mute toggle, top-right under the bar. */}
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute right-4 top-16 flex size-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/60"
      >
        {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
      </button>

      {/* Right-hand action rail. */}
      <div className="absolute bottom-24 right-3 flex flex-col items-center gap-5 text-white">
        <button type="button" onClick={toggleLike} className="flex flex-col items-center gap-1" aria-pressed={liked}>
          <Heart className={cn("size-8 drop-shadow transition-transform active:scale-90", liked && "fill-red-500 text-red-500")} />
          <span className="text-xs font-semibold tabular-nums">{likes}</span>
        </button>
        <Link href={`/feed?post=${post.id}`} className="flex flex-col items-center gap-1" aria-label="Comments">
          <MessageCircle className="size-8 drop-shadow" />
          <span className="text-xs font-semibold tabular-nums">{post.comments.length}</span>
        </Link>
        <ShareButton
          title={post.text || `${post.user} on Frequency`}
          className="size-9 rounded-full border-none bg-transparent text-white hover:bg-white/10"
        />
      </div>

      {/* Author + caption, bottom-left. */}
      <div className="absolute inset-x-0 bottom-0 z-[1] p-4 pb-24 pr-20 text-white">
        <Link href={`/u/${post.authorId}`} className="flex items-center gap-2.5">
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
        {post.text && <p className="mt-2.5 line-clamp-2 max-w-md text-sm leading-relaxed drop-shadow">{post.text}</p>}
      </div>
    </div>
  )
}
