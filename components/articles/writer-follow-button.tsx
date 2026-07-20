"use client"

import { useState, useTransition } from "react"
import { Check, Loader2, Plus } from "lucide-react"
import { setWriterFollow } from "@/app/actions/articles"
import { cn } from "@/lib/utils"

/**
 * Follow / unfollow a writer's articles. Optimistic: flips immediately, reverts
 * on error. Separate from the social follow graph.
 */
export function WriterFollowButton({
  writerId,
  initialFollowing,
  size = "md",
  className,
}: {
  writerId: string
  initialFollowing: boolean
  size?: "sm" | "md"
  className?: string
}) {
  const [following, setFollowing] = useState(initialFollowing)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !following
    setFollowing(next)
    startTransition(async () => {
      try {
        await setWriterFollow({ writerId, following: next })
      } catch {
        setFollowing(!next)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={following}
      className={cn(
        "tap-scale inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-colors disabled:opacity-70",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        following
          ? "border border-border/70 bg-secondary/50 text-foreground hover:bg-secondary"
          : "bg-primary text-primary-foreground shadow-soft hover:opacity-90",
        className,
      )}
    >
      {pending ? (
        <Loader2 className={cn("animate-spin", size === "sm" ? "size-3.5" : "size-4")} />
      ) : following ? (
        <Check className={size === "sm" ? "size-3.5" : "size-4"} />
      ) : (
        <Plus className={size === "sm" ? "size-3.5" : "size-4"} />
      )}
      {following ? "Following" : "Follow"}
    </button>
  )
}
