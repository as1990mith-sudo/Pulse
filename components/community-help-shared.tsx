"use client"

import { useCallback, useState, useSyncExternalStore, useTransition } from "react"
import { BookOpen, Bookmark, Heart } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { EditedIndicator } from "@/components/edited-indicator"
import { detectBibleRefs } from "@/lib/bible-refs"
import { cn } from "@/lib/utils"
import { setCommunityPostLike, type CommunityPostView } from "@/app/actions/community"

/**
 * Shared building blocks for the Community Help feed and the dedicated
 * conversation screen, so both render the anonymous identity, scripture chips,
 * and Save affordance identically and stay in sync.
 */

export const ANON_AVATAR = "/community-help-avatar.png"
export const ANON_NAME = "Anonymous"

/* -------------------------------------------------------------------------- */
/*  Session-level "saved questions" store                                     */
/* -------------------------------------------------------------------------- */

// Save is a visual, session-only affordance (no DB column yet). A tiny external
// store keeps the feed card and the open conversation in sync when either one
// toggles the same question.
const savedIds = new Set<number>()
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function toggleSaved(id: number) {
  if (savedIds.has(id)) savedIds.delete(id)
  else savedIds.add(id)
  emit()
}

export function useIsSaved(id: number): boolean {
  const subscribe = useCallback((cb: () => void) => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }, [])
  return useSyncExternalStore(
    subscribe,
    () => savedIds.has(id),
    () => false,
  )
}

/* -------------------------------------------------------------------------- */
/*  Anonymous identity (universal warm avatar + fixed name)                   */
/* -------------------------------------------------------------------------- */

/**
 * The universal warm anonymous avatar on its own. Used both inline (inside
 * AnonIdentity) and as the standalone left-column avatar in the indented feed
 * and conversation layouts.
 *
 * When `selfPost` is the viewer's OWN post, we show the viewer's real profile
 * picture instead of the anonymous avatar — the author recognises their own
 * question, while every other viewer still sees the anonymous avatar (the
 * author's identity data is never sent to other clients).
 */
export function CommunityAvatar({
  size = "md",
  selfPost,
}: {
  size?: "md" | "lg"
  selfPost?: CommunityPostView | null
}) {
  const ring = cn("shrink-0 ring-2 ring-border/70", size === "lg" ? "size-12" : "size-11")

  if (selfPost?.isSelf) {
    return (
      <Avatar className={ring}>
        {selfPost.authorImage && <AvatarImage src={selfPost.authorImage || "/placeholder.svg"} alt="Your profile" />}
        <AvatarFallback className={cn("font-bold text-white", selfPost.authorColor)}>
          {selfPost.authorInitials ?? "?"}
        </AvatarFallback>
      </Avatar>
    )
  }

  return (
    <Avatar className={ring}>
      <AvatarImage src={ANON_AVATAR || "/placeholder.svg"} alt="Anonymous asker" />
      <AvatarFallback className="bg-muted font-bold text-muted-foreground">?</AvatarFallback>
    </Avatar>
  )
}

/** Name + timestamp line for an anonymous post, without the avatar. */
export function AnonMeta({ postedAt, edited }: { postedAt: string; edited?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-foreground">
        {ANON_NAME}
        {edited && <EditedIndicator />}
      </p>
      <p className="text-xs text-muted-foreground">{postedAt}</p>
    </div>
  )
}

/** Name + timestamp line shown to the author on their OWN post, without avatar. */
export function SelfMeta({ post, edited }: { post: CommunityPostView; edited?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-foreground">
        You
        {edited && <EditedIndicator />}
      </p>
      <p className="text-xs text-muted-foreground">
        {post.postedAt} · <span className="font-medium text-primary">only you see this</span>
      </p>
    </div>
  )
}

export function AnonIdentity({
  postedAt,
  edited,
  size = "md",
}: {
  postedAt: string
  edited?: boolean
  size?: "md" | "lg"
}) {
  return (
    <div className="flex items-center gap-3">
      <CommunityAvatar size={size} />
      <AnonMeta postedAt={postedAt} edited={edited} />
    </div>
  )
}

/**
 * Shown to the post's author on their OWN post: a warm "You" label so they can
 * recognise their own question. Everyone else still sees "Anonymous".
 */
export function SelfIdentity({
  post,
  edited,
  size = "md",
}: {
  post: CommunityPostView
  edited?: boolean
  size?: "md" | "lg"
}) {
  return (
    <div className="flex items-center gap-3">
      <CommunityAvatar size={size} selfPost={post} />
      <SelfMeta post={post} edited={edited} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Scripture reference chips                                                  */
/* -------------------------------------------------------------------------- */

export function BibleChips({ text, className }: { text: string; className?: string }) {
  const refs = detectBibleRefs(text)
  if (refs.length === 0) return null
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {refs.map((ref) => (
        <a
          key={ref.label}
          href={ref.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
        >
          <BookOpen className="size-3.5" />
          {ref.label}
        </a>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Save button (bookmark)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Like toggle for an anonymous post. Optimistic: flips the heart + count
 * instantly, then persists via the server action, rolling back on failure so
 * the UI never drifts. Shared by the feed card ("inline") and the open
 * conversation's top bar ("icon"), which shows the heart with no label.
 */
export function LikeButton({
  postId,
  initialLikes,
  initialLiked,
  variant = "inline",
}: {
  postId: number
  initialLikes: number
  initialLiked: boolean
  variant?: "inline" | "icon"
}) {
  const [liked, setLiked] = useState(initialLiked)
  const [likes, setLikes] = useState(initialLikes)
  const [, startTransition] = useTransition()

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    const next = !liked
    setLiked(next)
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)))
    startTransition(async () => {
      try {
        await setCommunityPostLike({ postId, liked: next })
      } catch {
        setLiked(!next)
        setLikes((n) => Math.max(0, n + (next ? -1 : 1)))
      }
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
      className={cn(
        "flex items-center gap-1.5 rounded-full font-medium transition-colors",
        variant === "inline" ? "px-2 py-1.5 text-sm" : "p-2",
        liked ? "text-rose-500" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Heart className={cn("size-5", variant === "inline" && "size-4", liked && "fill-current")} />
      {variant === "inline" && likes > 0 && <span className="tabular-nums">{likes}</span>}
    </button>
  )
}

export function SaveButton({
  postId,
  variant = "inline",
  }: {
  postId: number
  variant?: "inline" | "icon"
  }) {
  const saved = useIsSaved(postId)
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        toggleSaved(postId)
      }}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save question"}
  className={cn(
  "flex items-center gap-1.5 rounded-full text-sm font-medium transition-colors",
  variant === "inline" ? "px-2 py-1.5" : "p-2",
  saved
  ? "text-emerald-600 dark:text-emerald-400"
  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
  )}
    >
      <Bookmark className={cn("size-4", saved && "fill-current")} />
    </button>
  )
}
