"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Heart,
  MessageCircle,
  Repeat2,
  Share2,
  Check,
  ImagePlus,
  X,
  Send,
  UserPlus,
  UserCheck,
  Loader2,
} from "lucide-react"
import { addPostComment, createPost, setPostLike, type FeedPostView } from "@/app/actions/feed"
import { toggleFollow } from "@/app/actions/follow"
import type { CurrentUser } from "@/lib/session"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ImageLightbox } from "@/components/image-lightbox"
import { cn } from "@/lib/utils"

type DraftMedia = { url: string; type: "image" | "video" }

export function MindFeed({ posts, currentUser }: { posts: FeedPostView[]; currentUser: CurrentUser | null }) {
  const router = useRouter()
  const [draft, setDraft] = useState("")
  const [media, setMedia] = useState<DraftMedia | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<"for-you" | "following">("for-you")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const followingCount = posts.filter((p) => p.isFollowing).length
  const visiblePosts = tab === "following" ? posts.filter((p) => p.isFollowing) : posts

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
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/upload-chat", { method: "POST", body })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Upload failed.")
      setMedia({ url: data.url, type: isVideo ? "video" : "image" })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function clearMedia() {
    setMedia(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
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
      router.refresh()
    })
  }

  if (!currentUser) {
    return (
      <div className="space-y-6">
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
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

        <ul className="space-y-6">
          {posts.map((post) => (
            <li key={post.id}>
              <PostCard post={post} currentUser={currentUser} />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <form onSubmit={publish} className="flex gap-3">
          <Avatar className="size-10 shrink-0">
            <AvatarFallback className={currentUser.color}>{currentUser.initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Share a photo, video, or thought..."
              className="min-h-20 resize-none border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-2 text-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                {uploading ? "Uploading…" : "Photo / Video"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleMediaPick}
              />
              <Button type="submit" disabled={isPending || uploading || (!draft.trim() && !media)} className="gap-2">
                <Send className="size-4" /> {isPending ? "Posting…" : "Post"}
              </Button>
            </div>
          </div>
        </form>
      </Card>

      <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/40 p-1">
        <button
          onClick={() => setTab("for-you")}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "for-you" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={tab === "for-you"}
        >
          For you
        </button>
        <button
          onClick={() => setTab("following")}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "following" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={tab === "following"}
        >
          Following{followingCount > 0 ? ` (${followingCount})` : ""}
        </button>
      </div>

      {visiblePosts.length > 0 ? (
        <ul className="space-y-6">
          {visiblePosts.map((post) => (
            <li key={post.id}>
              <PostCard post={post} currentUser={currentUser} />
            </li>
          ))}
        </ul>
      ) : (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground leading-relaxed">
            You&apos;re not following anyone yet. Tap <span className="font-medium text-foreground">Follow</span> on a
            post to see their thoughts here.
          </p>
        </Card>
      )}
    </div>
  )
}

export function PostCard({ post, currentUser }: { post: FeedPostView; currentUser: CurrentUser | null }) {
  const router = useRouter()
  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(post.likes)
  const [reposted, setReposted] = useState(false)
  const [reposts, setReposts] = useState(post.reposts)
  const [shared, setShared] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [commentDraft, setCommentDraft] = useState("")
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

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

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : ""
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: `${post.user} on Frequency`, text: post.text, url })
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
      }
    } catch {
      // user dismissed the share sheet; ignore
    }
    setShared(true)
    setTimeout(() => setShared(false), 2000)
  }

  function submitComment(e: React.FormEvent) {
    e.preventDefault()
    const text = commentDraft.trim()
    if (!text || !currentUser) return
    startTransition(async () => {
      await addPostComment({ postId: post.id, text })
      setCommentDraft("")
      setShowComments(true)
      router.refresh()
    })
  }

  const hasMedia = !!post.image || !!post.video

  return (
    <Card className="overflow-hidden p-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link href={`/u/${post.authorId}`} aria-label={`View ${post.user}'s profile`} className="shrink-0">
            <Avatar className="size-9">
              {post.authorImage && <AvatarImage src={post.authorImage || "/placeholder.svg"} alt={post.user} />}
              <AvatarFallback className={cn("text-xs", post.color)}>{post.initials}</AvatarFallback>
            </Avatar>
          </Link>
          <div className="flex min-w-0 flex-col leading-tight">
            <Link href={`/u/${post.authorId}`} className="truncate text-sm font-semibold hover:underline">
              {post.user}
            </Link>
            <span className="truncate text-xs text-muted-foreground">
              {post.handle} · {post.postedAt}
            </span>
          </div>
        </div>
        {currentUser && !post.isSelf && (
          <FollowButton authorId={post.authorId} authorName={post.user} initialFollowing={post.isFollowing} />
        )}
      </div>

      {/* Media — large, edge-to-edge Instagram-style */}
      {post.video ? (
        <div className="bg-black">
          <video src={post.video} controls playsInline className="max-h-[640px] w-full" />
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

      {/* Actions */}
      <div className="flex items-center gap-4 px-3 pt-3 text-foreground">
        <button
          onClick={toggleLike}
          className={cn(
            "flex items-center gap-1.5 text-sm transition-colors hover:text-primary",
            liked && "text-primary",
            !currentUser && "cursor-not-allowed opacity-60",
          )}
          aria-pressed={liked}
          aria-label="Like"
        >
          <Heart className={cn("size-6", liked && "fill-current")} />
        </button>

        <button
          onClick={() => setShowComments((v) => !v)}
          className="flex items-center gap-1.5 text-sm transition-colors hover:text-muted-foreground"
          aria-label="Toggle comments"
        >
          <MessageCircle className="size-6" />
        </button>

        <button
          onClick={toggleRepost}
          className={cn(
            "flex items-center gap-1.5 text-sm transition-colors hover:text-chart-2",
            reposted && "text-chart-2",
            !currentUser && "cursor-not-allowed opacity-60",
          )}
          aria-pressed={reposted}
          aria-label="Repost"
        >
          <Repeat2 className="size-6" />
        </button>

        <button
          onClick={share}
          className="ml-auto flex items-center gap-1.5 text-sm transition-colors hover:text-muted-foreground"
          aria-label="Share"
        >
          {shared ? <Check className="size-6 text-chart-2" /> : <Share2 className="size-6" />}
        </button>
      </div>

      {/* Like count + caption */}
      <div className="space-y-1 px-3 pb-3 pt-2">
        {likes > 0 && (
          <p className="text-sm font-semibold">
            {likes} {likes === 1 ? "like" : "likes"}
          </p>
        )}
        {post.text && (
          <p className={cn("text-sm leading-relaxed text-foreground/90", hasMedia && "pt-0.5")}>
            <Link href={`/u/${post.authorId}`} className="mr-1.5 font-semibold hover:underline">
              {post.user}
            </Link>
            {post.text}
          </p>
        )}
        {reposts > 0 && <p className="text-xs text-muted-foreground">{reposts} reposts</p>}
        {post.comments.length > 0 && !showComments && (
          <button
            onClick={() => setShowComments(true)}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            View all {post.comments.length} {post.comments.length === 1 ? "comment" : "comments"}
          </button>
        )}
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

          {post.comments.length > 0 && (
            <ul className="space-y-4">
              {post.comments.map((comment) => (
                <li key={comment.id} className="flex gap-2.5">
                  <Avatar className="size-8 shrink-0">
                    {comment.authorImage && (
                      <AvatarImage src={comment.authorImage || "/placeholder.svg"} alt={comment.user} />
                    )}
                    <AvatarFallback className={cn("text-xs", comment.color)}>{comment.initials}</AvatarFallback>
                  </Avatar>
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 text-sm">
                      <span className="font-medium">{comment.user}</span>
                      <span className="text-xs text-muted-foreground">{comment.handle}</span>
                      <span className="text-xs text-muted-foreground">· {comment.postedAt}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/90">{comment.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
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
