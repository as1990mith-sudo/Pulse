"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserCheck, UserPlus } from "lucide-react"
import { toggleFollow } from "@/app/actions/follow"
import { Button } from "@/components/ui/button"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

/**
 * Compact follow/unfollow control for a post's author row, used on every
 * member-authored surface (main feed, Community threads) so following someone
 * works the same wherever you meet them.
 *
 * A follow is always recorded user-to-user: `toggleFollow` derives the follower
 * from the session, so an admin acting inside a Home still follows as their own
 * personal account. A Home is an `organization` row, never a `follow` row, so it
 * cannot be the follower — see the callers, which withhold this button entirely
 * on posts published in a Home's voice.
 */
export function FollowIconButton({
  authorId,
  authorName,
  initialFollowing,
  className,
}: {
  authorId: string
  authorName: string
  initialFollowing: boolean
  className?: string
}) {
  const router = useRouter()
  const [following, setFollowing] = useState(initialFollowing)
  const [followBurst, setFollowBurst] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onClick() {
    const next = !following
    // Optimistic, with a rollback below if the write fails.
    setFollowing(next)
    if (next) {
      haptic("medium")
      setFollowBurst(true) // delightful pop only when following
    }
    startTransition(async () => {
      try {
        await toggleFollow({ targetUserId: authorId, follow: next })
        router.refresh()
      } catch {
        setFollowing(!next)
      }
    })
  }

  return (
    <Button
      type="button"
      size="icon"
      variant={following ? "secondary" : "default"}
      onClick={onClick}
      disabled={isPending}
      className={cn("size-8 shrink-0 rounded-full", className)}
      aria-label={following ? `Unfollow ${authorName}` : `Follow ${authorName}`}
      title={following ? "Following" : "Follow"}
    >
      <span
        onAnimationEnd={() => setFollowBurst(false)}
        className={cn("inline-flex", followBurst && "motion-pop")}
      >
        {following ? <UserCheck className="size-4" /> : <UserPlus className="size-4" />}
      </span>
    </Button>
  )
}
