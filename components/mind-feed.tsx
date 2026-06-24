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
} from "@/app/actions/feed"
import { toggleSaveItem } from "@/app/actions/share"
import { CommentThread, type ThreadComment } from "@/components/comment-thread"
import { toggleFollow } from "@/app/actions/follow"
import type { CurrentUser } from "@/lib/session"
import { uploadMedia } from "@/lib/upload-media"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
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
import type { ShareTarget } from "@/lib/share-types"
import { cn } from "@/lib/utils"
import { linkify, extractFirstUrl } from "@/lib/linkify"
import { LinkPreview } from "@/components/link-preview"

type DraftMedia = { url: string; type: "image" | "video" }

// Hard cap for uploaded clips: 15 minutes.
const MAX_VIDEO_SECONDS = 15 * 60

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
  const [media, setMedia] = useState<DraftMedia | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  // A fresh shuffle seed is created once per mount, so the "For you" order is
  // randomized every time the app is refreshed or closed and reopened, yet
  // stays stable while the user keeps scrolling (the 5s SWR polls reuse it).
  const [shuffleSeed] = useState(() => (Math.random() * 0x7fffffff) | 0)

  // "For you" → shuffled per session. "Following" → strict newest-first.
  const forYouPosts = useMemo(() => seededShuffle(allPosts, shuffleSeed), [allPosts, shuffleSeed])
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
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const isVideo = file.type.startsWith("video/")
    const isImage = file.type.startsWith("image/")
    if (!isVideo && !isImage) {
      setError("Please choose a photo or video.")
      e.target.value = ""
      return
    }
    // Enforce the 15-minute video cap before uploading anything.
    if (isVideo) {
      const duration = await getVideoDuration(file).catch(() => 0)
      if (duration > MAX_VIDEO_SECONDS + 1) {
        const mins = Math.floor(duration / 60)
        const secs = Math.round(duration % 60)
        setError(`Videos can be up to 15 minutes. This clip is ${mins}m ${secs}s — please trim it and try again.`)
        e.target.value = ""
        return
      }
    }
    setUploading(true)
    try {
      const data = await uploadMedia(file, "chat")
      setMedia({ url: data.url, type: isVideo ? "video" : "image" })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.")
    } finally {
      setUploading(false)
      // Reset the originating input so picking the same file again re-fires.
      e.target.value = ""
    }
  }

  function clearMedia() {
    setMedia(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
    if (photoCaptureRef.current) photoCaptureRef.current.value = ""
    if (videoCaptureRef.current) videoCaptureRef.current.value = ""
  }

  function publish(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text && !media) return
    startTransition(async () => {
      await createPost({
        text,
        image: media?.type === "image" ? media.url : null,
        video: media?.type === "video" ? media.url : null,
      })
      setDraft("")
      clearMedia()
      await mutateFeed()
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

        <ul className="mt-5 divide-y divide-border/60 border-y border-border/60">
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
    <div>
      <div className="border-y border-border/60 bg-gradient-to-b from-card/60 to-background px-4 py-5 sm:px-5">
        <form onSubmit={publish} className="flex gap-4">
          <Avatar className="size-12 shrink-0 ring-2 ring-border/60">
            {currentUser.image && <AvatarImage src={currentUser.image || "/placeholder.svg"} alt={currentUser.name} />}
            <AvatarFallback className={currentUser.color}>{currentUser.initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Share a thought…"
              className="min-h-24 resize-none border-0 bg-transparent px-3 text-lg leading-relaxed shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0"
              aria-label="Write a post"
            />
            {media && (
              <div className="relative w-full overflow-hidden rounded-xl border border-border/60 bg-muted">
                {media.type === "video" ? (
                  <video src={media.url} controls playsInline className="max-h-[420px] w-full" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={media.url || "/placeholder.svg"} alt="Selected upload preview" className="max-h-[420px] w-full object-cover" />
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
                  {uploading ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
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
              {/* Library picker (photos + videos) */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
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
                disabled={isPending || uploading || (!draft.trim() && !media)}
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
            "relative flex-1 px-3 py-4 text-[15px] font-semibold transition-colors",
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
        <ul className="divide-y divide-border/60 border-b border-border/60">
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
  const [expanded, setExpanded] = useState(false)
  // Post tab only: measures whether the caption overflows its line clamp so we
  // know when to fade it into a "Read more" toggle.
  const textWrapRef = useRef<HTMLDivElement>(null)
  const [clampable, setClampable] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [commentDraft, setCommentDraft] = useState("")
  const [lightboxOpen, setLightboxOpen] = useState(false)
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

  const hasMedia = !!post.image || !!post.video

  // Home feed: long captions collapse to a preview with a "Read more" toggle.
  // We cut on a word boundary so the preview never ends mid-word.
  const COLLAPSE_LIMIT = 280
  const isLong = text.length > COLLAPSE_LIMIT
  const displayText = !isLong || expanded ? text : `${text.slice(0, COLLAPSE_LIMIT).replace(/\s+\S*$/, "")}…`

  // Post tab: captions fade into a "Read more" toggle based on line count —
  // after the first line when the post carries media, or after 11 lines for a
  // text-only post. Line height here is 1.25 (leading-tight).
  const POST_LINE_HEIGHT = 1.25
  const clampLines = hasMedia ? 1 : 11
  const collapsedMaxEm = clampLines * POST_LINE_HEIGHT
  // A clamped, un-expanded caption that actually overflows shows the fade.
  const isClamped = clampable && !expanded

  // Measure the caption against its collapsed height so we only show "Read more"
  // (and the fade) when the text is genuinely longer than the clamp.
  useEffect(() => {
    if (feed) return
    const el = textWrapRef.current
    if (!el) {
      setClampable(false)
      return
    }
    const lineHeightPx = collapsedMaxEm * Number.parseFloat(getComputedStyle(el).fontSize || "13")
    setClampable(el.scrollHeight > lineHeightPx + 2)
  }, [feed, text, collapsedMaxEm, expanded])

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
          ? "bg-background"
          : "rounded-xl border border-border bg-card text-card-foreground",
        highlighted && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      {/* Header */}
      <div className={cn("flex items-center justify-between gap-2", feed ? "px-[0.825rem] py-[0.7rem]" : "px-3 py-2.5")}>
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
              {edited && " · edited"}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
        <div className={cn("pb-3", feed ? "px-[0.825rem]" : "px-3")}>
          <Textarea
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
              feed ? "px-[0.825rem] text-lg" : "px-3 text-[13px]",
              hasMedia ? "pb-3" : "pb-1",
            )}
          >
            {/* When the post is nothing but a link, skip the raw text and let the
                preview card (which shows the link below it) stand on its own. */}
            {text && !textIsOnlyLink && (
              feed ? (
                <>
                  {/* Home feed: word-boundary character truncation. Split on
                      author blank lines with a tighter inter-paragraph margin. */}
                  {displayText.split(/\n{2,}/).map((para, i) => (
                    <p key={i} className={cn("whitespace-pre-wrap leading-snug", i > 0 && "mt-1.5")}>
                      {linkify(para, "font-medium text-primary underline-offset-2 [overflow-wrap:anywhere] hover:underline")}
                    </p>
                  ))}
                  {isLong && (
                    <button
                      type="button"
                      onClick={() => setExpanded((v) => !v)}
                      className="mt-0.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                      aria-expanded={expanded}
                    >
                      {expanded ? "Show less" : "Read more"}
                    </button>
                  )}
                </>
              ) : (
                <>
                  {/* Post tab: clamp by line count and fade into "Read more" —
                      1 line with media, 11 lines for text-only posts. */}
                  <div
                    ref={textWrapRef}
                    className={cn("relative", isClamped && "overflow-hidden")}
                    style={isClamped ? { maxHeight: `${collapsedMaxEm}em` } : undefined}
                  >
                    {text.split(/\n{2,}/).map((para, i) => (
                      <p key={i} className={cn("whitespace-pre-wrap leading-tight", i > 0 && "mt-1.5")}>
                        {linkify(para, "font-medium text-primary underline-offset-2 [overflow-wrap:anywhere] hover:underline")}
                      </p>
                    ))}
                    {isClamped && (
                      // Sits on the last visible line; the text fades directly
                      // into the "Read more" link via the horizontal gradient.
                      <button
                        type="button"
                        onClick={() => setExpanded(true)}
                        className="absolute bottom-0 right-0 flex items-baseline pl-12 text-xs font-semibold leading-tight text-muted-foreground transition-colors hover:text-foreground bg-gradient-to-l from-card from-60% to-transparent"
                        aria-expanded={false}
                      >
                        <span aria-hidden className="text-foreground/90">…&nbsp;</span>
                        Read more
                      </button>
                    )}
                  </div>
                  {clampable && expanded && (
                    <button
                      type="button"
                      onClick={() => setExpanded(false)}
                      className="mt-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                      aria-expanded
                    >
                      Show less
                    </button>
                  )}
                </>
              )
            )}

            {previewUrl && <LinkPreview url={previewUrl} className={cn(text && !textIsOnlyLink && "mt-2.5")} />}
          </div>
        )
      )}

      {/* Media — large, edge-to-edge Instagram-style */}
      {post.video ? (
        <div className="bg-black">
          {/* Contain (not cover) so landscape clips aren't cropped, while tall
              portrait clips stay within a 9:16-style viewport-height frame. */}
          <FeedVideo
            src={post.video}
            className={cn("mx-auto object-contain", feed ? "max-h-[85svh] w-full" : "max-h-[640px] w-full")}
          />
        </div>
      ) : post.image ? (
        <>
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="block w-full bg-muted transition-opacity hover:opacity-95"
            aria-label="Expand image to full screen"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.image || "/placeholder.svg"}
              alt="Post attachment"
              // Cap tall portrait media to a 9:16-style frame so a single image
              // never exceeds the viewport; shorter/landscape media shows fully.
              className={cn("mx-auto w-full object-cover", feed ? "max-h-[85svh]" : "max-h-[640px]")}
            />
          </button>
          {lightboxOpen && (
            <ImageLightbox
              src={post.image}
              alt={`Image posted by ${post.user}`}
              onClose={() => setLightboxOpen(false)}
            />
          )}
        </>
      ) : null}

      {/* Actions — each count sits to the right of its button */}
      <div
        className={cn(
          "flex items-center text-foreground",
          feed ? "gap-7 px-[0.825rem] pb-[0.7rem] pt-3.5" : "gap-5 px-3 pb-3 pt-3",
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
          <Bookmark className={cn(feed ? "size-7" : "size-6", saved && "fill-current")} />
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
              <Textarea
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
  const [hovering, setHovering] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onClick() {
    const next = !following
    setFollowing(next)
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
      size="sm"
      variant={following ? "secondary" : "default"}
      onClick={onClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      disabled={isPending}
      className="h-8 shrink-0 gap-1.5"
      aria-label={following ? `Unfollow ${authorName}` : `Follow ${authorName}`}
    >
      {following ? (
        <>
          <UserCheck className="size-4" />
          {hovering ? "Unfollow" : "Following"}
        </>
      ) : (
        <>
          <UserPlus className="size-4" />
          Follow
        </>
      )}
    </Button>
  )
}
