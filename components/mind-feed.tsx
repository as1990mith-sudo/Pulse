"use client"

import { useRef, useState, useTransition } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Heart, MessageCircle, Repeat2, Share2, Check, ImagePlus, X, Send, UserPlus, UserCheck } from "lucide-react"
import { addPostComment, createPost, setPostLike, type FeedPostView } from "@/app/actions/feed"
import { toggleFollow } from "@/app/actions/follow"
import type { CurrentUser } from "@/lib/session"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function MindFeed({ posts, currentUser }: { posts: FeedPostView[]; currentUser: CurrentUser | null }) {
  const router = useRouter()
  const [draft, setDraft] = useState("")
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<"for-you" | "following">("for-you")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const followingCount = posts.filter((p) => p.isFollowing).length
  const visiblePosts = tab === "following" ? posts.filter((p) => p.isFollowing) : posts

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await readFileAsDataUrl(file)
    setImagePreview(dataUrl)
  }

  function clearImage() {
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function publish(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text && !imagePreview) return
    startTransition(async () => {
      await createPost({ text, image: imagePreview })
      setDraft("")
      clearImage()
      router.refresh()
    })
  }

  if (!currentUser) {
    return (
      <div className="space-y-6">
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-lg font-semibold">Join the conversation</p>
          <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
            Create a free account to post what&apos;s on your mind, reply to others, and like posts. Your name shows on
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

        <ul className="space-y-4">
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
              placeholder="What's on your mind?"
              className="min-h-20 resize-none border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
              aria-label="Write a post"
            />
            {imagePreview && (
              <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-xl border border-border/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview || "/placeholder.svg"}
                  alt="Selected upload preview"
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background"
                  aria-label="Remove image"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-2 text-primary"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="size-4" /> Photo
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
              <Button type="submit" disabled={isPending || (!draft.trim() && !imagePreview)} className="gap-2">
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
        <ul className="space-y-4">
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

  return (
    <Card className="p-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link href={`/u/${post.authorId}`} aria-label={`View ${post.user}'s profile`} className="shrink-0">
              <Avatar className="size-8">
                {post.authorImage && <AvatarImage src={post.authorImage || "/placeholder.svg"} alt={post.user} />}
                <AvatarFallback className={cn("text-xs", post.color)}>{post.initials}</AvatarFallback>
              </Avatar>
            </Link>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm">
              <Link href={`/u/${post.authorId}`} className="font-semibold hover:underline">
                {post.user}
              </Link>
              <span className="truncate text-muted-foreground">{post.handle}</span>
              <span className="text-muted-foreground">· {post.postedAt}</span>
            </div>
          </div>
          {currentUser && !post.isSelf && (
            <FollowButton authorId={post.authorId} authorName={post.user} initialFollowing={post.isFollowing} />
          )}
        </div>

        <div className="space-y-2">
          {post.text && (
            <p className="leading-relaxed text-foreground/90 hyphens-auto text-justify">{post.text}</p>
          )}

          {post.image && (
            <div className="overflow-hidden rounded-xl border border-border/60">
              <Image
                src={post.image || "/placeholder.svg"}
                alt="Post attachment"
                width={1080}
                height={1080}
                className="aspect-square h-auto w-full object-cover"
                unoptimized={post.image.startsWith("data:")}
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-1 text-muted-foreground">
            <button
              onClick={() => setShowComments((v) => !v)}
              className="flex items-center gap-1.5 text-sm transition-colors hover:text-foreground"
              aria-label="Toggle comments"
            >
              <MessageCircle className="size-[18px]" />
              {post.comments.length > 0 && post.comments.length}
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
              <Repeat2 className="size-[18px]" />
              {reposts > 0 && reposts}
            </button>

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
              <Heart className={cn("size-[18px]", liked && "fill-current")} />
              {likes > 0 && likes}
            </button>

            <button
              onClick={share}
              className="flex items-center gap-1.5 text-sm transition-colors hover:text-foreground"
              aria-label="Share"
            >
              {shared ? <Check className="size-[18px] text-chart-2" /> : <Share2 className="size-[18px]" />}
            </button>
          </div>

          {showComments && (
            <div className="space-y-4 pt-2">
              <Separator />

              {currentUser ? (
                <form onSubmit={submitComment} className="flex items-start gap-2">
                  <Avatar className="size-8 shrink-0">
                    <AvatarFallback className={cn("text-xs", currentUser.color)}>{currentUser.initials}</AvatarFallback>
                  </Avatar>
                  <Textarea
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="Post your reply..."
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
        </div>
      </div>
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
