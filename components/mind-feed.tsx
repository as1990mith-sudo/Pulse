"use client"

import { useEffect, useRef, useState, useTransition } from "react"
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
  type FeedCommentView,
  type FeedPostView,
} from "@/app/actions/feed"
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

type DraftMedia = { url: string; type: "image" | "video" }

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

  const followingCount = allPosts.filter((p) => p.isFollowing).length
  const visiblePosts = tab === "following" ? allPosts.filter((p) => p.isFollowing) : allPosts

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
      return
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
                      className="inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary outline-none transition-all hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:opacity-50"
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
                className="gap-2 rounded-full px-6 font-semibold"
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
  const [reposted, setReposted] = useState(false)
  const [reposts, setReposts] = useState(post.reposts)
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
    startTransition(async () => {
      await setPostLike({ postId: post.id, liked: next })
    })
  }

  function toggleRepost() {
    if (!currentUser) return
    setReposted((prev) => {
      setReposts((n) => (prev ? n - 1 : n + 1))
      return !prev
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
        text && (
          <p
            className={cn(
              "whitespace-pre-wrap leading-relaxed text-foreground/90",
              feed ? "px-[0.825rem] text-lg" : "px-3 text-[15px]",
              hasMedia ? "pb-3" : "pb-1",
            )}
          >
            {text}
          </p>
        )
      )}

      {/* Media — large, edge-to-edge Instagram-style */}
      {post.video ? (
        <div className="bg-black">
          <FeedVideo src={post.video} className="max-h-[640px] w-full" />
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
              className="max-h-[640px] w-full object-cover"
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
          <Heart className={cn(feed ? "size-7" : "size-6", liked && "fill-current")} />
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
          onClick={() => setShareOpen(true)}
          className={cn(
            "ml-auto flex items-center gap-1.5 tabular-nums transition-colors hover:text-muted-foreground",
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
