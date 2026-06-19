"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserCheck, UserPlus } from "lucide-react"
import { toggleFollow } from "@/app/actions/follow"
import { Button } from "@/components/ui/button"

export function ProfileFollowButton({
  targetUserId,
  targetName,
  initialFollowing,
}: {
  targetUserId: string
  targetName: string
  initialFollowing: boolean
}) {
  const router = useRouter()
  const [following, setFollowing] = useState(initialFollowing)
  const [hovering, setHovering] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onClick() {
    const next = !following
    setFollowing(next)
    startTransition(async () => {
      try {
        await toggleFollow({ targetUserId, follow: next })
        router.refresh()
      } catch {
        setFollowing(!next)
      }
    })
  }

  return (
    <Button
      type="button"
      variant={following ? "secondary" : "default"}
      onClick={onClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      disabled={isPending}
      className="gap-1.5"
      aria-label={following ? `Unfollow ${targetName}` : `Follow ${targetName}`}
    >
      {following ? (
        <>
          <UserCheck className="size-4" />
          {hovering ? "Unfollow" : "Following"}
        </>
      ) : (
        <>
          <UserPlus className="size-4" />
          Follow
        </>
      )}
    </Button>
  )
}
