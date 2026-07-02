"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { Loader2, Send } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { CommentThread, type ThreadComment } from "@/components/comment-thread"
import { authClient } from "@/lib/auth-client"
import { getAvatarColor, getInitials } from "@/lib/identity"
import {
  addEpisodeComment,
  deleteEpisodeComment,
  editEpisodeComment,
  getEpisodeComments,
  setEpisodeCommentLike,
  type EpisodeCommentView,
} from "@/app/actions/episodes"

function toThreadComment(c: EpisodeCommentView): ThreadComment {
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
 * Inline comment section for the immersive episode player's scroll area
 * (composer + full thread with replies). Reuses the shared CommentThread and
 * episode comment server actions, and reports the live count back so the pinned
 * action bar / compact row badge stays in sync. Unlike the old bottom sheet this
 * renders in normal flow so it scrolls with the rest of Section 2.
 */
export function EpisodeCommentsInline({
  episodeId,
  onCountChange,
}: {
  episodeId: number
  onCountChange?: (count: number) => void
}) {
  const { data: session } = authClient.useSession()
  const user = session?.user ?? null

  const [comments, setComments] = useState<EpisodeCommentView[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState("")
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    setLoading(true)
    getEpisodeComments(episodeId)
      .then((c) => {
        if (!active) return
        setComments(c)
        onCountChange?.(c.length)
      })
      .catch(() => {})
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId])

  async function refresh() {
    const c = await getEpisodeComments(episodeId)
    setComments(c)
    onCountChange?.(c.length)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !user) return
    setDraft("")
    startTransition(async () => {
      await addEpisodeComment({ episodeId, text })
      await refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Composer */}
      {user ? (
        <form onSubmit={submit} className="flex items-center gap-2">
          <Avatar className="size-8">
            <AvatarImage src={user.image || undefined} alt="" />
            <AvatarFallback style={{ backgroundColor: getAvatarColor(user.id) }} className="text-xs text-white">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            className="h-9 flex-1 rounded-full border border-border/60 bg-background px-4 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!draft.trim() || isPending}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            aria-label="Post comment"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>{" "}
          to join the conversation.
        </p>
      )}

      {/* Thread */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : comments.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No comments yet. Start the conversation.</p>
      ) : (
        <CommentThread
          comments={comments.map(toThreadComment)}
          canInteract={Boolean(user)}
          onLike={(commentId, liked) => void setEpisodeCommentLike({ commentId, liked })}
          onReply={async (parentId, value) => {
            await addEpisodeComment({ episodeId, text: value, parentId })
            await refresh()
          }}
          onEdit={async (commentId, value) => {
            await editEpisodeComment({ commentId, text: value })
            await refresh()
          }}
          onDelete={async (commentId) => {
            await deleteEpisodeComment(commentId)
            await refresh()
          }}
        />
      )}
    </div>
  )
}
