"use client"

import { useState } from "react"
import { Heart, Share2, MessageCircle, Check, Send } from "lucide-react"
import type { DevotionalComment } from "@/lib/data"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export function DevotionalInteractions({
  title,
  initialLikes,
  initialComments,
}: {
  title: string
  initialLikes: number
  initialComments: DevotionalComment[]
}) {
  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(initialLikes)
  const [shared, setShared] = useState(false)
  const [comments, setComments] = useState<DevotionalComment[]>(initialComments)
  const [draft, setDraft] = useState("")

  function toggleLike() {
    setLiked((prev) => {
      setLikes((n) => (prev ? n - 1 : n + 1))
      return !prev
    })
  }

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : ""
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, text: title, url })
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
    const text = draft.trim()
    if (!text) return
    const newComment: DevotionalComment = {
      id: `local-${Date.now()}`,
      user: "You",
      initials: "Y",
      color: "bg-primary/20 text-primary",
      text,
      postedAt: "Just now",
    }
    setComments((prev) => [newComment, ...prev])
    setDraft("")
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Button
          variant={liked ? "default" : "secondary"}
          onClick={toggleLike}
          className="gap-2"
          aria-pressed={liked}
        >
          <Heart className={cn("size-4", liked && "fill-current")} />
          {likes.toLocaleString()}
        </Button>

        <Button variant="secondary" onClick={share} className="gap-2">
          {shared ? <Check className="size-4 text-chart-2" /> : <Share2 className="size-4" />}
          {shared ? "Link copied" : "Share"}
        </Button>

        <div className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
          <MessageCircle className="size-4" />
          {comments.length}
        </div>
      </div>

      <Separator />

      <div className="space-y-5">
        <h2 className="text-lg font-semibold tracking-tight">
          Comments <span className="text-muted-foreground">({comments.length})</span>
        </h2>

        <form onSubmit={submitComment} className="space-y-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Share a reflection, prayer, or encouragement..."
            className="min-h-24 resize-none"
            aria-label="Write a comment"
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={!draft.trim()} className="gap-2">
              <Send className="size-4" /> Post comment
            </Button>
          </div>
        </form>

        <ul className="space-y-5">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-3">
              <Avatar className="size-9 shrink-0">
                <AvatarFallback className={comment.color}>{comment.initials}</AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{comment.user}</span>
                  <span className="text-xs text-muted-foreground">{comment.postedAt}</span>
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">{comment.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
