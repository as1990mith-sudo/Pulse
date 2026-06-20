"use client"

import { useRef, useState, useTransition } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Heart,
  MessageCircle,
  Repeat2,
  Check,
  ImagePlus,
  X,
  Send,
  UserPlus,
  UserCheck,
  Loader2,
} from "lucide-react"
import { addPostComment, createPost, getFeed, setPostLike, type FeedPostView } from "@/app/actions/feed"
import { toggleFollow } from "@/app/actions/follow"
import type { CurrentUser } from "@/lib/session"
import { uploadMedia } from "@/lib/upload-media"
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
              <PostCard post={post} currentUser={currentUser} variant="feed" />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div>
      <div className="border-y border-border/60 bg-background px-4 py-3 sm:px-3">
        <form onSubmit={publish} className="flex gap-3">
          <Avatar className="size-10 shrink-0">
            <AvatarFallback className={currentUser.color}>{currentUser.initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Share a thought…"
              className="min-h-20 resize-none border-0 bg-transparent px-3 text-sm shadow-none focus-visible:ring-0"
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
                size="icon"
                className="text-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                aria-label="Add a photo or video"
              >
                {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
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
      </div>

      {/* Sticky segmented tabs that blend into the feed */}
      <div className="sticky top-0 z-10 flex items-center border-b border-border/60 bg-background/85 backdrop-blur">
        <button
          onClick={() => setTab("for-you")}
          className={cn(
            "relative flex-1 px-3 py-3 text-sm font-medium transition-colors",
            tab === "for-you" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={tab === "for-you"}
        >
          For you
          {tab === "for-you" && <span className="absolute inset-x-0 -bottom-px mx-auto h-0.5 w-12 rounded-full bg-primary" />}
        </button>
        <button
          onClick={() => setTab("following")}
          className={cn(
            "relative flex-1 px-3 py-3 text-sm font-medium transition-colors",
            tab === "following" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={tab === "following"}
        >
          Following{followingCount > 0 ? ` (${followingCount})` : ""}
          {tab === "following" && <span className="absolute inset-x-0 -bottom-px mx-auto h-0.5 w-12 rounded-full bg-primary" />}
        </button>
      </div>

      {visiblePosts.length > 0 ? (
        <ul className="divide-y divide-border/60 border-b border-border/60">
          {visiblePosts.map((post) => (
            <li key={post.id}>
              <PostCard post={post} currentUser={currentUser} variant="feed" />
            </li>
          ))}
        </ul>
      ) : (
        <Card className="m-4 p-8 text-center sm:mx-0">
          <p className="text-sm text-muted-foreground leading-relaxed">
            You&apos;re not following anyone yet. Tap <span className="font-medium text-foreground">Follow</span> on a
            post to see their thoughts here.
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
}: {
  post: FeedPostView
  currentUser: CurrentUser | null
  // "feed" blends edge-to-edge into the immersive scroll; "card" keeps the
  // boxed look used on profile pages.
  variant?: "card" | "feed"
}) {
  const feed = variant === "feed"
  const router = useRouter()
  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(post.likes)
  const [reposted, setReposted] = useState(false)
  const [reposts, setReposts] = useState(post.reposts)
  const [shared, setShared] = useState(false)
  const [shares, setShares] = useState(0)
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
    setShares((n) => n + 1)
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
      // Refresh the polled feed (used on the Tweet tab) and the server tree
      // (used on profile pages where the feed isn't polled).
      await globalMutate("feed")
      router.refresh()
    })
  }

  const hasMedia = !!post.image || !!post.video

  return (
    <article
      className={cn(
        "overflow-hidden",
        feed
          ? "bg-background"
          : "rounded-xl border border-border bg-card text-card-foreground",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
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

      {/* Caption — shown above the media */}
      {post.text && (
        <p className={cn("px-3 text-[15px] leading-relaxed text-foreground/90", hasMedia ? "pb-2.5" : "pb-1")}>
          {post.text}
        </p>
      )}

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

      {/* Actions — each count sits to the right of its button */}
      <div className="flex items-center gap-5 px-3 pb-3 pt-3 text-foreground">
        <button
          onClick={toggleLike}
          className={cn(
            "flex items-center gap-1.5 text-sm tabular-nums transition-colors hover:text-primary",
            liked && "text-primary",
            !currentUser && "cursor-not-allowed opacity-60",
          )}
          aria-pressed={liked}
          aria-label="Like"
        >
          <Heart className={cn("size-6", liked && "fill-current")} />
          {likes > 0 && <span>{likes}</span>}
        </button>

        <button
          onClick={() => setShowComments((v) => !v)}
          className="flex items-center gap-1.5 text-sm tabular-nums transition-colors hover:text-muted-foreground"
          aria-label="Toggle comments"
        >
          <MessageCircle className="size-6" />
          {post.comments.length > 0 && <span>{post.comments.length}</span>}
        </button>

        <button
          onClick={toggleRepost}
          className={cn(
            "flex items-center gap-1.5 text-sm tabular-nums transition-colors hover:text-chart-2",
            reposted && "text-chart-2",
            !currentUser && "cursor-not-allowed opacity-60",
          )}
          aria-pressed={reposted}
          aria-label="Repost"
        >
          <Repeat2 className="size-6" />
          {reposts > 0 && <span>{reposts}</span>}
        </button>

        <button
          onClick={share}
          className="flex items-center gap-1.5 text-sm tabular-nums transition-colors hover:text-muted-foreground"
          aria-label="Share"
        >
          {shared ? <Check className="size-6 text-chart-2" /> : <Send className="size-6" />}
          {shares > 0 && <span>{shares}</span>}
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
