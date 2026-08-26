"use client"

import type React from "react"
import { Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The one and only video control bar: play/pause, ±10s skip, elapsed/total time,
 * a draggable seek track and an optional mute toggle.
 *
 * This exists as a shared component because the two full-screen players are
 * different implementations — the community viewer drives `FeedVideo`, while the
 * main feed's viewer is `ReelsFeed`'s own swipeable pager — and they had drifted
 * apart badly: `FeedVideo` had the full bar while `ReelsFeed` had nothing but a
 * bare seek line (no play/pause button, no skip, no time). Rendering the same
 * markup from both is the only way "exactly the same" stays true, instead of
 * being two lookalikes that diverge on the next edit.
 *
 * Contrast: icons are pure white with a drop shadow, matching the action rail
 * that sits directly above them. The previous bar mixed `text-white/90` time
 * with thin 20px stroke icons and a `white/25` track, which read as washed-out
 * grey against that bright rail.
 */

export const SKIP_SECONDS = 10

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

/** Height the bar occupies above its container's bottom edge: `pb-2.5`
 *  (0.625rem) plus the 1.5rem-tall control row (`size-6` icons / `h-6` track).
 *  Full-screen overlays stack their own chrome above the player and clear it by
 *  reference, so keep this in step with the padding and the row's tallest child.
 *  Excludes the safe-area inset, which callers add themselves via `safeArea`. */
export const VIDEO_CONTROLS_HEIGHT = "2.125rem"

export function VideoControlsBar({
  playing,
  current,
  duration,
  progress,
  onTogglePlay,
  onSkip,
  seekRef,
  onSeekPointerDown,
  onSeekPointerMove,
  onSeekPointerUp,
  onSeekKeyDown,
  dragging = false,
  muted,
  onToggleMute,
  safeArea = false,
  visible = true,
  className,
}: {
  playing: boolean
  /** Elapsed and total seconds, both measured inside the clip's trim window so
   *  a trimmed clip reads 0:00 at its own start rather than the source file's. */
  current: number
  duration: number
  /** Fill percentage (0-100) of the seek track. */
  progress: number
  onTogglePlay: () => void
  onSkip: (deltaSeconds: number) => void
  seekRef: React.RefObject<HTMLDivElement | null>
  // Typed against the div these land on. A bare `React.PointerEvent` defaults to
  // `Element`, which callers that annotate their handlers as `HTMLDivElement`
  // cannot satisfy (handler params are checked contravariantly).
  onSeekPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onSeekPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onSeekPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
  onSeekKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void
  /** Enlarges the thumb while scrubbing. */
  dragging?: boolean
  /** Omit both to drop the mute toggle — for overlays whose action rail already
   *  publishes a mute button driving the same shared state. */
  muted?: boolean
  onToggleMute?: () => void
  /** The bar sits on the device's bottom edge, so add the safe-area inset to
   *  lift it clear of the home indicator / gesture strip. */
  safeArea?: boolean
  /** Drives the fade. Full-screen viewers tie this to their chrome state so a
   *  tap hides the bar along with the author row and action rail. */
  visible?: boolean
  className?: string
}) {
  const iconBtn = "text-white drop-shadow-md transition-transform active:scale-90"

  return (
    <div
      className={cn(
        // `pointer-events-none` here with `pointer-events-auto` on the row is
        // load-bearing: `pt-10` makes this box tall enough to cover a chunk of
        // the frame, and while it was hit-testable it swallowed taps meant for
        // the video surface underneath.
        "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pt-10 transition-opacity duration-300",
        safeArea ? "pb-[calc(0.625rem+env(safe-area-inset-bottom))]" : "pb-2.5",
        visible ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      <div className={cn("flex items-center gap-3", visible ? "pointer-events-auto" : "pointer-events-none")}>
        <button type="button" onClick={onTogglePlay} aria-label={playing ? "Pause" : "Play"} className={iconBtn}>
          {playing ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current" />}
        </button>

        <button
          type="button"
          onClick={() => onSkip(-SKIP_SECONDS)}
          aria-label="Back 10 seconds"
          className={cn("relative", iconBtn)}
        >
          <RotateCcw className="size-6" strokeWidth={2.25} />
          <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">10</span>
        </button>

        <button
          type="button"
          onClick={() => onSkip(SKIP_SECONDS)}
          aria-label="Forward 10 seconds"
          className={cn("relative", iconBtn)}
        >
          <RotateCw className="size-6" strokeWidth={2.25} />
          <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">10</span>
        </button>

        <span className="select-none text-sm font-semibold tabular-nums text-white drop-shadow-md">
          {formatTime(current)} / {formatTime(duration)}
        </span>

        <div
          ref={seekRef}
          onPointerDown={onSeekPointerDown}
          onPointerMove={onSeekPointerMove}
          onPointerUp={onSeekPointerUp}
          onPointerCancel={onSeekPointerUp}
          onKeyDown={onSeekKeyDown}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          tabIndex={0}
          className="group relative flex h-6 flex-1 cursor-pointer touch-none items-center"
        >
          <span className="h-2 w-full overflow-hidden rounded-full bg-white/40 shadow-sm">
            <span className="block h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
          </span>
          <span
            className={cn(
              "absolute size-4 -translate-x-1/2 rounded-full bg-white shadow-md ring-1 ring-black/20 transition-transform",
              dragging ? "scale-125" : "scale-100 group-hover:scale-110",
            )}
            style={{ left: `${progress}%` }}
          />
        </div>

        {onToggleMute && (
          <button type="button" onClick={onToggleMute} aria-label={muted ? "Unmute" : "Mute"} className={iconBtn}>
            {muted ? <VolumeX className="size-6" strokeWidth={2.25} /> : <Volume2 className="size-6" strokeWidth={2.25} />}
          </button>
        )}
      </div>
    </div>
  )
}
