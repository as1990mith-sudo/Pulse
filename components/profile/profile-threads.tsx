"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Check, Copy, Loader2, MoreHorizontal, Pencil, Share2, Trash2, X } from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import { FeedVideo } from "@/components/feed-video"
import { ShareSheet } from "@/components/share-sheet"
import type { ShareTarget } from "@/lib/share-types"
import { EditedIndicator } from "@/components/edited-indicator"
import { renderMessageBody } from "@/lib/rich-text"
import { cn } from "@/lib/utils"
import {
  ANON_AVATAR,
  ANON_NAME,
  BibleChips,
  CommunityAvatar,
  LikeButton,
  SaveButton,
} from "@/components/community-help-shared"
import {
  deleteCommunityPost,
  editCommunityPost,
  type CommunityPostView,
} from "@/app/actions/community"

/**
 * X (Twitter)-style thread timeline used by the profile tabs:
 *  - mode="posts": public Community Help posts (identifiable). Shows avatar,
 *    name, timestamp, body, media and engagement (like/comment/share).
 *  - mode="anonymous": the owner's own anonymous posts, identity hidden.
 *  - mode="thread": the "Thread" tab — the user's Community Help posts, mixing
 *    identifiable and (for the owner only) anonymous posts. Each post decides
 *    its own rendering from `post.anonymous`, so anonymous questions still show
 *    the universal anon avatar + "Anonymous" while identifiable ones show the
 *    author. Only the owner ever receives anonymous posts, so anonymity holds.
 */
export function ProfileThreads({
  posts,
  mode,
}: {
  posts: CommunityPostView[]
  mode: "posts" | "anonymous" | "thread"
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
          {mode === "anonymous" || (mode === "thread" && post.anonymous) ? (
            <AnonymousThread post={post} onDeleted={handleDeleted} onEdited={handleEdited} />
          ) : (
            <PublicThread post={post} onDeleted={handleDeleted} onEdited={handleEdited} />
          )}
        </li>
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------------- */
/*  Shared media block                                                        */
/* -------------------------------------------------------------------------- */

function ThreadMedia({ post, onOpen }: { post: CommunityPostView; onOpen?: () => void }) {
  // FeedVideo positions its player as `absolute inset-0`, so it must live inside
  // a `relative` box with an explicit height. We seed a 16:9 frame and update it
  // to the clip's true aspect ratio once known (capped so tall clips can't take
  // over the timeline) — mirroring the community feed's post media.
  const [ratio, setRatio] = useState(16 / 9)

  if (post.imageUrl) {
    // Tapping the image opens the post (matching Community Help) when a parent
    // provides onOpen; otherwise it stays a static frame (anonymous tab).
    const Frame = onOpen ? "button" : "div"
    return (
      <Frame
        type={onOpen ? "button" : undefined}
        onClick={onOpen}
        className={cn(
          "mt-3 block w-full overflow-hidden rounded-2xl border border-border/60",
          onOpen && "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={post.imageUrl || "/placeholder.svg"}
          alt=""
          loading="lazy"
          className="max-h-[22rem] w-full object-cover"
        />
      </Frame>
    )
  }
  if (post.videoUrl) {
    return (
      <div
        className="relative mt-3 w-full overflow-hidden rounded-2xl border border-border/60 bg-black"
        style={{ aspectRatio: String(ratio), maxHeight: "22rem" }}
      >
        {/* onExpand makes a tap anywhere on the clip open the post (like the
            community feed) instead of just toggling play/pause. */}
        <FeedVideo
          src={post.videoUrl}
          className="h-full w-full object-cover"
          onAspectRatio={setRatio}
          onExpand={onOpen}
        />
      </div>
    )
  }
  return null
}

/* -------------------------------------------------------------------------- */
/*  Public (identifiable) thread — profile "Posts" tab                        */
/* -------------------------------------------------------------------------- */

function PublicThread({
  post,
  onDeleted,
  onEdited,
}: {
  post: CommunityPostView
  onDeleted: (id: number) => void
  onEdited: (id: number, body: string) => void
}) {
  const router = useRouter()
  const [shareOpen, setShareOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.body)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const menuRef = useRef<HTMLDivElement>(null)

  // Opening the post = jump to its thread in the Community Help room, the same
  // destination as the comment button. Used by taps on the media too.
  const open = () => router.push(`/chatrooms/community?q=${post.id}`)

  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [menuOpen])

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

  function handleDelete() {
    setMenuOpen(false)
    startTransition(async () => {
      try {
        await deleteCommunityPost(post.id)
        onDeleted(post.id)
      } catch {
        /* ignore */
      }
    })
  }

  async function handleCopy() {
    setMenuOpen(false)
    try {
      await navigator.clipboard.writeText(post.body)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  function startEdit() {
    setMenuOpen(false)
    setDraft(post.body)
    setError(null)
    setEditing(true)
  }

  function saveEdit() {
    const body = draft.trim()
    if (!body || body === post.body) {
      setEditing(false)
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

  return (
    <article className="flex gap-3 px-4 py-4 transition-colors hover:bg-secondary/30 sm:px-6">
      <CommunityAvatar post={post} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          {/* Display name on top, then handle · date stacked beneath it. */}
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-bold leading-tight tracking-tight text-foreground">
              {post.authorName ?? "Member"}
            </span>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
              {post.authorHandle && <span className="truncate">{post.authorHandle}</span>}
              {post.authorHandle && <span aria-hidden>·</span>}
              <span className="shrink-0">{post.postedAt}</span>
              {post.edited && <EditedIndicator />}
            </div>
          </div>

          {/* Overflow menu — Copy for everyone, Edit/Delete for the author. */}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className={cn(
                "-mr-1 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                menuOpen && "bg-secondary text-foreground",
              )}
              aria-label="Post options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal className="size-5" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-2xl border border-border/60 bg-card p-1 shadow-xl duration-150 animate-in fade-in zoom-in-95"
              >
                {post.isSelf && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={startEdit}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
                  >
                    <Pencil className="size-4" /> Edit
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleCopy}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
                >
                  <Copy className="size-4" /> Copy text
                </button>
                {post.isSelf && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleDelete}
                    disabled={pending}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
                  >
                    <Trash2 className="size-4" /> Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {editing ? (
          <div className="mt-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              autoFocus
              maxLength={1000}
              className="w-full resize-none rounded-2xl border border-border bg-background px-3 py-2 text-[15px] leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
            <div className="mt-2 flex items-center justify-end gap-2">
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
              <button
                type="button"
                onClick={saveEdit}
                disabled={pending || !draft.trim()}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            {post.body && (
              <p className="mt-1 whitespace-pre-wrap text-pretty text-[15px] leading-relaxed text-foreground">
                {renderMessageBody(post.body, { link: true, mention: true })}
              </p>
            )}

            <BibleChips text={post.body} className="mt-3" />
            <ThreadMedia post={post} onOpen={open} />

            {/* Engagement row — same set and arrangement as Community Help:
                Like · Reply · Share · Save, evenly spread within a bounded width. */}
            <div className="mt-3 flex max-w-[16rem] items-center justify-between text-muted-foreground">
              <LikeButton postId={post.id} initialLikes={post.likes} initialLiked={post.liked} variant="row" />
              <Link
                href={`/chatrooms/community?q=${post.id}`}
                className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Reply"
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
              <SaveButton postId={post.id} variant="row" />
            </div>

            {copied && (
              <span className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="size-3.5" /> Copied
              </span>
            )}
          </>
        )}
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
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [menuOpen])

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
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[15px]">
            <span className="font-bold tracking-tight text-foreground">{ANON_NAME}</span>
            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Only you can see this
            </span>
            {post.edited && <EditedIndicator />}
          </div>

          {/* Overflow menu — owner-only Edit/Delete (anonymous posts are always
              the viewer's own). Hidden while editing. */}
          {!editing && (
            <div ref={menuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className={cn(
                  "-mr-1 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                  menuOpen && "bg-secondary text-foreground",
                )}
                aria-label="Post options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <MoreHorizontal className="size-5" />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-2xl border border-border/60 bg-card p-1 shadow-xl duration-150 animate-in fade-in zoom-in-95"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      setEditing(true)
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
                  >
                    <Pencil className="size-4" /> Edit
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      remove()
                    }}
                    disabled={pending}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
                  >
                    <Trash2 className="size-4" /> Delete
                  </button>
                </div>
              )}
            </div>
          )}
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
                {renderMessageBody(post.body, { link: true, mention: true })}
              </p>
            )}
            <BibleChips text={post.body} className="mt-3" />
            <ThreadMedia post={post} />
            <p className="mt-2 text-xs text-muted-foreground">Posted {post.postedAt}</p>
          </>
        )}

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    </article>
  )
}
