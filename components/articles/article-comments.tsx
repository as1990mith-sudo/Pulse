"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import { Heart, MessageCircle, MoreHorizontal, Send, Trash2, Flag, Pencil } from "lucide-react"
import {
  addArticleComment,
  deleteArticleComment,
  editArticleComment,
  reportArticleComment,
  setArticleCommentLike,
} from "@/app/actions/articles"
import type { ArticleCommentView } from "@/lib/article-types"
import { AuthorAvatar } from "@/components/articles/author-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export function ArticleComments({
  articleId,
  initialComments,
  signedIn,
}: {
  articleId: string
  initialComments: ArticleCommentView[]
  signedIn: boolean
}) {
  const [comments, setComments] = useState<ArticleCommentView[]>(initialComments)
  const [body, setBody] = useState("")
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const total = useMemo(
    () => comments.reduce((n, c) => n + 1 + c.replies.length, 0),
    [comments],
  )

  function focusInput() {
    inputRef.current?.focus()
  }

  function submit() {
    const text = body.trim()
    if (!text || pending) return
    setBody("")
    const parentId = replyTo?.id ?? null
    setReplyTo(null)
    startTransition(async () => {
      try {
        const created = await addArticleComment({ articleId, body: text, parentId })
        setComments((prev) => {
          if (!parentId) return [created, ...prev]
          return prev.map((c) =>
            c.id === parentId ? { ...c, replies: [...c.replies, created] } : c,
          )
        })
      } catch {
        setBody(text)
      }
    })
  }

  return (
    <section className="mt-10" id="comments">
      <h2 className="mb-4 font-display text-lg font-bold text-foreground">
        {total > 0 ? `${total} Comment${total === 1 ? "" : "s"}` : "Comments"}
      </h2>

      {signedIn ? (
        <div className="mb-6 flex flex-col gap-2 rounded-2xl border border-border bg-card p-3">
          {replyTo && (
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">
              <span>
                Replying to <span className="font-medium text-foreground">{replyTo.name}</span>
              </span>
              <button onClick={() => setReplyTo(null)} className="font-medium hover:text-foreground">
                Cancel
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault()
                  submit()
                }
              }}
              rows={1}
              placeholder="Share your thoughts…"
              className="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={submit}
              disabled={!body.trim() || pending}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition disabled:opacity-40"
              aria-label="Post comment"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <p className="mb-6 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Sign in to join the conversation.
        </p>
      )}

      <div className="flex flex-col gap-5">
        {comments.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No comments yet. Be the first to respond.
          </p>
        )}
        {comments.map((c) => (
          <CommentNode
            key={c.id}
            comment={c}
            signedIn={signedIn}
            onReply={(name) => {
              setReplyTo({ id: c.id, name })
              focusInput()
            }}
            onMutate={setComments}
          />
        ))}
      </div>
    </section>
  )
}

function CommentNode({
  comment,
  signedIn,
  onReply,
  onMutate,
  isReply = false,
}: {
  comment: ArticleCommentView
  signedIn: boolean
  onReply: (name: string) => void
  onMutate: React.Dispatch<React.SetStateAction<ArticleCommentView[]>>
  isReply?: boolean
}) {
  const [liked, setLiked] = useState(comment.liked)
  const [likes, setLikes] = useState(comment.likes)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [deleted, setDeleted] = useState(comment.deleted)
  const [bodyText, setBodyText] = useState(comment.body)
  const [, startTransition] = useTransition()

  function toggleLike() {
    if (!signedIn) return
    const next = !liked
    setLiked(next)
    setLikes((n) => n + (next ? 1 : -1))
    startTransition(async () => {
      try {
        await setArticleCommentLike({ commentId: comment.id, liked: next })
      } catch {
        setLiked(!next)
        setLikes((n) => n + (next ? -1 : 1))
      }
    })
  }

  function saveEdit() {
    const text = draft.trim()
    if (!text) return
    setBodyText(text)
    setEditing(false)
    startTransition(async () => {
      try {
        await editArticleComment({ commentId: comment.id, body: text })
      } catch {
        /* keep optimistic */
      }
    })
  }

  function remove() {
    setDeleted(true)
    startTransition(async () => {
      try {
        await deleteArticleComment(comment.id)
      } catch {
        setDeleted(false)
      }
    })
  }

  function report() {
    startTransition(async () => {
      try {
        await reportArticleComment({ commentId: comment.id })
      } catch {
        /* ignore */
      }
    })
  }

  return (
    <div className={cn("flex gap-3", isReply && "ml-9")}>
      <AuthorAvatar author={comment.author} size={isReply ? 28 : 34} />
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl bg-card px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-foreground">{comment.author.name}</span>
              <span className="text-xs text-muted-foreground">{comment.timeAgo}</span>
              {comment.editedAt && !deleted && (
                <span className="text-[10px] text-muted-foreground">edited</span>
              )}
            </div>
            {!deleted && signedIn && (
              <DropdownMenu>
                <DropdownMenuTrigger className="text-muted-foreground transition hover:text-foreground">
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {comment.isMine ? (
                    <>
                      <DropdownMenuItem onClick={() => setEditing(true)}>
                        <Pencil className="mr-2 size-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={remove} className="text-destructive">
                        <Trash2 className="mr-2 size-4" /> Delete
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuItem onClick={report}>
                      <Flag className="mr-2 size-4" /> Report
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {deleted ? (
            <p className="mt-1 text-sm italic text-muted-foreground">This comment was deleted.</p>
          ) : editing ? (
            <div className="mt-1.5 flex flex-col gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none"
              />
              <div className="flex justify-end gap-2 text-xs">
                <button onClick={() => setEditing(false)} className="text-muted-foreground">
                  Cancel
                </button>
                <button onClick={saveEdit} className="font-semibold text-primary">
                  Save
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {bodyText}
            </p>
          )}
        </div>

        {!deleted && (
          <div className="mt-1 flex items-center gap-4 pl-1">
            <button
              onClick={toggleLike}
              className={cn(
                "flex items-center gap-1 text-xs font-medium transition",
                liked ? "text-live" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Heart className={cn("size-3.5", liked && "fill-current")} />
              {likes > 0 && likes}
            </button>
            {!isReply && (
              <button
                onClick={() => onReply(comment.author.name)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
              >
                <MessageCircle className="size-3.5" />
                Reply
              </button>
            )}
          </div>
        )}

        {comment.replies.length > 0 && (
          <div className="mt-3 flex flex-col gap-3">
            {comment.replies.map((r) => (
              <CommentNode
                key={r.id}
                comment={r}
                signedIn={signedIn}
                onReply={onReply}
                onMutate={onMutate}
                isReply
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
