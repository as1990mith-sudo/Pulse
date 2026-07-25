"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bookmark, Heart, Share2, X } from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import type { Show } from "@/lib/data"
import type { CurrentUser } from "@/lib/session"
import type { EpisodeCommentView } from "@/app/actions/episodes"
import {
  addEpisodeComment,
  deleteEpisodeComment,
  editEpisodeComment,
  getEpisodeComments,
  isEpisodeLiked,
  setEpisodeCommentLike,
  setEpisodeLike,
} from "@/app/actions/episodes"
import { isItemSaved, toggleSaveItem } from "@/app/actions/share"
import { getEpisodeEngagement, type EpisodeEngagement } from "@/app/actions/engagement"
import { getFollowingIds } from "@/app/actions/follow"
import type { ShareTarget } from "@/lib/share-types"
import { LiveReplayPlayer } from "@/components/live-replay-player"
import { type ThreadComment } from "@/components/comment-thread"
import { CommentSheet } from "@/components/comment-sheet"
import { ShareSheet } from "@/components/share-sheet"
import { ProfileFollowButton } from "@/components/profile/profile-follow-button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

/** Compact count for the overlaid action rail (1.2k, 3.4M). */
function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`.replace(".0", "")
  return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`.replace(".0", "")
}

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
 * "Streamed …" label — reframes the episode's publish time as a past broadcast.
 */
function streamedLabel(show: Show): string {
  if (show.publishedAt) {
    return show.publishedAt === "just now" ? "Streamed just now" : `Streamed ${show.publishedAt}`
  }
  if (show.publishedDate) return `Streamed on ${show.publishedDate}`
  return "Livestream replay"
}

/**
 * LiveReplayWatch — a FULL-SCREEN vertical reel of a creator's livestream
 * replays. The current replay opens first; swiping / scrolling up or down snaps
 * to the previous / next replay from the SAME creator. Each slide fills the
 * entire screen (no scroll area beneath the player) with the like / comment /
 * share / save actions and title overlaid directly on the video, plus a close
 * button that exits back to where the user came from.
 */
export function LiveReplayWatch({
  show,
  currentUser,
  initialComments,
  creatorReplays,
}: {
  show: Show
  currentUser: CurrentUser | null
  initialComments: EpisodeCommentView[]
  creatorReplays: Show[]
  // relatedReplays / recommendedUploads are intentionally no longer used — the
  // reel is restricted to this creator's replays.
  relatedReplays?: Show[]
  recommendedUploads?: Show[]
}) {
  const router = useRouter()

  // Reel order: the opened replay first, then the creator's other replays
  // (deduped, playable video only). This keeps up/down within one creator.
  const replays = useMemo(() => {
    const seen = new Set<string>()
    const list: Show[] = []
    for (const s of [show, ...creatorReplays]) {
      const id = s.id
      if (!id || seen.has(id)) continue
      if (!s.videoUrl && !s.audioUrl) continue
      seen.add(id)
      list.push(s)
    }
    return list
  }, [show, creatorReplays])

  const containerRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  // Track which slide is centered so only it auto-plays.
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const slides = Array.from(root.querySelectorAll<HTMLElement>("[data-replay-slide]"))
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            const idx = Number((e.target as HTMLElement).dataset.index)
            if (!Number.isNaN(idx)) setActiveIndex(idx)
          }
        }
      },
      { root, threshold: [0.6] },
    )
    slides.forEach((s) => io.observe(s))
    return () => io.disconnect()
  }, [replays.length])

  // Hide the global bottom nav for the whole immersive reel, matching Reels.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("reels:active", { detail: true }))
    return () => {
      window.dispatchEvent(new CustomEvent("reels:active", { detail: false }))
    }
  }, [])

  function close() {
    // If the replay is floating in the OS Picture-in-Picture window, the viewer
    // wants to keep watching that mini window while they browse. Dismissing the
    // full-screen reel should therefore drop them into the live video catalogue
    // (episodes) rather than unwinding history back to wherever they came from —
    // and we deliberately do NOT exit PiP, so the floating player keeps playing.
    if (typeof document !== "undefined" && document.pictureInPictureElement) {
      router.push("/live")
      return
    }
    if (typeof window !== "undefined" && window.history.length > 1) router.back()
    else router.push("/live")
  }

  if (replays.length === 0) return null

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-40 h-[100dvh] w-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain bg-black [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {/* Close button — fixed above every slide. */}
      <button
        type="button"
        onClick={close}
        aria-label="Close replay"
        className="tap-scale fixed left-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 flex size-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
      >
        <X className="size-5" />
      </button>

      {replays.map((s, i) => (
        <ReplaySlide
          key={s.id}
          show={s}
          index={i}
          active={i === activeIndex}
          currentUser={currentUser}
          initialComments={i === 0 ? initialComments : undefined}
        />
      ))}
    </div>
  )
}

/** A single full-screen replay slide with the player + overlaid action rail. */
function ReplaySlide({
  show,
  index,
  active,
  currentUser,
  initialComments,
}: {
  show: Show
  index: number
  active: boolean
  currentUser: CurrentUser | null
  initialComments?: EpisodeCommentView[]
}) {
  const episodeId = show.episodeId

  const [commentsOpen, setCommentsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(show.likes ?? 0)
  const [saved, setSaved] = useState(false)
  const [comments, setComments] = useState<EpisodeCommentView[]>(initialComments ?? [])
  const [commentsLoaded, setCommentsLoaded] = useState(Boolean(initialComments))
  const [engagement, setEngagement] = useState<EpisodeEngagement | null>(null)
  const [saveCount, setSaveCount] = useState(0)
  const [shareCount, setShareCount] = useState(0)
  const [, startTransition] = useTransition()

  const hostIsSelf = currentUser?.id === show.host.id
  const [followKnown, setFollowKnown] = useState(false)
  const [hostFollowing, setHostFollowing] = useState(false)

  // Lazily load per-slide data only once the slide becomes active, so we don't
  // fire a request for every replay up front.
  const loadedRef = useRef(false)
  useEffect(() => {
    if (!active || loadedRef.current || !episodeId) return
    loadedRef.current = true
    let alive = true
    getEpisodeEngagement(episodeId)
      .then((e) => {
        if (!alive) return
        setEngagement(e)
        setSaveCount(e.saves)
        setShareCount(e.shares)
      })
      .catch(() => {})
    if (!commentsLoaded) {
      getEpisodeComments(episodeId)
        .then((c) => alive && (setComments(c), setCommentsLoaded(true)))
        .catch(() => {})
    }
    if (currentUser) {
      isItemSaved("episode", String(episodeId))
        .then((s) => alive && setSaved(s))
        .catch(() => {})
      isEpisodeLiked(episodeId)
        .then((l) => alive && setLiked(l))
        .catch(() => {})
      if (!hostIsSelf) {
        getFollowingIds()
          .then((ids) => {
            if (!alive) return
            setHostFollowing(ids.includes(show.host.id))
            setFollowKnown(true)
          })
          .catch(() => {})
      }
    }
    return () => {
      alive = false
    }
  }, [active, episodeId, currentUser, hostIsSelf, show.host.id, commentsLoaded])

  if (!episodeId) return null

  const shareTarget: ShareTarget = {
    type: "episode",
    key: String(episodeId),
    title: `${show.title} on Frequency`,
    subtitle: show.tagline,
    url: `/live/${show.id}`,
    image: show.cover,
    downloadUrl: show.videoUrl ?? null,
    downloadKind: show.videoUrl ? "video" : null,
  }

  function toggleLike() {
    if (!currentUser) return
    const next = !liked
    setLiked(next)
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)))
    startTransition(async () => {
      await setEpisodeLike({ episodeId: episodeId!, liked: next })
    })
  }

  function toggleSave() {
    if (!currentUser) return
    const next = !saved
    setSaved(next)
    setSaveCount((n) => Math.max(0, n + (next ? 1 : -1)))
    startTransition(async () => {
      try {
        const r = await toggleSaveItem(shareTarget)
        setSaved(r.saved)
      } catch {
        setSaved(!next)
        setSaveCount((n) => Math.max(0, n + (next ? -1 : 1)))
      }
    })
  }

  async function submitComment(text: string) {
    if (!currentUser) return
    await addEpisodeComment({ episodeId: episodeId!, text })
    setComments(await getEpisodeComments(episodeId!))
  }

  const commentCount = comments.length

  return (
    <section
      data-replay-slide
      data-index={index}
      className="relative h-[100dvh] w-full snap-start snap-always"
    >
      {/* The player fills the slide; portrait recordings letterbox on black. */}
      <div className="absolute inset-0">
        <LiveReplayPlayer show={show} variant="reel" autoPlay={active} />
      </div>

      {/* Bottom gradient so overlaid text/actions stay legible over any frame. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* Overlaid action rail — like / comment / share / save, reels-style.
          Sits well above the player's bottom time + scrubber so nothing overlaps. */}
      <div className="absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-2 z-20 flex flex-col items-center gap-4 text-white">
        <button
          onClick={toggleLike}
          disabled={!currentUser}
          className="tap-scale flex flex-col items-center gap-1 disabled:opacity-60"
          aria-pressed={liked}
          aria-label="Like replay"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            <Heart className={cn("size-6", liked && "fill-live text-live")} />
          </span>
          {likes > 0 && <span className="text-xs font-semibold tabular-nums">{formatCount(likes)}</span>}
        </button>

        <button
          onClick={() => setCommentsOpen(true)}
          className="tap-scale flex flex-col items-center gap-1"
          aria-label="View comments"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            <CommentIcon className="size-6" />
          </span>
          {commentCount > 0 && <span className="text-xs font-semibold tabular-nums">{formatCount(commentCount)}</span>}
        </button>

        <button
          onClick={() => setShareOpen(true)}
          className="tap-scale flex flex-col items-center gap-1"
          aria-label="Share replay"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            <Share2 className="size-6" />
          </span>
          {shareCount > 0 && <span className="text-xs font-semibold tabular-nums">{formatCount(shareCount)}</span>}
        </button>

        <button
          onClick={toggleSave}
          disabled={!currentUser}
          className="tap-scale flex flex-col items-center gap-1 disabled:opacity-60"
          aria-pressed={saved}
          aria-label="Save replay"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            <Bookmark className={cn("size-6", saved && "fill-white text-white")} />
          </span>
          {saveCount > 0 && <span className="text-xs font-semibold tabular-nums">{formatCount(saveCount)}</span>}
        </button>
      </div>

      {/* Overlaid title / creator / streamed-label, bottom-left. Lifted well
          above the player's bottom time + scrubber so the duration tracker is
          never hidden behind this overlay. */}
      <div className="absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-20 z-20 text-white">
        <div className="flex items-center gap-2">
          <Link href={`/u/${show.host.id}`} className="tap-scale shrink-0" aria-label={`View ${show.host.name}'s profile`}>
            <Avatar className="size-9 ring-1 ring-white/30">
              {show.host.avatar && <AvatarImage src={show.host.avatar || "/placeholder.svg"} alt={show.host.name} />}
              <AvatarFallback className="text-xs">{show.host.name[0]}</AvatarFallback>
            </Avatar>
          </Link>
          <div className="min-w-0">
            <Link href={`/u/${show.host.id}`} className="block truncate text-sm font-semibold hover:underline">
              {show.host.name}
            </Link>
            <p className="truncate text-xs text-white/70">{streamedLabel(show)}</p>
          </div>
          {currentUser && !hostIsSelf && followKnown && (
            <ProfileFollowButton
              targetUserId={show.host.id}
              targetName={show.host.name}
              initialFollowing={hostFollowing}
              className="ml-1 h-8 shrink-0 rounded-full px-3 text-xs"
            />
          )}
        </div>
        <h1 className="mt-2 line-clamp-2 text-pretty text-base font-semibold leading-snug">{show.title}</h1>
        {show.tagline && <p className="mt-0.5 line-clamp-1 text-sm text-white/70">{show.tagline}</p>}
      </div>

      {/* Comments open in the same sheet used elsewhere (portals above the reel). */}
      <CommentSheet
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        count={commentCount}
        comments={comments.map(toThreadComment)}
        currentUser={currentUser}
        onSubmit={submitComment}
        onLike={(commentId, likedNext) => void setEpisodeCommentLike({ commentId, liked: likedNext })}
        onReply={async (parentId, value) => {
          await addEpisodeComment({ episodeId: episodeId!, text: value, parentId })
          setComments(await getEpisodeComments(episodeId!))
        }}
        onEdit={async (commentId, value) => {
          await editEpisodeComment({ commentId, text: value })
          setComments(await getEpisodeComments(episodeId!))
        }}
        onDelete={async (commentId) => {
          await deleteEpisodeComment(commentId)
          setComments(await getEpisodeComments(episodeId!))
        }}
      />

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        target={shareTarget}
        onShared={() => setShareCount((n) => n + 1)}
      />
    </section>
  )
}
