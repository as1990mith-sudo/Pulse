"use client"

import { memo, useEffect, useMemo, useRef, useState, useTransition } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Heart,
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
  Flag,
  Maximize2,
  AtSign,
  UserX,
} from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
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
  type FeedCommentView,
  type FeedPostView,
  type PostMedia,
} from "@/app/actions/feed"
import { toggleSaveItem } from "@/app/actions/share"
import { removeMyMention, reportMention } from "@/app/actions/mentions"
import { toast } from "sonner"
import { type ThreadComment } from "@/components/comment-thread"
import { CommentSheet } from "@/components/comment-sheet"
import { toggleFollow } from "@/app/actions/follow"
import type { CurrentUser } from "@/lib/session"
import { Button } from "@/components/ui/button"
import { FormattedTextarea } from "@/components/formatted-textarea"
import { useMentionAutocomplete, MentionAutocompleteList } from "@/components/mention-autocomplete"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ReportReasonModal } from "@/components/report-reason-modal"
import { ImageLightbox } from "@/components/image-lightbox"
import { ImmersiveImageViewer } from "@/components/immersive-image-viewer"
import { FeedVideo } from "@/components/feed-video"
import { ReelsFeed } from "@/components/reels-feed"
import { useMediaAspect, FEED_PREVIEW_MIN_RATIO } from "@/hooks/use-media-aspect"
import { StatusBar } from "@/components/status-bar"
import type { StatusGroup } from "@/app/actions/status"
import { ShareSheet } from "@/components/share-sheet"
import { EngagementSheet } from "@/components/engagement-sheet"
import { PullToRefresh } from "@/components/pull-to-refresh"
import type { ShareTarget } from "@/lib/share-types"
import { cn } from "@/lib/utils"
import { haptic } from "@/lib/haptics"

/** Posts can be edited only within this window after publishing. */
const EDIT_WINDOW_MS = 15 * 60 * 1000

/** True when `createdAtMs` is less than 15 minutes before now. */
function isWithinEditWindow(createdAtMs: number): boolean {
  return Date.now() - createdAtMs < EDIT_WINDOW_MS
}

/**
 * Shared modern popup styling so the post-options and media-upload menus look
 * cohesive: rounded-2xl, translucent blurred surface, hairline border, soft
 * shadow, and a fade + scale open/close transition (from the primitive).
 */
const POPUP_MENU_CONTENT =
  "w-56 rounded-2xl border border-white/10 bg-popover/85 p-1.5 shadow-2xl backdrop-blur-xl"

/**
 * Roomy, aligned rows with consistent w-5/h-5 icons. The primitive already
 * supplies a subtle highlight on hover/keyboard focus; we add a press state
 * and larger rounding to match the modern card.
 */
const POPUP_MENU_ITEM =
  "gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors active:bg-white/10 [&_svg]:size-5"
import { linkify, extractFirstUrl } from "@/lib/linkify"
import { renderMessageBody } from "@/lib/rich-text"
import { LinkPreview } from "@/components/link-preview"
import { AnnouncementBanner } from "@/components/announcement-banner"
import type { AnnouncementView } from "@/app/actions/announcements"
import { MediaEditorFlow, type EditedMedia } from "@/components/media-editor/media-editor-flow"
import { EditedIndicator } from "@/components/edited-indicator"

type DraftMedia = {
  url: string
  type: "image" | "video"
  coverImageUrl?: string
  trimStart?: number
  trimEnd?: number
}

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
    liked: c.liked,
    edited: c.edited,
    postedAt: c.postedAt,
    createdAtMs: c.createdAtMs,
  }
}

/**
 * Memoized list row for the feed. MindFeed holds a lot of high-frequency state
 * (composer draft on every keystroke, upload progress, menus, tab), and without
 * memoization every one of those updates re-rendered every PostCard — each of
 * which mounts media/video. Because the props here are all stable (the `post`
 * object identity only changes when the feed data actually changes, and the
 * other props are a prop, a constant, and a rarely-flipped boolean), memo lets
 * React skip the entire PostCard subtree on unrelated parent updates.
 */
const FeedPostItem = memo(function FeedPostItem({
  post,
  currentUser,
  highlighted,
}: {
  post: FeedPostView
  currentUser: CurrentUser | null
  highlighted: boolean
}) {
  return <PostCard post={post} currentUser={currentUser} variant="feed" highlighted={highlighted} />
})

export function MindFeed({
  posts,
  currentUser,
  statusGroups = [],
  announcements = [],
  myRequests = [],
  isAdmin = false,
}: {
  posts: FeedPostView[]
  currentUser: CurrentUser | null
  statusGroups?: StatusGroup[]
  announcements?: AnnouncementView[]
  myRequests?: AnnouncementView[]
  isAdmin?: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = useState("")
  const [media, setMedia] = useState<DraftMedia[]>([])
  // Files awaiting the crop/trim/cover editor. When set, the full-screen editor
  // flow opens; it uploads the edited results and hands them back via onDone.
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null)
  const [uploading, setUploading] = useState(false)
  // Upload progress (0–100) for the file currently transferring; null when idle.
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Index currently being dragged in the reorder strip (null when not dragging).
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  // "status" is kept in the union (still deep-linkable via /status and ?tab=status)
  // but is intentionally NOT surfaced as a feed sub-tab anymore — "events" takes
  // its place and hosts the announcements/events feature.
  const [tab, setTab] = useState<"for-you" | "following" | "status" | "events" | "reels">("for-you")
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Separate inputs so we can request the device camera directly: one for
  // capturing a photo and one for recording a video. The "capture" attribute
  // opens the camera on supported mobile devices and falls back to the normal
  // picker on desktop.
  const photoCaptureRef = useRef<HTMLInputElement>(null)
  const videoCaptureRef = useRef<HTMLInputElement>(null)
  // @mention autocomplete for the composer. The draft stays human-readable
  // ("@John Smith"); mentions are serialized to canonical tokens on publish.
  const composeTextareaRef = useRef<HTMLTextAreaElement>(null)
  const mentions = useMentionAutocomplete({
    value: draft,
    onChange: setDraft,
    textareaRef: composeTextareaRef,
  })

  // Poll the feed so new posts and comments from others appear without a manual
  // refresh. The server-rendered posts seed the initial data so first paint is
  // instant. A 5s poll re-ran the whole (expensive) feed query constantly and
  // caused visible lag; 20s keeps the feed fresh while cutting that churn ~4x.
  // `keepPreviousData` avoids a flash/reflow on each revalidation, and
  // `dedupingInterval` collapses overlapping requests (focus + interval).
  const { data: livePosts, mutate: mutateFeed } = useSWR("feed", () => getFeed(), {
    fallbackData: posts,
    refreshInterval: 20000,
    revalidateOnFocus: true,
    keepPreviousData: true,
    dedupingInterval: 8000,
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

  // The "For you" shuffle seed is persisted in sessionStorage so the order stays
  // stable across in-app navigation and remounts (no reshuffle while browsing).
  // It reshuffles on a manual page refresh (reload) and when the app is closed
  // and reopened (sessionStorage is cleared on close). We detect a reload via the
  // Navigation Timing API and mint a fresh seed only in that case.
  const [shuffleSeed] = useState(() => {
    if (typeof window === "undefined") return (Math.random() * 0x7fffffff) | 0
    const newSeed = () => {
      const seed = (Math.random() * 0x7fffffff) | 0
      window.sessionStorage.setItem("feed:shuffleSeed", String(seed))
      return seed
    }
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
    // A manual refresh should produce a brand-new order.
    if (nav?.type === "reload") return newSeed()
    const stored = window.sessionStorage.getItem("feed:shuffleSeed")
    if (stored !== null) {
      const parsed = Number.parseInt(stored, 10)
      if (Number.isFinite(parsed)) return parsed
    }
    return newSeed()
  })

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

  const visiblePosts = tab === "following" ? followingPosts : forYouPosts

  // Open a specific feed tab directly when arriving with ?tab=<id> — this backs
  // the /reels redirect (?tab=reels) and lets us deep-link to Status too, so old
  // links/bookmarks land on the right view.
  useEffect(() => {
    if (typeof window === "undefined") return
    const requested = new URLSearchParams(window.location.search).get("tab")
    if (
      requested === "reels" ||
      requested === "status" ||
      requested === "events" ||
      requested === "following" ||
      requested === "for-you"
    ) {
      setTab(requested)
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Validate the freshly picked files, then hand them to the editor flow
  // (crop for photos, trim for videos, optional cover art). The flow uploads
  // the edited results and returns them via handleEditorDone — nothing is
  // uploaded here anymore.
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
      const valid: File[] = []
      for (const file of selected) {
        const isVideo = file.type.startsWith("video/")
        const isImage = file.type.startsWith("image/")
        if (!isVideo && !isImage) {
          setError("Please choose photos or videos only.")
          continue
        }
        // Enforce the 15-minute video cap before opening the editor.
        if (isVideo) {
          const duration = await getVideoDuration(file).catch(() => 0)
          if (duration > MAX_VIDEO_SECONDS + 1) {
            const mins = Math.floor(duration / 60)
            const secs = Math.round(duration % 60)
            setError(`Videos can be up to 15 minutes. A clip was ${mins}m ${secs}s — please trim it and try again.`)
            continue
          }
        }
        valid.push(file)
      }
      if (droppedForCap) setError(`Only the first ${MAX_MEDIA} items were added (max ${MAX_MEDIA} per post).`)
      if (valid.length > 0) setPendingFiles(valid)
    } finally {
      setUploading(false)
      // Reset the originating input so picking the same file again re-fires.
      e.target.value = ""
    }
  }

  // Editor flow finished: append the edited + uploaded media to the draft.
  function handleEditorDone(items: EditedMedia[]) {
    setMedia((prev) =>
      [
        ...prev,
        ...items.map((it) => ({
          url: it.url,
          type: it.type,
          coverImageUrl: it.coverImageUrl,
          trimStart: it.trimStart,
          trimEnd: it.trimEnd,
          aspectRatio: it.aspectRatio,
        })),
      ].slice(0, MAX_MEDIA),
    )
    setPendingFiles(null)
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
    // Serialize picked @mentions into canonical tokens before trimming/sending.
    const text = mentions.serialize().trim()
    if (!text && media.length === 0) return
    startTransition(async () => {
      const created = await createPost({ text, media })
      setDraft("")
      mentions.reset()
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

  // The three feed tabs, reused by both the sticky in-feed bar and the floating
  // TikTok-style switcher that sits over the full-screen reels.
  const TAB_ITEMS = [
    { id: "for-you" as const, label: "For you" },
    { id: "following" as const, label: "Following" },
    { id: "events" as const, label: "Events" },
    { id: "reels" as const, label: "Reels" },
  ]

  // Sub-tabs are switched by tapping the tab labels only. Horizontal
  // swipe-to-switch was intentionally removed so a sideways drag never jumps
  // between For You / Following / Reels — it kept hijacking media and content
  // gestures. Tapping the switcher remains the single, predictable way to move.

  // Floating switcher shown over the reels: the three tabs "sit" on top of the
  // video (like TikTok's For You / Following) so switching back is one tap away.
  const reelsSwitcher = (
    <div className="flex items-center gap-6">
      {TAB_ITEMS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          className={cn(
            "relative whitespace-nowrap py-1 text-[15px] font-semibold drop-shadow transition-colors",
            tab === t.id ? "text-white" : "text-white/55 hover:text-white/90",
          )}
          aria-pressed={tab === t.id}
        >
          {t.label}
          {tab === t.id && (
            <span className="absolute inset-x-0 -bottom-1 mx-auto h-0.5 w-6 rounded-full bg-white" />
          )}
        </button>
      ))}
    </div>
  )

  // The Events feature (formerly the top-of-feed Announcements banner). It now
  // lives exclusively inside the "Events" sub-tab, where creators publish and
  // browse upcoming events. Hidden entirely for signed-out visitors — there's
  // nothing they can do with it (no publishing, no interest actions), so the
  // whole section (header + empty state) is omitted rather than shown as a
  // dead-end "Sign in to publish" card.
  const announcementBanner = currentUser ? (
    <div className="pt-4 pb-5">
      <AnnouncementBanner
        announcements={announcements}
        myRequests={myRequests}
        currentUser={currentUser}
        isAdmin={isAdmin}
      />
    </div>
  ) : null

  // Full-screen, immersive reels tab. Rendered as a fixed overlay so it feels
  // premium and edge-to-edge (nothing "hanging"), with the tab switcher floating
  // on top. Available to everyone — no auth gate on watching.
  if (tab === "reels") {
    return (
      <ReelsFeed posts={allPosts} header={reelsSwitcher} currentUser={currentUser} />
    )
  }

  if (!currentUser) {
    return (
      <div>
        {announcementBanner}
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
                videoFeedPosts={allPosts}
              />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <PullToRefresh onRefresh={refreshFeed}>
      {/* The post composer is only relevant to the scrolling post feeds
          (For you / Following) — not Events or Status. */}
      {(tab === "for-you" || tab === "following") && (
      <div className="border-y border-border/60 bg-gradient-to-b from-card/60 to-background px-4 py-5 sm:px-5">
        <form onSubmit={publish} className="flex gap-4">
          <Link
            href={`/u/${currentUser.id}`}
            aria-label="View your profile"
            className="tap-scale shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Avatar className="size-12 ring-2 ring-border/60">
              {currentUser.image && (
                <AvatarImage src={currentUser.image || "/placeholder.svg"} alt={currentUser.name} />
              )}
              <AvatarFallback className={currentUser.color}>{currentUser.initials}</AvatarFallback>
            </Avatar>
          </Link>
          <div className="flex-1 space-y-3">
            <div className="relative">
              <FormattedTextarea
                textareaRef={composeTextareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => mentions.onKeyDown(e)}
                onKeyUp={mentions.onCaretChange}
                onClick={mentions.onCaretChange}
                onSelect={mentions.onCaretChange}
                placeholder="Share a thought…"
                className="min-h-24 resize-none rounded-xl border border-border bg-background px-3.5 py-3 text-lg leading-relaxed shadow-sm placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label="Write a post"
              />
              {mentions.open && (
                <MentionAutocompleteList
                  candidates={mentions.candidates}
                  activeIndex={mentions.activeIndex}
                  loading={mentions.loading}
                  onSelect={mentions.onSelect}
                />
              )}
            </div>
            {media.length === 1 && (
              <div className="relative w-full overflow-hidden rounded-xl border border-border/60 bg-muted">
                {media[0].type === "video" ? (
                  <video
                    src={media[0].url}
                    poster={media[0].coverImageUrl}
                    controls
                    playsInline
                    className="max-h-[420px] w-full"
                  />
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
                        item.coverImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.coverImageUrl || "/placeholder.svg"} alt={`Upload ${index + 1}`} className="size-full object-cover" />
                        ) : (
                          <video src={item.url} muted playsInline className="size-full object-cover" />
                        )
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
                <DropdownMenuContent align="start" className={POPUP_MENU_CONTENT}>
                  <DropdownMenuItem onClick={() => photoCaptureRef.current?.click()} className={POPUP_MENU_ITEM}>
                    <Camera /> Take photo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => videoCaptureRef.current?.click()} className={POPUP_MENU_ITEM}>
                    <Video /> Record video
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className={POPUP_MENU_ITEM}>
                    <ImageIcon /> Upload from library
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
      )}

      {/* Pre-post media editor: crop photos / trim videos, then optional cover art. */}
      {pendingFiles && (
        <MediaEditorFlow
          files={pendingFiles}
          uploadFolder="chat"
          maxVideoSeconds={MAX_VIDEO_SECONDS}
          onDone={handleEditorDone}
          onCancel={() => setPendingFiles(null)}
        />
      )}

      {/* Sticky segmented tabs that blend into the feed. Reels lives here as the
          third tab (after For you / Following); tapping it opens the immersive
          full-screen reels experience. */}
      <div className="sticky top-0 z-10 flex items-center border-b border-border/60 bg-background/85 backdrop-blur">
        {TAB_ITEMS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative flex-1 whitespace-nowrap px-3 py-4 font-display text-[15px] tracking-tight transition-all",
              tab === t.id
                ? "font-bold text-foreground"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={tab === t.id}
          >
            {t.label}
            {tab === t.id && (
              <span className="absolute inset-x-0 -bottom-px mx-auto h-1 w-14 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* Swipe horizontally to move between the feed sub-tabs. */}
        <div>
        {tab === "events" ? (
          announcementBanner
        ) : tab === "status" ? (
          <div className="px-4 py-3 sm:px-5">
            <StatusBar variant="list" groups={statusGroups} currentUser={currentUser} />
          </div>
        ) : visiblePosts.length > 0 ? (
          <ul className="stagger flex flex-col gap-2 border-b border-border/60 bg-border/40">
            {visiblePosts.map((post) => (
              <li key={post.id}>
                <FeedPostItem
                  post={post}
                  currentUser={currentUser}
                  highlighted={highlightedPost === String(post.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <Card className="m-4 p-8 text-center sm:mx-0">
            <p className="text-sm text-muted-foreground leading-relaxed">
              You&apos;re not following anyone yet. Tap <span className="font-medium text-foreground">Follow</span> on a
              post to see their thoughts here, or use the search icon in the header to discover people.
            </p>
          </Card>
        )}
      </div>
    </PullToRefresh>
  )
}

/**
 * A single media item inside a feed post, framed as a CONTAINED preview.
 *
 * If the author chose a crop ratio in the editor (`item.aspectRatio`), the
 * frame uses it; otherwise it falls back to the media's natural ratio. Nothing
 * is ever framed taller than 9:16 — taller media is clamped to a 9:16 frame and
 * center-cropped with object-cover. The original media is never modified:
 * cropping is purely visual, and tapping opens the immersive viewer.
 */
function MediaSlide({
  item,
  index,
  count,
  feed,
  authorName,
  onOpenImage,
  onOpenVideo,
}: {
  item: PostMedia
  index: number
  count: number
  feed: boolean
  authorName: string
  onOpenImage: () => void
  onOpenVideo?: () => void
}) {
  const ratio = useMediaAspect(item.url, item.type)

  // Prefer an explicitly chosen crop ratio (cropped media); otherwise the
  // detected natural ratio.
  const chosen = item.aspectRatio ?? ratio

  let framedAspect: number | null
  // Images taller than the 1:1 preview frame (e.g. a 4:5 or 9:16 crop) are shown
  // CONTAINED inside a 1:1 card — the full vertical composition is visible with
  // no further cropping. Exact 1:1 / 16:9 crops fill their own card.
  let imageTall = false
  if (item.type === "video") {
    // Videos in the feed are restricted to a fixed set of card shapes:
    // 1:1 (1) and 16:9 (1.7778). A clip in any other ratio — most notably
    // vertical 9:16 or portrait 4:5 — is presented in a 1:1 card and
    // center-cropped with object-cover. The untouched full ratio is only
    // revealed when the clip is expanded into the immersive viewer (which uses
    // object-contain).
    const ALLOWED_VIDEO_ASPECTS = [1, 16 / 9]
    const allowed = chosen != null && ALLOWED_VIDEO_ASPECTS.some((a) => Math.abs(chosen - a) < 0.02)
    framedAspect = allowed ? (chosen as number) : 1
  } else {
    imageTall = chosen != null && chosen < FEED_PREVIEW_MIN_RATIO - 0.01
    framedAspect = imageTall ? FEED_PREVIEW_MIN_RATIO : chosen
  }
  // Whether the preview differs from the media's true framing — used to show an
  // "expand to full screen" hint. Videos are center-cropped (content cut off);
  // tall images are letterboxed inside 4:5 (full composition, but full screen
  // reveals it larger at its true ratio).
  const cropped =
    item.type === "video"
      ? ratio != null && framedAspect != null && Math.abs(ratio - framedAspect) > 0.01
      : imageTall
  const frameStyle: React.CSSProperties = {
    aspectRatio: framedAspect ? String(framedAspect) : "1 / 1",
    maxHeight: feed ? "min(85svh, 46rem)" : "46rem",
  }

  if (item.type === "video") {
    return (
      <div className="relative w-full overflow-hidden bg-black" style={frameStyle}>
        {/* Autoplays inline in view. Tapping anywhere on the video expands it
            into the immersive vertical viewer (via onExpand); the clip's own
            bottom control bar still drives play/pause, seek, and mute. */}
        <FeedVideo
          src={item.url}
          poster={item.coverImageUrl}
          trimStart={item.trimStart}
          trimEnd={item.trimEnd}
          className="h-full w-full object-cover"
          onExpand={onOpenVideo}
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onOpenImage}
      className="relative block w-full overflow-hidden bg-muted transition-opacity hover:opacity-95"
      style={frameStyle}
      aria-label={count > 1 ? `Open image ${index + 1} of ${count} full screen` : "Open image full screen"}
    >
      {/* Tall images (taller than 4:5) sit inside a 4:5 card via object-contain.
          A blurred, zoomed copy of the same photo fills the letterbox space for a
          premium, intentional look instead of hard black bars. */}
      {imageTall && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.url || "/placeholder.svg"}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.url || "/placeholder.svg"}
        alt={count > 1 ? `Post attachment ${index + 1} of ${count}` : `Image posted by ${authorName}`}
        className={cn("relative h-full w-full", imageTall ? "object-contain" : "object-cover")}
      />
      {cropped && (
        <span className="pointer-events-none absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
          <Maximize2 className="size-4" />
        </span>
      )}
    </button>
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
  onOpenImage,
  onOpenVideo,
}: {
  items: PostMedia[]
  feed: boolean
  authorName: string
  // Tapping a portrait image opens the full-screen natural-ratio image viewer.
  onOpenImage?: (index: number) => void
  // Tapping/expanding a video opens the immersive vertical video viewer.
  onOpenVideo?: (index: number) => void
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const multiple = items.length > 1

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
        data-no-tab-swipe
        className={cn(
          "flex w-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          // Allow BOTH axes: horizontal swipes move the carousel, while vertical
          // swipes pass through to scroll the feed. (`pan-x` alone would suppress
          // vertical gestures that start over the carousel, trapping the scroll.)
          multiple && "[touch-action:pan-x_pan-y]",
        )}
      >
        {items.map((item, i) => (
          <div key={i} className="w-full shrink-0 snap-center snap-always">
            <MediaSlide
              item={item}
              index={i}
              count={items.length}
              feed={feed}
              authorName={authorName}
              onOpenImage={() => (onOpenImage ? onOpenImage(i) : setLightbox(item.url))}
              onOpenVideo={onOpenVideo ? () => onOpenVideo(i) : undefined}
            />
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
  videoFeedPosts,
}: {
  post: FeedPostView
  currentUser: CurrentUser | null
  // "feed" blends edge-to-edge into the immersive scroll; "card" keeps the
  // boxed look used on profile pages.
  variant?: "card" | "feed"
  // Briefly ring the card when it's the deep-linked target of a shared link.
  highlighted?: boolean
  // Sibling posts to browse in the immersive video viewer (vertical swipe).
  // When omitted, tapping a video opens the viewer with just this post.
  videoFeedPosts?: FeedPostView[]
}) {
  const feed = variant === "feed"
  const router = useRouter()
  const [liked, setLiked] = useState(post.liked)
  const [likes, setLikes] = useState(post.likes)
  const [likeBurst, setLikeBurst] = useState(false)
  const [saved, setSaved] = useState(post.saved)
  const [saveCount, setSaveCount] = useState(post.saves)
  const [shareCount, setShareCount] = useState(post.shares)
  const [saveBurst, setSaveBurst] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // Post tab only: measures whether the caption overflows its line clamp so we
  // know when to fade it into a "Read more" toggle.
  const textWrapRef = useRef<HTMLDivElement>(null)
  const [clampable, setClampable] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  // For the author's own post, the like/save buttons open a list of the accounts
  // that liked / saved it instead of toggling engagement.
  const [engagementKind, setEngagementKind] = useState<"likes" | "saves" | null>(null)
  const [showComments, setShowComments] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [mentionReportOpen, setMentionReportOpen] = useState(false)
  // Tracks whether the viewer has removed their own mention from this post, so
  // the "Remove my mention" action hides itself after a successful removal.
  const [mentionRemoved, setMentionRemoved] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editDraft, setEditDraft] = useState(post.text)
  const [copied, setCopied] = useState(false)
  const [edited, setEdited] = useState(post.edited)
  const [text, setText] = useState(post.text)
  const [isPending, startTransition] = useTransition()
  // Immersive media viewers, opened by tapping media in the contained preview.
  const [imageViewer, setImageViewer] = useState<number | null>(null)
  const [videoViewerKey, setVideoViewerKey] = useState<string | null>(null)

  function handleDelete() {
    startTransition(async () => {
      await deletePost(post.id)
      setDeleted(true)
      await globalMutate("feed")
      router.refresh()
    })
  }

  function handleRemoveMyMention() {
    startTransition(async () => {
      const res = await removeMyMention({ contentType: "post", contentId: post.id })
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't remove the mention.")
        return
      }
      setMentionRemoved(true)
      toast.success("Your mention was removed from this post.")
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
    // You can't like your own post — tapping shows who liked it instead.
    if (post.isSelf) {
      setEngagementKind("likes")
      return
    }
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

  function toggleSave() {
    if (!currentUser) return
    // You can't save your own post — tapping shows who saved it instead.
    if (post.isSelf) {
      setEngagementKind("saves")
      return
    }
    const next = !saved
    setSaved(next) // optimistic
    setSaveCount((n) => Math.max(0, n + (next ? 1 : -1)))
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
        setSaveCount((n) => Math.max(0, n + (next ? -1 : 1)))
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

  async function submitComment(text: string) {
    if (!currentUser) return
    await addPostComment({ postId: post.id, text })
    // Refresh the polled feed (used on the Tweet tab) and the server tree
    // (used on profile pages where the feed isn't polled).
    await globalMutate("feed")
    router.refresh()
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
            {/* Flex row so the handle/time can truncate on long usernames while
                the edited info icon stays fixed (shrink-0) and is never clipped. */}
            <span className={cn("flex min-w-0 items-center gap-1 text-muted-foreground", feed ? "text-sm" : "text-xs")}>
              <span className="truncate">
                {post.handle} �� {post.postedAt}
              </span>
              {edited && <EditedIndicator />}
            </span>
          </div>
        </div>
        {/* Aligned to the top (username line) rather than centered, so the
            follow icon doesn't hover over — and visually truncate — the second
            metadata line that carries the edited info icon on longer usernames. */}
        <div className="flex shrink-0 items-center gap-1 self-start">
          {currentUser && !post.isSelf && (
            <FollowButton authorId={post.authorId} authorName={post.user} initialFollowing={post.isFollowing} />
          )}
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
            <DropdownMenuContent align="end" className={POPUP_MENU_CONTENT}>
              {text && (
                <DropdownMenuItem onClick={copyPost} className={POPUP_MENU_ITEM}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy text"}
                </DropdownMenuItem>
              )}

              {post.isSelf ? (
                <>
                  {/* Owner: editing is only allowed within 15 min of publishing;
                      after that the Edit action disappears, leaving only Delete. */}
                  {isWithinEditWindow(post.createdAtMs) && (
                    <DropdownMenuItem onClick={startEditing} className={POPUP_MENU_ITEM}>
                      <Pencil /> Edit post
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setConfirmDelete(true)}
                    className={POPUP_MENU_ITEM}
                  >
                    <Trash2 /> Delete post
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  {text && <DropdownMenuSeparator className="bg-white/10" />}
                  {/* Mention safety: only the tagged viewer can remove their own
                      mention or report it. Hidden once the removal succeeds. */}
                  {post.mentionedMe && !mentionRemoved && (
                    <>
                      <DropdownMenuItem
                        onClick={handleRemoveMyMention}
                        disabled={isPending}
                        className={POPUP_MENU_ITEM}
                      >
                        <UserX /> Remove my mention
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMentionReportOpen(true)} className={POPUP_MENU_ITEM}>
                        <AtSign className="text-destructive" /> Report this mention
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-white/10" />
                    </>
                  )}
                  {/* Non-owner: report opens the reason picker modal. */}
                  <DropdownMenuItem onClick={() => setReportOpen(true)} className={POPUP_MENU_ITEM}>
                    <Flag className="text-destructive" /> Report post
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ReportReasonModal open={reportOpen} onClose={() => setReportOpen(false)} subjectLabel={post.user} />

      {/* Dedicated mention report — routes into the shared moderation queue with
          a mention content type via the reportMention server action. */}
      <ReportReasonModal
        open={mentionReportOpen}
        onClose={() => setMentionReportOpen(false)}
        subjectLabel={post.user}
        onSubmit={(reason) => {
          if (!currentUser) return
          void reportMention({
            contentType: "post",
            contentId: post.id,
            mentionedUserId: currentUser.id,
            reason,
          })
        }}
      />

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

      {/* Media — contained preview; tapping opens the immersive viewer. */}
      {hasMedia && (
        <PostMediaCarousel
          items={mediaItems}
          feed={feed}
          authorName={post.user}
          onOpenImage={(i) => setImageViewer(i)}
          onOpenVideo={(i) => setVideoViewerKey(`${post.id}-${i}`)}
        />
      )}

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
          aria-label={post.isSelf ? "See who liked this post" : "Like"}
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
          <CommentIcon className={cn(feed ? "size-7" : "size-6")} />
          {post.comments.length > 0 && <span>{post.comments.length}</span>}
        </button>

        <button
          onClick={toggleSave}
          className={cn(
            "flex items-center gap-1.5 tabular-nums transition-colors hover:text-primary",
            feed ? "text-[15px]" : "text-sm",
            saved && "text-primary",
            !currentUser && "cursor-not-allowed opacity-60",
          )}
          aria-pressed={saved}
          aria-label={post.isSelf ? "See who saved this post" : saved ? "Remove bookmark" : "Save post"}
        >
          <Bookmark
            onAnimationEnd={() => setSaveBurst(false)}
            className={cn(feed ? "size-7" : "size-6", saved && "fill-current", saveBurst && "motion-pop")}
          />
          {saveCount > 0 && <span>{saveCount}</span>}
        </button>

        <button
          onClick={() => setShareOpen(true)}
          className={cn(
            "ml-auto mr-8 flex items-center gap-1.5 tabular-nums transition-colors hover:text-muted-foreground",
            feed ? "text-[15px]" : "text-sm",
          )}
          aria-label="Share"
        >
          <Send className={cn(feed ? "size-7" : "size-6")} />
          {shareCount > 0 && <span>{shareCount}</span>}
        </button>
      </div>

      <CommentSheet
        open={showComments}
        onClose={() => setShowComments(false)}
        comments={post.comments.map(toThreadComment)}
        currentUser={currentUser}
        showCopy={false}
        enforceTimeWindows={false}
        onSubmit={submitComment}
        onLike={handleCommentLike}
        onReply={handleCommentReply}
        onEdit={handleCommentEdit}
        onDelete={handleCommentDelete}
      />

      <ShareSheet
        target={shareTarget}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        onShared={() => setShareCount((n) => n + 1)}
      />

      {post.isSelf && engagementKind && (
        <EngagementSheet
          postId={post.id}
          kind={engagementKind}
          open
          onClose={() => setEngagementKind(null)}
        />
      )}

      {/* Full-screen natural-ratio image viewer. Maps the tapped carousel index
          to the image-only list so paging skips any interleaved videos. */}
      {imageViewer != null &&
        (() => {
          const images = mediaItems.filter((m) => m.type === "image").map((m) => m.url)
          if (images.length === 0) return null
          const tappedUrl = mediaItems[imageViewer]?.url
          const startIndex = Math.max(0, images.indexOf(tappedUrl))
          return (
            <ImmersiveImageViewer
              post={post}
              images={images}
              startIndex={startIndex}
              currentUser={currentUser}
              onClose={() => setImageViewer(null)}
            />
          )
        })()}

      {/* Immersive vertical video viewer (reuses Reels), opened on the tapped
          clip and swiping through eligible feed videos. */}
      {videoViewerKey && (
        <ReelsFeed
          posts={videoFeedPosts && videoFeedPosts.length > 0 ? videoFeedPosts : [post]}
          initialKey={videoViewerKey}
          currentUser={currentUser}
          onClose={() => setVideoViewerKey(null)}
        />
      )}
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
