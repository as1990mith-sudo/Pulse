"use client"

import { useEffect, useRef, useState } from "react"
import { Heart } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The single like heart used by every surface in the app — feed posts, reels,
 * comments, articles, episodes, devotionals, dreams and the full-screen media
 * viewers.
 *
 * Two rules it exists to enforce:
 *
 *  1. A liked heart is always the same red (`--like`), whatever the surface or
 *     theme. Before this, sites variously used `fill-current`, `text-red-500`,
 *     `fill-live` and `fill-rose-500`, so the "liked" colour shifted from screen
 *     to screen — and two of those tokens were shared with unrelated features.
 *  2. Tapping a like always animates the same way, and *only* on the
 *     unliked → liked transition. Deriving the animation from the `liked` prop
 *     alone would replay it on mount, so every already-liked post would pop as
 *     it scrolled into view.
 */
export function LikeHeart({
  liked,
  className,
  idleClassName = "text-current",
  likedClassName = "fill-like text-like",
}: {
  liked: boolean
  /** Sizing and any per-surface tweaks, e.g. `"size-5"`. */
  className?: string
  /**
   * Colour while unliked. Red is reserved for the liked state, so the resting
   * heart inherits its surface's neutral: white on the video rails, muted
   * foreground in action rows.
   */
  idleClassName?: string
  /**
   * Escape hatch for surfaces where the *container* carries the red — e.g. a
   * filled button that turns red when liked, where a red heart on red would
   * vanish. Such callers pass `"fill-current text-current"` to inherit the
   * button's foreground instead. Everything else should leave this alone.
   */
  likedClassName?: string
}) {
  const [celebrating, setCelebrating] = useState(false)
  // Seeded with the initial value so a heart that mounts already liked is not
  // treated as a fresh like.
  const previous = useRef(liked)

  useEffect(() => {
    if (previous.current === liked) return
    previous.current = liked
    // Only a new like celebrates. Un-liking resolves quietly — a burst on
    // removal reads as confirmation of the wrong thing.
    if (liked) setCelebrating(true)
  }, [liked])

  return (
    <span className={cn("relative inline-flex shrink-0", celebrating && "like-ring")}>
      <Heart
        aria-hidden
        // The heart's pop is the longer of the two animations, so this single
        // handler is the correct teardown point for the ring as well.
        onAnimationEnd={() => setCelebrating(false)}
        className={cn(
          // Colour eases in so an un-like fades out rather than snapping.
          "transition-colors duration-200",
          liked ? likedClassName : idleClassName,
          celebrating && "animate-like-pop",
          className,
        )}
      />
    </span>
  )
}
