"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { Heart, MessageCircle, Repeat2, Share2, Check, ImagePlus, X, Send } from "lucide-react"
import type { FeedComment, FeedPost } from "@/lib/data"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export function MindFeed({ initialPosts }: { initialPosts: FeedPost[] }) {
  const [posts, setPosts] = useState<FeedPost[]>(initialPosts)
  const [draft, setDraft] = useState("")
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setImagePreview(url)
  }

  function clearImage() {
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function publish(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text && !imagePreview) return
    const newPost: FeedPost = {
      id: `local-${Date.now()}`,
      user: "You",
      handle: "@you",
      initials: "Y",
      color: "bg-primary/20 text-primary",
      postedAt: "now",
      text,
      image: imagePreview ?? undefined,
      likes: 0,
      reposts: 0,
      comments: [],
    }
    setPosts((prev) => [newPost, ...prev])
    setDraft("")
    clearImage()
  }

  function updatePost(id: string, updater: (post: FeedPost) => FeedPost) {
    setPosts((prev) => prev.map((p) => (p.id === id ? updater(p) : p)))
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <form onSubmit={publish} className="flex gap-3">
          <Avatar className="size-10 shrink-0">
            <AvatarFallback className="bg-primary/20 text-primary">Y</AvatarFallback>
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
              <div className="relative w-fit overflow-hidden rounded-xl border border-border/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview || "/placeholder.svg"} alt="Selected upload preview" className="max-h-72 w-auto" />
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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImagePick}
              />
              <Button type="submit" disabled={!draft.trim() && !imagePreview} className="gap-2">
                <Send className="size-4" /> Post
              </Button>
            </div>
          </div>
        </form>
      </Card>

      <ul className="space-y-4">
        {posts.map((post) => (
          <li key={post.id}>
            <PostCard post={post} onUpdate={(updater) => updatePost(post.id, updater)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function PostCard({ post, onUpdate }: { post: FeedPost; onUpdate: (updater: (post: FeedPost) => FeedPost) => void }) {
  const [liked, setLiked] = useState(false)
  const [reposted, setReposted] = useState(false)
  const [shared, setShared] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [commentDraft, setCommentDraft] = useState("")

  function toggleLike() {
    setLiked((prev) => {
      onUpdate((p) => ({ ...p, likes: prev ? p.likes - 1 : p.likes + 1 }))
      return !prev
    })
  }

  function toggleRepost() {
    setReposted((prev) => {
      onUpdate((p) => ({ ...p, reposts: prev ? p.reposts - 1 : p.reposts + 1 }))
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
    if (!text) return
    const newComment: FeedComment = {
      id: `c-${Date.now()}`,
      user: "You",
      handle: "@you",
      initials: "Y",
      color: "bg-primary/20 text-primary",
      text,
      postedAt: "now",
    }
    onUpdate((p) => ({ ...p, comments: [...p.comments, newComment] }))
    setCommentDraft("")
    setShowComments(true)
  }

  return (
    <Card className="p-4">
      <div className="flex gap-3">
        <Avatar className="size-10 shrink-0">
          <AvatarFallback className={post.color}>{post.initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className="font-semibold">{post.user}</span>
            <span className="text-muted-foreground">{post.handle}</span>
            <span className="text-muted-foreground">· {post.postedAt}</span>
          </div>

          {post.text && <p className="text-pretty leading-relaxed text-foreground/90">{post.text}</p>}

          {post.image && (
            <div className="overflow-hidden rounded-xl border border-border/60">
              <Image
                src={post.image || "/placeholder.svg"}
                alt="Post attachment"
                width={600}
                height={400}
                className="h-auto w-full object-cover"
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
              className={cn("flex items-center gap-1.5 text-sm transition-colors hover:text-chart-2", reposted && "text-chart-2")}
              aria-pressed={reposted}
              aria-label="Repost"
            >
              <Repeat2 className="size-[18px]" />
              {post.reposts > 0 && post.reposts}
            </button>

            <button
              onClick={toggleLike}
              className={cn("flex items-center gap-1.5 text-sm transition-colors hover:text-primary", liked && "text-primary")}
              aria-pressed={liked}
              aria-label="Like"
            >
              <Heart className={cn("size-[18px]", liked && "fill-current")} />
              {post.likes > 0 && post.likes}
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

              <form onSubmit={submitComment} className="flex items-start gap-2">
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="bg-primary/20 text-primary text-xs">Y</AvatarFallback>
                </Avatar>
                <Textarea
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder="Post your reply..."
                  className="min-h-10 resize-none"
                  aria-label="Write a reply"
                />
                <Button type="submit" size="icon" disabled={!commentDraft.trim()} aria-label="Send reply">
                  <Send className="size-4" />
                </Button>
              </form>

              {post.comments.length > 0 && (
                <ul className="space-y-4">
                  {post.comments.map((comment) => (
                    <li key={comment.id} className="flex gap-2.5">
                      <Avatar className="size-8 shrink-0">
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
