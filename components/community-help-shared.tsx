"use client"

import { useCallback, useSyncExternalStore } from "react"
import { BookOpen, Bookmark } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { EditedIndicator } from "@/components/edited-indicator"
import { detectBibleRefs } from "@/lib/bible-refs"
import { cn } from "@/lib/utils"
import type { CommunityPostView } from "@/app/actions/community"

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
      <Avatar className={cn("shrink-0 ring-2 ring-emerald-500/30", size === "lg" ? "size-12" : "size-11")}>
        <AvatarImage src={ANON_AVATAR || "/placeholder.svg"} alt="Anonymous asker" />
        <AvatarFallback className="bg-emerald-600 font-bold text-white">?</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-foreground">
          {ANON_NAME}
          {edited && <EditedIndicator />}
        </p>
        <p className="text-xs text-muted-foreground">{postedAt}</p>
      </div>
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
      <Avatar className={cn("shrink-0 ring-2 ring-emerald-500/30", size === "lg" ? "size-12" : "size-11")}>
        <AvatarImage src={ANON_AVATAR || "/placeholder.svg"} alt="" />
        <AvatarFallback className="bg-emerald-600 font-bold text-white">?</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-foreground">
          You
          {edited && <EditedIndicator />}
        </p>
        <p className="text-xs text-muted-foreground">
          {post.postedAt} · <span className="font-medium text-emerald-600 dark:text-emerald-400">only you see this</span>
        </p>
      </div>
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
        "flex items-center gap-2 rounded-full text-sm font-medium transition-colors",
        variant === "inline" ? "px-3 py-1.5" : "p-2",
        saved
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Bookmark className={cn("size-4", saved && "fill-current")} />
      {variant === "inline" && (saved ? "Saved" : "Save")}
    </button>
  )
}
