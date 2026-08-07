"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Check, Loader2, Pencil, Share2, Trash2, X } from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import { FeedVideo } from "@/components/feed-video"
import { ShareSheet } from "@/components/share-sheet"
import type { ShareTarget } from "@/lib/share-types"
import { EditedIndicator } from "@/components/edited-indicator"
import { linkify } from "@/lib/linkify"
import { cn } from "@/lib/utils"
import {
  ANON_AVATAR,
  ANON_NAME,
  BibleChips,
  CommunityAvatar,
  LikeButton,
} from "@/components/community-help-shared"
import {
  deleteCommunityPost,
  editCommunityPost,
  type CommunityPostView,
} from "@/app/actions/community"

/**
 * X (Twitter)-style thread timeline used by two profile tabs:
 *  - mode="posts": the user's public Community Help posts (identifiable). Shows
 *    avatar, name, timestamp, body, media and engagement (like/comment/share).
 *  - mode="anonymous": the owner's own anonymous posts. Identity stays hidden
 *    (universal anon avatar + "Anonymous"), and only the owner sees inline
 *    edit/delete controls. Never rendered for non-owners.
 */
export function ProfileThreads({
  posts,
  mode,
}: {
  posts: CommunityPostView[]
  mode: "posts" | "anonymous"
}) {
  // Local copy so edits/deletes reflect instantly without a full refetch.
  const [items, setItems] = useState(posts)

  function handleDeleted(id: number) {
    setItems((prev) => prev.filter((p) => p.id !== id))
  }
  function handleEdited(id: number, body: string) {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, body, edited: true } : p)))
  }

  return (
    <ul className="-mx-4 divide-y divide-border/60 sm:-mx-6">
      {items.map((post) => (
        <li key={post.id}>
          {mode === "anonymous" ? (
            <AnonymousThread post={post} onDeleted={handleDeleted} onEdited={handleEdited} />
          ) : (
            <PublicThread post={post} />
          )}
        </li>
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------------- */
/*  Shared media block                                                        */
/* -------------------------------------------------------------------------- */

function ThreadMedia({ post }: { post: CommunityPostView }) {
  if (post.imageUrl) {
    return (
      <div className="mt-3 overflow-hidden rounded-2xl border border-border/60">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={post.imageUrl || "/placeholder.svg"} alt="" loading="lazy" className="w-full object-cover" />
      </div>
    )
  }
  if (post.videoUrl) {
    return (
      <div className="mt-3 overflow-hidden rounded-2xl border border-border/60">
        <FeedVideo src={post.videoUrl} className="w-full" />
      </div>
    )
  }
  return null
}

/* -------------------------------------------------------------------------- */
/*  Public (identifiable) thread — profile "Posts" tab                        */
/* -------------------------------------------------------------------------- */

function PublicThread({ post }: { post: CommunityPostView }) {
  const [shareOpen, setShareOpen] = useState(false)

  const shareTarget: ShareTarget = {
    type: "community",
    key: String(post.id),
    title: "A post on Community Help",
    subtitle: post.body.length > 120 ? `${post.body.slice(0, 120)}…` : post.body,
    url: `/chatrooms/community?q=${post.id}`,
    image: post.imageUrl,
    downloadUrl: null,
    downloadKind: null,
  }

  return (
    <article className="flex gap-3 px-4 py-4 transition-colors hover:bg-secondary/30 sm:px-6">
      <CommunityAvatar post={post} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[15px]">
          <span className="truncate font-bold tracking-tight text-foreground">
            {post.authorName ?? "Member"}
          </span>
          {post.authorHandle && (
            <span className="truncate text-sm text-muted-foreground">{post.authorHandle}</span>
          )}
          <span className="text-muted-foreground">·</span>
          <span className="shrink-0 text-sm text-muted-foreground">{post.postedAt}</span>
          {post.edited && <EditedIndicator />}
        </div>

        {post.body && (
          <p className="mt-1 whitespace-pre-wrap text-pretty text-[15px] leading-relaxed text-foreground">
            {linkify(post.body)}
          </p>
        )}

        <BibleChips text={post.body} className="mt-3" />
        <ThreadMedia post={post} />

        {/* Engagement row: like, comment (opens the thread in the room), share. */}
        <div className="mt-2 flex items-center gap-1 text-muted-foreground">
          <LikeButton postId={post.id} initialLikes={post.likes} initialLiked={post.liked} variant="row" />
          <Link
            href={`/chatrooms/community?q=${post.id}`}
            className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="View replies"
          >
            <CommentIcon className="size-5" />
            {post.commentCount > 0 && <span className="tabular-nums">{post.commentCount}</span>}
          </Link>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Share"
          >
            <Share2 className="size-5" />
          </button>
        </div>
      </div>

      <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />
    </article>
  )
}

/* -------------------------------------------------------------------------- */
/*  Anonymous thread — owner-only profile "Anonymous" tab                     */
/* -------------------------------------------------------------------------- */

function AnonymousThread({
  post,
  onDeleted,
  onEdited,
}: {
  post: CommunityPostView
  onDeleted: (id: number) => void
  onEdited: (id: number, body: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.body)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function save() {
    const body = draft.trim()
    if (!body) {
      setError("Your post can't be empty.")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const next = await editCommunityPost({ postId: post.id, body })
        onEdited(post.id, next)
        setEditing(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save your changes.")
      }
    })
  }

  function remove() {
    if (!window.confirm("Delete this anonymous post? This can't be undone.")) return
    startTransition(async () => {
      try {
        await deleteCommunityPost(post.id)
        onDeleted(post.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't delete this post.")
      }
    })
  }

  return (
    <article className="flex gap-3 px-4 py-4 sm:px-6">
      {/* Identity stays hidden even from the owner: universal anon avatar only. */}
      <img
        src={ANON_AVATAR || "/placeholder.svg"}
        alt=""
        className="size-11 shrink-0 rounded-full object-cover ring-2 ring-border/70"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[15px]">
          <span className="font-bold tracking-tight text-foreground">{ANON_NAME}</span>
          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Only you can see this
          </span>
          {post.edited && <EditedIndicator />}
        </div>

        {editing ? (
          <div className="mt-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              autoFocus
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-[15px] leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(post.body)
                  setEditing(false)
                  setError(null)
                }}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm font-semibold text-foreground transition hover:bg-secondary/60 disabled:opacity-60"
              >
                <X className="size-4" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {post.body && (
              <p className="mt-1 whitespace-pre-wrap text-pretty text-[15px] leading-relaxed text-foreground">
                {linkify(post.body)}
              </p>
            )}
            <BibleChips text={post.body} className="mt-3" />
            <ThreadMedia post={post} />
            <p className="mt-2 text-xs text-muted-foreground">Posted {post.postedAt}</p>

            {/* Owner-only controls. */}
            <div className="mt-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Pencil className="size-4" /> Edit
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
              >
                <Trash2 className="size-4" /> Delete
              </button>
            </div>
          </>
        )}

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    </article>
  )
}
