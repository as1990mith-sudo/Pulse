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
 * Identity is revealed when the post is identifiable (`anonymous === false`,
 * shown to everyone) or when the viewer is the author (`isSelf`, shown only to
 * them) — in both cases we render the author's real profile picture. Otherwise
 * the universal anonymous avatar is shown and no author identity is exposed.
 */
export function CommunityAvatar({
  size = "md",
  post,
  onAuthorClick,
}: {
  size?: "md" | "lg"
  post?: CommunityPostView | null
  /** When set and the post is identifiable, the avatar becomes a profile link. */
  onAuthorClick?: (authorId: string) => void
}) {
  const ring = cn("shrink-0 ring-2 ring-border/70", size === "lg" ? "size-12" : "size-11")

  const reveal = post && (post.isSelf || !post.anonymous) && (post.authorImage || post.authorInitials)
  if (reveal) {
    const avatar = (
      <Avatar className={ring}>
        {post.authorImage && <AvatarImage src={post.authorImage || "/placeholder.svg"} alt={post.authorName ?? "Author"} />}
        <AvatarFallback className={cn("font-bold text-white", post.authorColor)}>
          {post.authorInitials ?? "?"}
        </AvatarFallback>
      </Avatar>
    )
    // Only identifiable posts expose a tappable profile — never anonymous ones.
    if (!post.anonymous && post.authorId && onAuthorClick) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAuthorClick(post.authorId!)
          }}
          className="rounded-full transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={`View ${post.authorName ?? "member"}'s profile`}
        >
          {avatar}
        </button>
      )
    }
    return avatar
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
      <p className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-foreground">
        {ANON_NAME}
        {/* Date moved inline next to the name (was on its own line below). */}
        <span className="shrink-0 text-xs font-normal text-muted-foreground">· {postedAt}</span>
        {edited && <EditedIndicator />}
      </p>
    </div>
  )
}

/**
 * Name + timestamp line shown to the author on their OWN anonymous post, without
 * avatar. The name stays "Anonymous" (matching how everyone else sees it) with a
 * subtle "You" marker so the author still recognises their own post.
 */
export function SelfMeta({ post, edited }: { post: CommunityPostView; edited?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-foreground">
        {ANON_NAME}
        {/* "You" marker removed; date moved inline next to the name. */}
        <span className="shrink-0 text-xs font-normal text-muted-foreground">· {post.postedAt}</span>
        {edited && <EditedIndicator />}
      </p>
    </div>
  )
}

/**
 * Name + handle + timestamp line for an IDENTIFIABLE post (the author chose to
 * show who they are), rendered without the avatar. Shown to every viewer.
 */
export function IdentityMeta({
  post,
  edited,
  onAuthorClick,
}: {
  post: CommunityPostView
  edited?: boolean
  onAuthorClick?: (authorId: string) => void
}) {
  const clickable = post.authorId && onAuthorClick
  const name = <span className="truncate">{post.authorName ?? "Member"}</span>
  return (
    <div className="min-w-0">
      {/* Display name + timestamp on the first line. */}
      <p className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-foreground">
        {clickable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onAuthorClick!(post.authorId!)
            }}
            className="truncate rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {post.authorName ?? "Member"}
          </button>
        ) : (
          name
        )}
        {/* "· you" self marker intentionally removed. */}
        <span className="shrink-0 text-xs font-normal text-muted-foreground">· {post.postedAt}</span>
        {edited && <EditedIndicator />}
      </p>
      {/* Username handle stacked below the display name. */}
      {post.authorHandle && (
        <p className="truncate text-xs font-normal leading-tight text-muted-foreground">{post.authorHandle}</p>
      )}
    </div>
  )
}

/**
 * Chooses the correct meta line (name/timestamp) for a post based on the
 * author's anonymity choice and whether the viewer is the author:
 *  - identifiable post → real name + handle (everyone)
 *  - anonymous + author → "You · only you see this"
 *  - anonymous + others → "Anonymous"
 */
export function PostMeta({
  post,
  edited,
  onAuthorClick,
}: {
  post: CommunityPostView
  edited?: boolean
  onAuthorClick?: (authorId: string) => void
}) {
  if (!post.anonymous) return <IdentityMeta post={post} edited={edited} onAuthorClick={onAuthorClick} />
  if (post.isSelf) return <SelfMeta post={post} edited={edited} />
  return <AnonMeta postedAt={post.postedAt} edited={edited} />
}

/** Avatar + meta combined, for the conversation header. Mirrors PostMeta logic. */
export function PostIdentity({
  post,
  edited,
  size = "md",
  onAuthorClick,
}: {
  post: CommunityPostView
  edited?: boolean
  size?: "md" | "lg"
  onAuthorClick?: (authorId: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <CommunityAvatar size={size} post={post} onAuthorClick={onAuthorClick} />
      <PostMeta post={post} edited={edited} onAuthorClick={onAuthorClick} />
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
      <CommunityAvatar size={size} post={post} />
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
  variant?: "inline" | "icon" | "row"
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
        variant === "inline" && "px-2 py-1.5 text-sm",
        variant === "row" && "px-2 py-1.5 text-sm",
        variant === "icon" && "p-2",
        liked ? "text-rose-500" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Heart
        className={cn(
          variant === "inline" ? "size-4" : "size-5",
          liked && "fill-current",
        )}
      />
      {variant !== "icon" && likes > 0 && <span className="tabular-nums">{likes}</span>}
    </button>
  )
}

export function SaveButton({
  postId,
  variant = "inline",
}: {
  postId: number
  variant?: "inline" | "icon" | "row"
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
        variant === "inline" && "px-2 py-1.5",
        variant === "row" && "px-2 py-1.5",
        variant === "icon" && "p-2",
        saved ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Bookmark className={cn(variant === "row" || variant === "icon" ? "size-5" : "size-4", saved && "fill-current")} />
    </button>
  )
}
