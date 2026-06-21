"use client"

import { useState, useTransition } from "react"
import useSWR from "swr"
import Link from "next/link"
import { Heart, Share2, MessageCircle, Send } from "lucide-react"
import { addDevotionalComment, getDevotionalComments, type DevotionalCommentView } from "@/app/actions/devotional"
import { ShareSheet } from "@/components/share-sheet"
import type { ShareTarget } from "@/lib/share-types"
import type { CurrentUser } from "@/lib/session"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export function DevotionalInteractions({
  title,
  devotionalDate,
  initialLikes,
  comments: initialComments,
  currentUser,
}: {
  title: string
  devotionalDate: string
  initialLikes: number
  comments: DevotionalCommentView[]
  currentUser: CurrentUser | null
}) {
  // Poll the comments so replies from others show up without a manual refresh.
  const { data: comments = initialComments, mutate: mutateComments } = useSWR(
    ["devotional-comments", devotionalDate],
    () => getDevotionalComments(devotionalDate),
    {
      fallbackData: initialComments,
      refreshInterval: 5000,
      revalidateOnFocus: true,
    },
  )
  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(initialLikes)
  const [shareOpen, setShareOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [isPending, startTransition] = useTransition()

  const shareTarget: ShareTarget = {
    type: "devotional",
    key: devotionalDate,
    title,
    subtitle: "Daily devotional on Frequency",
    url: typeof window !== "undefined" ? window.location.pathname + window.location.search : "/bible",
    image: null,
    downloadUrl: null,
    downloadKind: null,
  }

  function toggleLike() {
    setLiked((prev) => {
      setLikes((n) => (prev ? n - 1 : n + 1))
      return !prev
    })
  }

  function submitComment(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !currentUser) return
    startTransition(async () => {
      await addDevotionalComment({ devotionalDate, text })
      setDraft("")
      await mutateComments()
    })
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Button variant={liked ? "default" : "secondary"} onClick={toggleLike} className="gap-2" aria-pressed={liked}>
          <Heart className={cn("size-4", liked && "fill-current")} />
          {likes.toLocaleString()}
        </Button>

        <Button variant="secondary" onClick={() => setShareOpen(true)} className="gap-2">
          <Share2 className="size-4" />
          Share
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

        {currentUser ? (
          <form onSubmit={submitComment} className="space-y-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Share a reflection, prayer, or encouragement..."
              className="min-h-24 resize-none"
              aria-label="Write a comment"
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={isPending || !draft.trim()} className="gap-2">
                <Send className="size-4" /> {isPending ? "Posting…" : "Post comment"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="rounded-xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
            <Link href="/sign-in" className="font-medium text-primary hover:underline">
              Sign in
            </Link>{" "}
            to share a reflection. Your name will appear with your comment.
          </div>
        )}

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
