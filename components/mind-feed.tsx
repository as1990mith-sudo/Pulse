"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Heart,
  MessageCircle,
  Repeat2,
  Plus,
  X,
  Send,
  UserPlus,
  UserCheck,
  Loader2,
  Trash2,
  MoreHorizontal,
  Pencil,
  Camera,
  Video,
  ImageIcon,
  Copy,
  Check,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Images,
  GripVertical,
} from "lucide-react"
import {
  addPostComment,
  createPost,
  deletePost,
  deletePostComment,
  editPost,
  editPostComment,
  getFeed,
  setCommentLike,
  setPostLike,
  toggleRepost as toggleRepostAction,
  type FeedCommentView,
  type FeedPostView,
  type PostMedia,
} from "@/app/actions/feed"
import { toggleSaveItem } from "@/app/actions/share"
import { CommentThread, type ThreadComment } from "@/components/comment-thread"
import { toggleFollow } from "@/app/actions/follow"
import type { CurrentUser } from "@/lib/session"
import { uploadMedia } from "@/lib/upload-media"
import { Button } from "@/components/ui/button"
import { FormattedTextarea } from "@/components/formatted-textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ImageLightbox } from "@/components/image-lightbox"
import { FeedVideo } from "@/components/feed-video"
import { ShareSheet } from "@/components/share-sheet"
import { FindProfiles } from "@/components/find-profiles"
import { PullToRefresh } from "@/components/pull-to-refresh"
import type { ShareTarget } from "@/lib/share-types"
import { cn } from "@/lib/utils"
import { haptic } from "@/lib/haptics"
import { linkify, extractFirstUrl } from "@/lib/linkify"
import { renderMessageBody } from "@/lib/rich-text"
import { LinkPreview } from "@/components/link-preview"

type DraftMedia = { url: string; type: "image" | "video" }

// Hard cap for uploaded clips: 15 minutes.
const MAX_VIDEO_SECONDS = 15 * 60

// Max number of media items in a single carousel post (Instagram-style).
const MAX_MEDIA = 10

/**
 * Reads a local video file's duration (in seconds) without uploading it, by
 * loading its metadata into a throwaway <video> element. Used to enforce the
 * 15-minute cap before the upload starts.
 */
function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement("video")
    v.preload = "metadata"
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(v.duration)
    }
    v.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Could not read video."))
    }
    v.src = url
  })
}

// Tiny seeded PRNG (mulberry32) so a given seed always yields the same order.
// This keeps the "For you" shuffle stable across SWR polls within a session
// while producing a brand-new order each time the app is loaded or reopened.
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Returns a new array shuffled deterministically from `seed` (Fisher–Yates). */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr]
  const rand = mulberry32(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Maps a feed comment into the shared CommentThread shape.
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
    edited: c.edited,
    postedAt: c.postedAt,
    createdAtMs: c.createdAtMs,
  }
}

export function MindFeed({ posts, currentUser }: { posts: FeedPostView[]; currentUser: CurrentUser | null }) {
  const router = useRouter()
  const [draft, setDraft] = useState("")
  const [media, setMedia] = useState<DraftMedia[]>([])
  const [uploading, setUploading] = useState(false)
  // Upload progress (0–100) for the file currently transferring; null when idle.
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Index currently being dragged in the reorder strip (null when not dragging).
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<"for-you" | "following" | "find">("for-you")
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Separate inputs so we can request the device camera directly: one for
  // capturing a photo and one for recording a video. The "capture" attribute
  // opens the camera on supported mobile devices and falls back to the normal
  // picker on desktop.
  const photoCaptureRef = useRef<HTMLInputElement>(null)
  const videoCaptureRef = useRef<HTMLInputElement>(null)

  // Poll the feed so new tweets and comments from others appear without a manual
  // refresh. The server-rendered posts seed the initial data.
  const { data: livePosts, mutate: mutateFeed } = useSWR("feed", () => getFeed(), {
    fallbackData: posts,
    refreshInterval: 5000,
    revalidateOnFocus: true,
  })
  const allPosts = livePosts ?? posts

  // Pull-to-refresh: revalidate whichever tab the user is on. The feed key backs
  // "For you"/"Following"; the "discover" keys back the Find tab's results.
  async function refreshFeed() {
    await globalMutate(
      (key) => key === "feed" || (Array.isArray(key) && key[0] === "discover"),
      undefined,
      { revalidate: true },
    )
  }

  // A fresh shuffle seed is created once per mount, so the "For you" order is
  // randomized every time the app is refreshed or closed and reopened, yet
  // stays stable while the user keeps scrolling (the 5s SWR polls reuse it).
  const [shuffleSeed] = useState(() => (Math.random() * 0x7fffffff) | 0)

  // IDs of posts the user just created this session. They're pinned to the very
  // top of "For you" (newest first) so a new post is always seen first, then the
  // shuffled feed follows beneath.
  const [pinnedIds, setPinnedIds] = useState<string[]>([])

  // "For you" → freshly posted items first, then shuffled. "Following" → newest-first.
  const forYouPosts = useMemo(() => {
    const shuffled = seededShuffle(allPosts, shuffleSeed)
    if (pinnedIds.length === 0) return shuffled
    const pinned = pinnedIds
      .map((id) => allPosts.find((p) => String(p.id) === id))
      .filter((p): p is (typeof allPosts)[number] => Boolean(p))
    const pinnedSet = new Set(pinnedIds)
    return [...pinned, ...shuffled.filter((p) => !pinnedSet.has(String(p.id)))]
  }, [allPosts, shuffleSeed, pinnedIds])
  const followingPosts = useMemo(
    () => allPosts.filter((p) => p.isFollowing).sort((a, b) => b.createdAtMs - a.createdAtMs),
    [allPosts],
  )

  const followingCount = followingPosts.length
  const visiblePosts = tab === "following" ? followingPosts : forYouPosts

  // Deep link support: when arriving with ?post=<id> (e.g. from a shared link),
  // make sure that post is in view, scroll to it, and briefly highlight it so
  // the link lands on the exact post that was shared — not just the feed top.
  const [highlightedPost, setHighlightedPost] = useState<string | null>(null)
  useEffect(() => {
    if (typeof window === "undefined") return
    const targetId = new URLSearchParams(window.location.search).get("post")
    if (!targetId) return
    // Make sure we're on a tab that can show the post.
    if (!allPosts.some((p) => String(p.id) === targetId)) return
    if (tab === "following" && !allPosts.find((p) => String(p.id) === targetId)?.isFollowing) {
      setTab("for-you")
    }
    const t = setTimeout(() => {
      const el = document.getElementById(`post-${targetId}`)
      if (!el) return
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      setHighlightedPost(targetId)
      setTimeout(() => setHighlightedPost(null), 2400)
    }, 250)
    return () => clearTimeout(t)
    // Run once on mount; allPosts is seeded from SSR so the target is present.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleMediaPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setError(null)

    const remaining = MAX_MEDIA - media.length
    if (remaining <= 0) {
      setError(`You can attach up to ${MAX_MEDIA} items per post.`)
      e.target.value = ""
      return
    }
    const selected = files.slice(0, remaining)
    const droppedForCap = files.length > selected.length

    setUploading(true)
    try {
      const uploaded: DraftMedia[] = []
      for (const file of selected) {
        const isVideo = file.type.startsWith("video/")
        const isImage = file.type.startsWith("image/")
        if (!isVideo && !isImage) {
          setError("Please choose photos or videos only.")
          continue
        }
        // Enforce the 15-minute video cap before uploading anything.
        if (isVideo) {
          const duration = await getVideoDuration(file).catch(() => 0)
          if (duration > MAX_VIDEO_SECONDS + 1) {
            const mins = Math.floor(duration / 60)
            const secs = Math.round(duration % 60)
            setError(`Videos can be up to 15 minutes. A clip was ${mins}m ${secs}s — please trim it and try again.`)
            continue
          }
        }
        setUploadPct(0)
        const data = await uploadMedia(file, "chat", undefined, setUploadPct)
        uploaded.push({ url: data.url, type: isVideo ? "video" : "image" })
      }
      if (uploaded.length > 0) setMedia((prev) => [...prev, ...uploaded].slice(0, MAX_MEDIA))
      if (droppedForCap) setError(`Only the first ${MAX_MEDIA} items were added (max ${MAX_MEDIA} per post).`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.")
    } finally {
      setUploading(false)
      setUploadPct(null)
      // Reset the originating input so picking the same file again re-fires.
      e.target.value = ""
    }
  }

  function removeMediaAt(index: number) {
    setMedia((prev) => prev.filter((_, i) => i !== index))
  }

  function clearMedia() {
    setMedia([])
    if (fileInputRef.current) fileInputRef.current.value = ""
    if (photoCaptureRef.current) photoCaptureRef.current.value = ""
    if (videoCaptureRef.current) videoCaptureRef.current.value = ""
  }

  // Drag-to-reorder: move the dragged thumbnail to the drop target's slot.
  function reorderMedia(from: number, to: number) {
    if (from === to) return
    setMedia((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  function publish(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text && media.length === 0) return
    startTransition(async () => {
      const created = await createPost({ text, media })
      setDraft("")
      clearMedia()
      // Pin the new post to the top of "For you" and make sure we're on a tab
      // that shows it, so the user sees their post appear first immediately.
      if (created?.id != null) {
        const newId = String(created.id)
        setPinnedIds((prev) => [newId, ...prev.filter((id) => id !== newId)])
      }
      setTab("for-you")
      await mutateFeed()
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" })
      }
    })
  }

  if (!currentUser) {
    return (
      <div>
        <Card className="mx-4 flex flex-col items-center gap-3 p-8 text-center sm:mx-0">
          <p className="text-lg font-semibold">Join the conversation</p>
          <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
            Create a free account to post photos and videos, reply to others, and like posts. Your name shows on
            everything you share.
          </p>
          <div className="flex gap-2">
            <Button render={<Link href="/sign-up" />} nativeButton={false}>
              Create account
            </Button>
            <Button render={<Link href="/sign-in" />} nativeButton={false} variant="secondary">
              Sign in
            </Button>
          </div>
        </Card>

        <ul className="stagger mt-6 flex flex-col gap-2 border-y border-border/60 bg-border/40">
          {allPosts.map((post) => (
            <li key={post.id}>
              <PostCard
                post={post}
                currentUser={currentUser}
                variant="feed"
                highlighted={highlightedPost === String(post.id)}
              />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <PullToRefresh onRefresh={refreshFeed}>
      <div className="border-y border-border/60 bg-gradient-to-b from-card/60 to-background px-4 py-5 sm:px-5">
        <form onSubmit={publish} className="flex gap-4">
          <Avatar className="size-12 shrink-0 ring-2 ring-border/60">
            {currentUser.image && <AvatarImage src={currentUser.image || "/placeholder.svg"} alt={currentUser.name} />}
            <AvatarFallback className={currentUser.color}>{currentUser.initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-3">
            <FormattedTextarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Share a thought…"
              className="min-h-24 resize-none rounded-xl border border-border bg-background px-3.5 py-3 text-lg leading-relaxed shadow-sm placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label="Write a post"
            />
            {media.length === 1 && (
              <div className="relative w-full overflow-hidden rounded-xl border border-border/60 bg-muted">
                {media[0].type === "video" ? (
                  <video src={media[0].url} controls playsInline className="max-h-[420px] w-full" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={media[0].url || "/placeholder.svg"} alt="Selected upload preview" className="max-h-[420px] w-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={clearMedia}
                  className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background"
                  aria-label="Remove media"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}

            {media.length > 1 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GripVertical className="size-3.5" />
                  <span>
                    Drag to reorder — the <span className="font-medium text-foreground">first item</span> leads your post.
                  </span>
                  <span className="ml-auto tabular-nums">{media.length}/{MAX_MEDIA}</span>
                </p>
                <ul className="flex flex-wrap gap-2">
                  {media.map((item, index) => (
                    <li
                      key={item.url}
                      draggable
                      onDragStart={() => setDragIndex(index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragIndex !== null) reorderMedia(dragIndex, index)
                        setDragIndex(null)
                      }}
                      onDragEnd={() => setDragIndex(null)}
                      className={cn(
                        "group relative size-20 cursor-grab overflow-hidden rounded-xl border bg-muted shadow-sm transition-all active:cursor-grabbing",
                        dragIndex === index
                          ? "scale-95 border-primary opacity-60 ring-2 ring-primary"
                          : "border-border/60 hover:border-primary/50",
                      )}
                    >
                      {item.type === "video" ? (
                        <video src={item.url} muted playsInline className="size-full object-cover" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.url || "/placeholder.svg"} alt={`Upload ${index + 1}`} className="size-full object-cover" />
                      )}
                      {/* Order badge — leading item highlighted in brand color. */}
                      <span
                        className={cn(
                          "absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full text-[10px] font-bold shadow-sm",
                          index === 0 ? "bg-primary text-primary-foreground" : "bg-black/70 text-white",
                        )}
                      >
                        {index + 1}
                      </span>
                      {item.type === "video" && (
                        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                          Video
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeMediaAt(index)}
                        className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 backdrop-blur transition-opacity hover:bg-background group-hover:opacity-100"
                        aria-label={`Remove item ${index + 1}`}
                      >
                        <X className="size-3" />
                      </button>
                    </li>
                  ))}
                  {/* Add-more tile */}
                  {media.length < MAX_MEDIA && (
                    <li>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex size-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/70 bg-background text-muted-foreground transition-colors hover:border-primary/70 hover:text-foreground disabled:opacity-50"
                        aria-label="Add more media"
                      >
            {uploading ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
            <span className="text-[10px] font-medium">
              {uploading ? (uploadPct !== null ? `${uploadPct}%` : "…") : "Add"}
            </span>
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex items-center justify-between">
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={uploading}
                  render={
                    <button
                      type="button"
                      aria-label="Add a photo or video"
                      className="inline-flex size-9 items-center justify-center rounded-full bg-foreground/10 text-foreground outline-none transition-all hover:bg-foreground hover:text-background focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:opacity-50"
                    />
                  }
                >
                  {uploading ? (
                    uploadPct !== null ? (
                      <span className="text-[10px] font-semibold tabular-nums">{uploadPct}%</span>
                    ) : (
                      <Loader2 className="size-5 animate-spin" />
                    )
                  ) : (
                    <Plus className="size-5" />
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => photoCaptureRef.current?.click()} className="gap-2">
                    <Camera className="size-4" /> Take photo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => videoCaptureRef.current?.click()} className="gap-2">
                    <Video className="size-4" /> Record video
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="gap-2">
                    <ImageIcon className="size-4" /> Upload from library
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Library picker (photos + videos, multi-select) */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={handleMediaPick}
              />
              {/* Camera photo capture */}
              <input
                ref={photoCaptureRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleMediaPick}
              />
              {/* Camera video capture */}
              <input
                ref={videoCaptureRef}
                type="file"
                accept="video/*"
                capture="environment"
                className="hidden"
                onChange={handleMediaPick}
              />
              <Button
                type="submit"
                size="lg"
                disabled={isPending || uploading || (!draft.trim() && media.length === 0)}
                className="gap-2 rounded-full bg-foreground px-6 font-semibold text-background hover:bg-foreground/90"
              >
                <Send className="size-4" /> {isPending ? "Posting…" : "Post"}
              </Button>
            </div>
          </div>
        </form>
      </div>

      {/* Sticky segmented tabs that blend into the feed */}
      <div className="sticky top-0 z-10 flex items-center border-b border-border/60 bg-background/85 backdrop-blur">
        <button
          onClick={() => setTab("for-you")}
          className={cn(
            "relative flex-1 px-3 py-4 text-[15px] font-semibold transition-colors",
            tab === "for-you" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={tab === "for-you"}
        >
          For you
          {tab === "for-you" && <span className="absolute inset-x-0 -bottom-px mx-auto h-1 w-14 rounded-full bg-primary" />}
        </button>
        <button
          onClick={() => setTab("following")}
          className={cn(
            "relative flex-1 whitespace-nowrap px-3 py-4 text-[15px] font-semibold transition-colors",
            tab === "following" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={tab === "following"}
        >
          Following{followingCount > 0 ? ` (${followingCount})` : ""}
          {tab === "following" && <span className="absolute inset-x-0 -bottom-px mx-auto h-1 w-14 rounded-full bg-primary" />}
        </button>
        <button
          onClick={() => setTab("find")}
          className={cn(
            "relative flex-1 px-3 py-4 text-[15px] font-semibold transition-colors",
            tab === "find" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={tab === "find"}
        >
          Find
          {tab === "find" && <span className="absolute inset-x-0 -bottom-px mx-auto h-1 w-14 rounded-full bg-primary" />}
        </button>
      </div>

      {tab === "find" ? (
        <FindProfiles />
      ) : visiblePosts.length > 0 ? (
        <ul className="stagger flex flex-col gap-2 border-b border-border/60 bg-border/40">
          {visiblePosts.map((post) => (
            <li key={post.id}>
              <PostCard
                post={post}
                currentUser={currentUser}
                variant="feed"
                highlighted={highlightedPost === String(post.id)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <Card className="m-4 p-8 text-center sm:mx-0">
          <p className="text-sm text-muted-foreground leading-relaxed">
            You&apos;re not following anyone yet. Tap <span className="font-medium text-foreground">Follow</span> on a
            post to see their thoughts here, or use the{" "}
            <button onClick={() => setTab("find")} className="font-medium text-primary underline-offset-2 hover:underline">
              Find
            </button>{" "}
            tab to discover people.
          </p>
        </Card>
      )}
    </PullToRefresh>
  )
}

/**
 * Instagram-style media for a post. A single item renders as before (image
 * opens a lightbox, video plays inline). Multiple items become a horizontal,
 * scroll-snapping carousel you swipe left/right, with dot indicators, a
 * "1/N" counter, a multi-media badge, and desktop arrow controls.
 */
function PostMediaCarousel({
  items,
  feed,
  authorName,
}: {
  items: PostMedia[]
  feed: boolean
  authorName: string
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const multiple = items.length > 1
  // Cap every media frame at a 1080×1920 (9:16 portrait) ratio: `177.778cqw`
  // equals the slide width × 1920/1080, so anything taller than 9:16 is clamped
  // and cropped (via object-cover) into the frame, while landscape/square media
  // — which is shorter than the cap — displays uncropped. The svh/px cap still
  // applies so media never exceeds the viewport.
  const heightClass = feed ? "max-h-[min(85svh,177.778cqw)]" : "max-h-[min(640px,177.778cqw)]"

  // Track which slide is centered as the user swipes, so the dots/counter stay
  // in sync. We derive the index from scrollLeft rather than IntersectionObserver
  // to keep it simple and snappy on touch.
  function onScroll() {
    const el = scrollerRef.current
    if (!el) return
    const idx = Math.round(el.scrollLeft / el.clientWidth)
    if (idx !== active) setActive(Math.max(0, Math.min(items.length - 1, idx)))
  }

  function goTo(index: number) {
    const el = scrollerRef.current
    if (!el) return
    const clamped = Math.max(0, Math.min(items.length - 1, index))
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" })
  }

  return (
    <div className="relative bg-black">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className={cn(
          "flex w-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          // Allow BOTH axes: horizontal swipes move the carousel, while vertical
          // swipes pass through to scroll the feed. (`pan-x` alone would suppress
          // vertical gestures that start over the carousel, trapping the scroll.)
          multiple && "[touch-action:pan-x_pan-y]",
        )}
      >
        {items.map((item, i) => (
          <div key={i} className="@container w-full shrink-0 snap-center snap-always">
            {item.type === "video" ? (
              <FeedVideo src={item.url} className={cn("mx-auto w-full object-cover", heightClass)} />
            ) : (
              <button
                type="button"
                onClick={() => setLightbox(item.url)}
                className="block w-full bg-muted transition-opacity hover:opacity-95"
                aria-label={`Expand image ${i + 1} of ${items.length} to full screen`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url || "/placeholder.svg"}
                  alt={`Post attachment ${i + 1} of ${items.length}`}
                  className={cn("mx-auto w-full object-cover", heightClass)}
                />
              </button>
            )}
          </div>
        ))}
      </div>

      {multiple && (
        <>
          {/* Soft scrims keep the counter and dots legible over bright media. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/35 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent" />

          {/* Counter + multi-media badge (top-right), like Instagram. */}
          <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold tabular-nums text-white shadow-sm backdrop-blur-sm">
            <Images className="size-3.5" />
            {active + 1}/{items.length}
          </div>

          {/* Dot indicators (bottom-center). */}
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5">
            {items.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full shadow-sm transition-all duration-300",
                  i === active ? "w-4 bg-white" : "w-1.5 bg-white/55",
                )}
              />
            ))}
          </div>

          {/* Desktop arrow controls (hidden on touch-first small screens). */}
          {active > 0 && (
            <button
              type="button"
              onClick={() => goTo(active - 1)}
              aria-label="Previous media"
              className="absolute left-2 top-1/2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/70 sm:flex"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
          {active < items.length - 1 && (
            <button
              type="button"
              onClick={() => goTo(active + 1)}
              aria-label="Next media"
              className="absolute right-2 top-1/2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/70 sm:flex"
            >
              <ChevronRight className="size-5" />
            </button>
          )}
        </>
      )}

      {lightbox && (
        <ImageLightbox src={lightbox} alt={`Image posted by ${authorName}`} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}

export function PostCard({
  post,
  currentUser,
  variant = "card",
  highlighted = false,
}: {
  post: FeedPostView
  currentUser: CurrentUser | null
  // "feed" blends edge-to-edge into the immersive scroll; "card" keeps the
  // boxed look used on profile pages.
  variant?: "card" | "feed"
  // Briefly ring the card when it's the deep-linked target of a shared link.
  highlighted?: boolean
}) {
  const feed = variant === "feed"
  const router = useRouter()
  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(post.likes)
  const [likeBurst, setLikeBurst] = useState(false)
  const [reposted, setReposted] = useState(post.reposted)
  const [reposts, setReposts] = useState(post.reposts)
  const [saved, setSaved] = useState(post.saved)
  const [saveBurst, setSaveBurst] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // Post tab only: measures whether the caption overflows its line clamp so we
  // know when to fade it into a "Read more" toggle.
  const textWrapRef = useRef<HTMLDivElement>(null)
  const [clampable, setClampable] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [commentDraft, setCommentDraft] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editDraft, setEditDraft] = useState(post.text)
  const [copied, setCopied] = useState(false)
  const [edited, setEdited] = useState(post.edited)
  const [text, setText] = useState(post.text)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      await deletePost(post.id)
      setDeleted(true)
      await globalMutate("feed")
      router.refresh()
    })
  }

  function startEditing() {
    setEditDraft(text)
    setIsEditing(true)
  }

  function copyPost() {
    if (!text) return
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  function handleEditSave() {
    const next = editDraft.trim()
    // Require some text unless the post carries media.
    if (!next && !post.image && !post.video) return
    startTransition(async () => {
      await editPost({ postId: post.id, text: next })
      setText(next)
      setEdited(true)
      setIsEditing(false)
      await globalMutate("feed")
      router.refresh()
    })
  }

  function toggleLike() {
    if (!currentUser) return
    const next = !liked
    setLiked(next)
    setLikes((n) => (next ? n + 1 : n - 1))
    // Trigger the springy pop only when liking (not when un-liking).
    if (next) {
      haptic("light")
      setLikeBurst(false)
      // Re-arm on the next frame so the animation replays on rapid taps.
      requestAnimationFrame(() => setLikeBurst(true))
    }
    startTransition(async () => {
      await setPostLike({ postId: post.id, liked: next })
    })
  }

  function toggleRepost() {
    if (!currentUser) return
    const next = !reposted
    // Optimistic update, reconciled with the server's authoritative count.
    setReposted(next)
    setReposts((n) => (next ? n + 1 : n - 1))
    startTransition(async () => {
      try {
        const res = await toggleRepostAction(post.id)
        setReposted(res.reposted)
        setReposts(res.reposts)
        await globalMutate("feed")
      } catch {
        // Roll back on failure.
        setReposted(!next)
        setReposts((n) => (next ? n - 1 : n + 1))
      }
    })
  }

  function toggleSave() {
    if (!currentUser) return
    const next = !saved
    setSaved(next) // optimistic
    if (next) {
      haptic("light")
      setSaveBurst(true) // delightful pop only when saving (not un-saving)
    }
    startTransition(async () => {
      try {
        const res = await toggleSaveItem(shareTarget)
        setSaved(res.saved)
        router.refresh()
      } catch {
        setSaved(!next)
      }
    })
  }

  const shareTarget: ShareTarget = {
    type: "post",
    key: String(post.id),
    title: `${post.user} on Frequency`,
    subtitle: post.text ? post.text.slice(0, 120) : null,
    url: `/feed?post=${post.id}`,
    image: post.image ?? post.video ?? null,
    downloadUrl: post.image ?? post.video ?? null,
    downloadKind: post.image ? "image" : post.video ? "video" : null,
  }

  function submitComment(e: React.FormEvent) {
    e.preventDefault()
    const text = commentDraft.trim()
    if (!text || !currentUser) return
    startTransition(async () => {
      await addPostComment({ postId: post.id, text })
      setCommentDraft("")
      setShowComments(true)
      // Refresh the polled feed (used on the Tweet tab) and the server tree
      // (used on profile pages where the feed isn't polled).
      await globalMutate("feed")
      router.refresh()
    })
  }

  function handleCommentLike(commentId: number, liked: boolean) {
    void setCommentLike({ commentId, liked })
  }

  async function handleCommentReply(parentId: number, value: string) {
    await addPostComment({ postId: post.id, text: value, parentId })
    await globalMutate("feed")
    router.refresh()
  }

  async function handleCommentEdit(commentId: number, value: string) {
    await editPostComment({ commentId, text: value })
    await globalMutate("feed")
    router.refresh()
  }

  async function handleCommentDelete(commentId: number) {
    await deletePostComment(commentId)
    await globalMutate("feed")
    router.refresh()
  }

  // Normalized ordered media list (handles legacy single image/video too).
  const mediaItems: PostMedia[] =
    post.media && post.media.length > 0
      ? post.media
      : post.image
        ? [{ type: "image", url: post.image }]
        : post.video
          ? [{ type: "video", url: post.video }]
          : []
  const hasMedia = mediaItems.length > 0

  // Captions fade into an inline "Read more" toggle based on line count — after
  // the first line when the post carries media, or after 11 lines for a
  // text-only post. Line height here is 1.25 (leading-tight).
  const POST_LINE_HEIGHT = 1.25
  const clampLines = hasMedia ? 1 : 11
  const collapsedMaxEm = clampLines * POST_LINE_HEIGHT
  // A clamped, un-expanded caption that actually overflows shows the fade.
  const isClamped = clampable && !expanded
  // The fade blends into whatever sits behind the caption: the immersive feed
  // is edge-to-edge on the page background, the boxed card uses the card color.
  const fadeFromClass = feed ? "from-background" : "from-card"

  // Measure the caption against its collapsed height so we only show "Read more"
  // (and the fade) when the text is genuinely longer than the clamp.
  useEffect(() => {
    const el = textWrapRef.current
    if (!el) {
      setClampable(false)
      return
    }
    const lineHeightPx = collapsedMaxEm * Number.parseFloat(getComputedStyle(el).fontSize || "16")
    setClampable(el.scrollHeight > lineHeightPx + 2)
  }, [text, collapsedMaxEm, expanded])

  // The first link in the post (if any) gets a rich preview card rendered below
  // the text, with the bare link beneath it.
  const previewUrl = text ? extractFirstUrl(text) : null
  // When the post body is just the link itself, we hide the raw text and let the
  // preview card carry it (it renders the link beneath the card).
  const textIsOnlyLink = !!previewUrl && text.trim().split(/\s+/).length === 1

  if (deleted) return null

  return (
    <article
      id={`post-${post.id}`}
      className={cn(
        "overflow-hidden scroll-mt-24 transition-shadow",
        feed
          ? "cv-auto bg-background"
          : "rounded-xl border border-border bg-card text-card-foreground",
        highlighted && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      {/* Header */}
      <div className={cn("flex items-center justify-between gap-2", feed ? "px-4 py-3" : "px-3 py-3")}>
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/u/${post.authorId}`} aria-label={`View ${post.user}'s profile`} className="shrink-0">
            <Avatar className={cn(feed ? "size-12 ring-2 ring-border/60" : "size-9")}>
              {post.authorImage && <AvatarImage src={post.authorImage || "/placeholder.svg"} alt={post.user} />}
              <AvatarFallback className={cn(feed ? "text-sm" : "text-xs", post.color)}>{post.initials}</AvatarFallback>
            </Avatar>
          </Link>
          <div className="flex min-w-0 flex-col leading-tight">
            <Link
              href={`/u/${post.authorId}`}
              className={cn("truncate font-semibold hover:underline", feed ? "text-base" : "text-sm")}
            >
              {post.user}
            </Link>
            <span className={cn("truncate text-muted-foreground", feed ? "text-sm" : "text-xs")}>
              {post.handle} · {post.postedAt}
              {/* Modern social style: the edited marker lives in the header
                  metadata line next to the timestamp for every post type. */}
              {edited && " · Edited"}
            </span>
          </div>
        </div>
        {/* Aligned to the top (username line) rather than centered, so the
            follow icon doesn't hover over — and visually truncate — the second
            metadata line that carries the "· Edited" tag on longer usernames. */}
        <div className="flex shrink-0 items-center gap-1 self-start">
          {currentUser && !post.isSelf && (
            <FollowButton authorId={post.authorId} authorName={post.user} initialFollowing={post.isFollowing} />
          )}
          {(text || post.isSelf) && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label="Post options"
                    className="rounded-full p-1.5 text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  />
                }
              >
                <MoreHorizontal className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {text && (
                  <DropdownMenuItem onClick={copyPost} className="gap-2">
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? "Copied" : "Copy text"}
                  </DropdownMenuItem>
                )}
                {currentUser && post.isSelf && (
                  <>
                    <DropdownMenuItem onClick={startEditing} className="gap-2">
                      <Pencil className="size-4" /> Edit post
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setConfirmDelete(true)}
                      className="gap-2"
                    >
                      <Trash2 className="size-4" /> Delete post
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className="mx-3 mb-2 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-sm text-foreground">Delete this post?</p>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
            </Button>
          </div>
        </div>
      )}

      {/* Caption — shown above the media, or an inline editor while editing */}
      {isEditing ? (
        <div className={cn("pb-3", feed ? "px-4" : "px-3")}>
          <FormattedTextarea
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            placeholder="Edit your post…"
            autoFocus
            className="min-h-24 resize-none text-[15px] leading-relaxed"
            aria-label="Edit post text"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setIsEditing(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleEditSave}
              disabled={isPending || (!editDraft.trim() && !post.image && !post.video)}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        (text || previewUrl) && (
          <div
            className={cn(
              "text-foreground/90",
              feed ? "px-4 text-base" : "px-3 text-[13px]",
              hasMedia ? "pb-3" : "pb-1",
            )}
          >
            {/* When the post is nothing but a link, skip the raw text and let the
                preview card (which shows the link below it) stand on its own. */}
            {text && !textIsOnlyLink && (
              <>
                {/* Clamp by line count and fade directly into an inline "Read
                    more" on the last visible line — 1 line when the post has
                    media, 11 lines for text-only posts. */}
                <div
                  ref={textWrapRef}
                  className={cn("relative", isClamped && "overflow-hidden", clampable && expanded && "cursor-pointer")}
                  style={isClamped ? { maxHeight: `${collapsedMaxEm}em` } : undefined}
                  onClick={
                    clampable && expanded
                      ? (e) => {
                          // Collapse when tapping the body text, but let real
                          // links inside the caption open as normal.
                          if (!(e.target as HTMLElement).closest("a")) setExpanded(false)
                        }
                      : undefined
                  }
                >
                  {(() => {
                    const paras = text.split(/\n{2,}/)
                    return paras.map((para, i) => (
                      <p key={i} className={cn("whitespace-pre-wrap leading-tight", i > 0 && "mt-1.5")}>
                        {renderMessageBody(para, {
                          link: true,
                          linkClassName:
                            "font-medium text-primary underline-offset-2 [overflow-wrap:anywhere] hover:underline",
                        })}
                      </p>
                    ))
                  })()}
                  {isClamped && (
                    // Sits on the last visible line; the text fades directly
                    // into the "Read more" link via the horizontal gradient.
                    <button
                      type="button"
                      onClick={() => setExpanded(true)}
                      className={cn(
                        "absolute bottom-0 right-0 flex items-baseline pl-14 font-semibold leading-tight text-muted-foreground transition-colors hover:text-foreground bg-gradient-to-l to-transparent from-50%",
                        feed ? "text-sm" : "text-xs",
                        fadeFromClass,
                      )}
                    >
                      <span aria-hidden className="text-foreground/90">…&nbsp;</span>
                      Read more
                    </button>
                  )}
                </div>
              </>
            )}

            {previewUrl && <LinkPreview url={previewUrl} className={cn(text && !textIsOnlyLink && "mt-3")} />}
          </div>
        )
      )}

      {/* Media — large, edge-to-edge Instagram-style (swipeable when multiple) */}
      {hasMedia && <PostMediaCarousel items={mediaItems} feed={feed} authorName={post.user} />}

      {/* Actions — each count sits to the right of its button */}
      <div
        className={cn(
          "flex items-center text-foreground",
              feed ? "gap-6 px-4 pb-3 pt-4" : "gap-5 px-3 pb-3 pt-3",
        )}
      >
        <button
          onClick={toggleLike}
          className={cn(
            "flex items-center gap-1.5 tabular-nums transition-colors hover:text-primary",
            feed ? "text-[15px]" : "text-sm",
            liked && "text-primary",
            !currentUser && "cursor-not-allowed opacity-60",
          )}
          aria-pressed={liked}
          aria-label="Like"
        >
          <Heart
            onAnimationEnd={() => setLikeBurst(false)}
            className={cn(feed ? "size-7" : "size-6", liked && "fill-current", likeBurst && "animate-like-pop")}
          />
          {likes > 0 && <span>{likes}</span>}
        </button>

        <button
          onClick={() => setShowComments((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 tabular-nums transition-colors hover:text-muted-foreground",
            feed ? "text-[15px]" : "text-sm",
          )}
          aria-label="Toggle comments"
        >
          <MessageCircle className={cn(feed ? "size-7" : "size-6")} />
          {post.comments.length > 0 && <span>{post.comments.length}</span>}
        </button>

        <button
          onClick={toggleRepost}
          className={cn(
            "flex items-center gap-1.5 tabular-nums transition-colors hover:text-chart-2",
            feed ? "text-[15px]" : "text-sm",
            reposted && "text-chart-2",
            !currentUser && "cursor-not-allowed opacity-60",
          )}
          aria-pressed={reposted}
          aria-label="Repost"
        >
          <Repeat2 className={cn(feed ? "size-7" : "size-6")} />
          {reposts > 0 && <span>{reposts}</span>}
        </button>

        <button
          onClick={toggleSave}
          className={cn(
            "ml-auto flex items-center transition-colors hover:text-primary",
            saved && "text-primary",
            !currentUser && "cursor-not-allowed opacity-60",
          )}
          aria-pressed={saved}
          aria-label={saved ? "Remove bookmark" : "Save post"}
        >
          <Bookmark
            onAnimationEnd={() => setSaveBurst(false)}
            className={cn(feed ? "size-7" : "size-6", saved && "fill-current", saveBurst && "motion-pop")}
          />
        </button>

        <button
          onClick={() => setShareOpen(true)}
          className={cn(
            "flex items-center gap-1.5 tabular-nums transition-colors hover:text-muted-foreground",
            feed ? "text-[15px]" : "text-sm",
          )}
          aria-label="Share"
        >
          <Send className={cn(feed ? "size-7" : "size-6")} />
        </button>
      </div>

      {showComments && (
        <div className="space-y-4 px-3 pb-4">
          <Separator />

          {currentUser ? (
            <form onSubmit={submitComment} className="flex items-start gap-2">
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className={cn("text-xs", currentUser.color)}>{currentUser.initials}</AvatarFallback>
              </Avatar>
              <FormattedTextarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="Add a comment..."
                className="min-h-10 resize-none"
                aria-label="Write a reply"
              />
              <Button type="submit" size="icon" disabled={isPending || !commentDraft.trim()} aria-label="Send reply">
                <Send className="size-4" />
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Link href="/sign-in" className="font-medium text-primary hover:underline">
                Sign in
              </Link>{" "}
              to reply.
            </p>
          )}

          <CommentThread
            comments={post.comments.map(toThreadComment)}
            canInteract={!!currentUser}
            showCopy={false}
            enforceTimeWindows={false}
            onLike={handleCommentLike}
            onReply={handleCommentReply}
            onEdit={handleCommentEdit}
            onDelete={handleCommentDelete}
          />
        </div>
      )}

      <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />
    </article>
  )
}

function FollowButton({
  authorId,
  authorName,
  initialFollowing,
}: {
  authorId: string
  authorName: string
  initialFollowing: boolean
}) {
  const router = useRouter()
  const [following, setFollowing] = useState(initialFollowing)
  const [followBurst, setFollowBurst] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onClick() {
    const next = !following
    setFollowing(next)
    if (next) {
      haptic("medium")
      setFollowBurst(true) // delightful pop only when following
    }
    startTransition(async () => {
      try {
        await toggleFollow({ targetUserId: authorId, follow: next })
        router.refresh()
      } catch {
        setFollowing(!next)
      }
    })
  }

  return (
    <Button
      type="button"
      size="icon"
      variant={following ? "secondary" : "default"}
      onClick={onClick}
      disabled={isPending}
      className="size-8 shrink-0 rounded-full"
      aria-label={following ? `Unfollow ${authorName}` : `Follow ${authorName}`}
      title={following ? "Following" : "Follow"}
    >
      <span
        onAnimationEnd={() => setFollowBurst(false)}
        className={cn("inline-flex", followBurst && "motion-pop")}
      >
        {following ? <UserCheck className="size-4" /> : <UserPlus className="size-4" />}
      </span>
    </Button>
  )
}
