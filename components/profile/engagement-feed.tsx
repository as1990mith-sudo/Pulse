"use client"

import { useState, useTransition } from "react"
import { Heart, Loader2, MessageCircle, Trash2 } from "lucide-react"
import { PostCard } from "@/components/mind-feed"
import { deletePostComment, setPostLike, type EngagementItem } from "@/app/actions/feed"
import type { FeedCommentView } from "@/app/actions/feed"
import type { CurrentUser } from "@/lib/session"
import { cn } from "@/lib/utils"

/**
 * The Engagement timeline on a profile: for each post the profile owner has
 * commented on or liked, their engagement is highlighted first, with the actual
 * post rendered beneath so anyone can open it and reply or add their own
 * comment. The owner additionally manages their engagement here — removing a
 * like or deleting a comment — while visitors get a read-and-reply view.
 */
export function EngagementFeed({
  items,
  isSelf,
  currentUser,
}: {
  items: EngagementItem[]
  // Whether the viewer owns this profile. Owners can remove likes and delete
  // comments; everyone can reply / add a comment via the post beneath.
  isSelf: boolean
  currentUser: CurrentUser | null
}) {
  return (
    <div className="-mx-4 flex flex-col divide-y divide-border/60 border-t border-border/60 sm:-mx-6">
      {items.map((item) => (
        <EngagementCard key={item.post.id} item={item} isSelf={isSelf} currentUser={currentUser} />
      ))}
    </div>
  )
}

function EngagementCard({
  item,
  isSelf,
  currentUser,
}: {
  item: EngagementItem
  isSelf: boolean
  currentUser: CurrentUser | null
}) {
  const [comments, setComments] = useState<FeedCommentView[]>(item.comments)
  const [liked, setLiked] = useState(item.liked)
  // Bumped to open the underlying post's comment sheet (Reply / add a comment).
  const [openSignal, setOpenSignal] = useState(0)

  // Once the owner has cleared every trace of their engagement (removed the like
  // and deleted every comment), the item has nothing left to highlight, so it
  // drops out of the timeline.
  if (comments.length === 0 && !liked) return null

  return (
    <div className="pt-4">
      {/* Engagement highlight — the reason this post is on the profile. */}
      <div className="flex flex-col gap-2 px-4 sm:px-6">
        {liked && (
          <LikeHighlight canRemove={isSelf} postId={item.post.id} onRemoved={() => setLiked(false)} />
        )}
        {comments.map((c) => (
          <CommentHighlight
            key={c.id}
            comment={c}
            canDelete={isSelf}
            onReply={() => setOpenSignal((n) => n + 1)}
            onDeleted={() => setComments((prev) => prev.filter((x) => x.id !== c.id))}
          />
        ))}
      </div>

      {/* The post the engagement is on — the real feed card, so opening it,
          liking, replying and adding a comment all behave exactly as on the
          feed. */}
      <PostCard post={item.post} currentUser={currentUser} variant="feed" openCommentsSignal={openSignal} />
    </div>
  )
}

function LikeHighlight({
  canRemove,
  postId,
  onRemoved,
}: {
  canRemove: boolean
  postId: number
  onRemoved: () => void
}) {
  const [pending, startTransition] = useTransition()

  function remove() {
    onRemoved()
    startTransition(async () => {
      await setPostLike({ postId, liked: false })
    })
  }

  return (
    <div className="flex items-center gap-2.5 rounded-full border border-border/60 bg-muted/40 py-1.5 pl-3 pr-1.5">
      <Heart className="size-4 shrink-0 fill-primary text-primary" aria-hidden />
      <span className="flex-1 text-sm font-medium text-foreground">{canRemove ? "You liked this" : "Liked"}</span>
      {canRemove && (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="tap-scale flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Remove
        </button>
      )}
    </div>
  )
}

function CommentHighlight({
  comment,
  canDelete,
  onReply,
  onDeleted,
}: {
  comment: FeedCommentView
  canDelete: boolean
  onReply: () => void
  onDeleted: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  function del() {
    onDeleted()
    startTransition(async () => {
      await deletePostComment(comment.id)
    })
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/40 px-3.5 py-3">
      <p className="whitespace-pre-wrap text-pretty text-[15px] leading-relaxed text-foreground">{comment.text}</p>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{comment.postedAt}</span>
        {comment.edited && <span aria-label="Edited">Edited</span>}
        {comment.likes > 0 && (
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3" aria-hidden />
            {comment.likes}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onReply}
            className="tap-scale inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          >
            <MessageCircle className="size-3.5" aria-hidden />
            Reply
          </button>
          {canDelete &&
            (confirming ? (
              <span className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={del}
                  disabled={pending}
                  className="tap-scale inline-flex items-center gap-1 rounded-full bg-destructive px-2.5 py-1 font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="tap-scale rounded-full px-2.5 py-1 font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                aria-label="Delete comment"
                className={cn(
                  "tap-scale inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold text-muted-foreground transition-colors hover:bg-background hover:text-destructive",
                )}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Delete
              </button>
            ))}
        </span>
      </div>
    </div>
  )
}
