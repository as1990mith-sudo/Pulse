"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Play, Pause, Volume2, VolumeX, RotateCcw, RotateCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { getSharedMuted, setSharedMuted, useSharedMute } from "@/lib/shared-mute"
import {
  rememberVideoPosition,
  getVideoPosition,
  getImmersiveViewerOpen,
  useImmersiveViewerOpen,
} from "@/lib/video-handoff"
import { registerActiveVideo, reconcileActiveVideo, setManualActiveVideo } from "@/lib/active-video"

/**
 * A feed video with a modern, minimal custom control bar.
 *
 * Playback behavior:
 * - Auto-plays when scrolled ≥60% into view and pauses when scrolled away, so
 *   only the clip currently in view plays.
 * - Defaults to sound ON. Because browsers block autoplay-with-audio until the
 *   user has interacted with the page, we attempt an unmuted autoplay and, if
 *   the browser rejects it, fall back to muted playback. The user's mute choice
 *   is shared across all feed videos so once they unmute (or the browser allows
 *   sound) it sticks while scrolling.
 *
 * Appearance:
 * - Until the clip first starts playing we paint our own premium poster overlay
 *   on top of the element. This hides the browser's blurry default play-glyph
 *   (rendered in the <video> shadow DOM on some mobile browsers) entirely, so
 *   the user only ever sees our branded play button.
 *
 * Controls:
 * - Tap the frame to play/pause, skip ±10s, and scrub by tapping OR dragging the
 *   time track (pointer + keyboard).
 */

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

const SKIP_SECONDS = 10

export function FeedVideo({
  src,
  className,
  poster,
  trimStart,
  trimEnd,
  onAspectRatio,
  onExpand,
  resume = false,
  ignoreViewerGate = false,
}: {
  src: string
  className?: string
  /** Optional cover image chosen in the editor; shown until playback starts. */
  poster?: string
  /** Trim window in seconds. Playback is kept within [trimStart, trimEnd] so
   *  viewers only ever see the trimmed selection — the file itself is untouched. */
  trimStart?: number
  trimEnd?: number
  /** Fires once real dimensions are known so a parent can size its frame to the
   *  clip's natural aspect ratio (width / height). */
  onAspectRatio?: (ratio: number) => void
  /** When provided, tapping the video surface (and the poster / center play
   *  affordances) calls this instead of toggling play — used by the community
   *  feed so tapping anywhere on the clip opens the full post. The bottom
   *  control bar still handles play/pause, seek, and mute. */
  onExpand?: () => void
  /** Start from the position the same clip (by src) last reached inline, so
   *  expanding a playing preview continues instead of restarting. */
  resume?: boolean
  /** This player owns playback (e.g. the expanded post overlay), so it should
   *  keep playing even while the immersive-viewer pause gate is active — that
   *  gate exists to silence the *inline* feed clip behind it, not this one. */
  ignoreViewerGate?: boolean
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const seekRef = useRef<HTMLDivElement>(null)
  // The coordinator entry for this player, so manual play can mark it the winner.
  const entryRef = useRef<{ distanceToCenter: () => number; play: () => void; pause: () => void } | null>(null)
  const userPausedRef = useRef(false)
  const programmaticPauseRef = useRef(false)
  const draggingRef = useRef(false)
  // Whether the clip is currently scrolled into view, so we can resume the
  // right clips when the immersive viewer closes.
  const inViewRef = useRef(false)

  // While the full-screen reel viewer is open, inline feed videos must not play
  // (otherwise the feed clip and the expanded clip play at once).
  const viewerOpen = useImmersiveViewerOpen()

  // The active trim window. `windowEndRef` is finalized once real duration is
  // known (on loadedmetadata); until then it's the requested end or +Infinity.
  const windowStartRef = useRef(Math.max(0, trimStart ?? 0))
  const windowEndRef = useRef(trimEnd != null ? trimEnd : Number.POSITIVE_INFINITY)
  windowStartRef.current = Math.max(0, trimStart ?? 0)

  // Mute is a single app-wide preference shared with the expanded reel player.
  const [muted, setMuted] = useSharedMute()
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  // Stays false until the clip has begun playing at least once. While false we
  // show a full-bleed premium poster that hides the native play-glyph flash.
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (el) el.muted = muted
  }, [muted])

  // Try to play with sound; if the browser blocks it, fall back to muted.
  const attemptPlay = useCallback((el: HTMLVideoElement) => {
    // Never autoplay while another player owns playback (expanded reel viewer or
    // the community post overlay) — unless this instance IS that owner.
    if (!ignoreViewerGate && getImmersiveViewerOpen()) return
    // Never start outside the trimmed window.
    if (el.currentTime < windowStartRef.current || el.currentTime >= windowEndRef.current) {
      try {
        el.currentTime = windowStartRef.current
      } catch {
        /* not seekable yet */
      }
    }
    el.muted = getSharedMuted()
    el.play().catch(() => {
      if (!getSharedMuted()) {
        setSharedMuted(true)
        el.muted = true
        el.play().catch(() => {})
      }
    })
  }, [ignoreViewerGate])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // An in-view player does not play itself — it registers with the app-wide
    // coordinator, which lets only the clip nearest the viewport center play and
    // pauses all the others. This is what prevents two stacked feed videos from
    // playing at once. `unregister` is (re)created as this clip enters/leaves view.
    let unregister: (() => void) | null = null

    const entry = {
      // Distance from this clip's center to the viewport center — the smallest
      // wins the single "active" slot.
      distanceToCenter: () => {
        const rect = el.getBoundingClientRect()
        const clipCenter = rect.top + rect.height / 2
        return Math.abs(clipCenter - window.innerHeight / 2)
      },
      play: () => {
        if (!userPausedRef.current) attemptPlay(el)
      },
      pause: () => {
        if (!el.paused) {
          programmaticPauseRef.current = true
          el.pause()
        }
      },
    }
    entryRef.current = entry

    const observer = new IntersectionObserver(
      ([obs]) => {
        const visible = obs.isIntersecting && obs.intersectionRatio >= 0.6
        inViewRef.current = visible
        if (visible) {
          // Become eligible to play; the coordinator decides if we actually do.
          if (!unregister) unregister = registerActiveVideo(entry)
        } else {
          // No longer eligible — leave the running set (this also pauses us) and
          // clear the user-pause flag so re-entering view can autoplay again.
          if (unregister) {
            unregister()
            unregister = null
          }
          userPausedRef.current = false
        }
      },
      { threshold: [0, 0.6, 1] },
    )
    observer.observe(el)

    // As the user scrolls between two simultaneously-visible clips, re-pick the
    // one nearest center so playback follows focus.
    const onScroll = () => reconcileActiveVideo()
    window.addEventListener("scroll", onScroll, { passive: true })

    return () => {
      observer.disconnect()
      window.removeEventListener("scroll", onScroll)
      if (unregister) unregister()
      entryRef.current = null
    }
  }, [attemptPlay])

  // Pause inline playback while the immersive viewer is open, and resume the
  // in-view clip (unless the user had paused it) once it closes — so expanding
  // hands playback off cleanly instead of running two videos at once.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // The owner instance (e.g. the expanded post overlay) ignores the gate.
    if (ignoreViewerGate) return
    if (viewerOpen) {
      programmaticPauseRef.current = true
      el.pause()
    } else if (inViewRef.current && !userPausedRef.current) {
      // Reverse hand-off: while the expanded player owned playback it advanced
      // the shared position for this src. Seek the inline preview there before
      // resuming so closing the expand continues from where it reached (not the
      // stale spot where the preview paused). For any other clip this resolves
      // to its own last position — a harmless no-op.
      const handoff = getVideoPosition(src)
      if (handoff != null && handoff >= windowStartRef.current && handoff < windowEndRef.current) {
        try {
          el.currentTime = handoff
          setCurrent(Math.max(0, handoff - windowStartRef.current))
        } catch {
          /* not seekable yet — attemptPlay clamps into the window anyway */
        }
      }
      attemptPlay(el)
    }
  }, [viewerOpen, attemptPlay, ignoreViewerGate, src])

  function togglePlay() {
    const el = ref.current
    if (!el) return
    if (el.paused) {
      userPausedRef.current = false
      // Manually starting a clip makes it the active one regardless of scroll
      // position, pausing any other inline video that happened to be playing.
      if (entryRef.current) setManualActiveVideo(entryRef.current)
      attemptPlay(el)
      reconcileActiveVideo()
    } else {
      userPausedRef.current = true
      // Releasing the manual override lets nearest-to-center selection resume.
      setManualActiveVideo(null)
      el.pause()
    }
  }

  // Tapping the video surface / poster / center affordance: expand when a
  // parent opted in (community feed), otherwise the default play/pause toggle.
  const surfaceClick = onExpand ?? togglePlay
  const surfaceLabel = onExpand ? "Open post" : "Play video"

  function toggleMute() {
    const el = ref.current
    const next = !muted
    setSharedMuted(next)
    if (el) {
      el.muted = next
      // Unmuting counts as a user gesture, so playback with sound is allowed.
      if (!next && el.paused && !userPausedRef.current) el.play().catch(() => {})
    }
  }

  function skip(delta: number) {
    const el = ref.current
    if (!el) return
    const ws = windowStartRef.current
    const we = Number.isFinite(windowEndRef.current) ? windowEndRef.current : el.duration || 0
    const next = Math.min(we, Math.max(ws, el.currentTime + delta))
    el.currentTime = next
    setCurrent(next - ws)
  }

  // Translate a pointer x-position over the track into a seek time.
  const seekToClientX = useCallback(
    (clientX: number) => {
      const el = ref.current
      const bar = seekRef.current
      if (!el || !bar) return
      // `duration` state is the trimmed window length; map the track to it.
      const total = duration || 0
      if (!total) return
      const rect = bar.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      el.currentTime = windowStartRef.current + ratio * total
      setCurrent(ratio * total)
    },
    [duration],
  )

  function onSeekPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    seekToClientX(e.clientX)
  }

  function onSeekPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    seekToClientX(e.clientX)
  }

  function onSeekPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* pointer already released */
    }
  }

  function onSeekKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") {
      e.preventDefault()
      skip(SKIP_SECONDS)
    } else if (e.key === "ArrowLeft") {
      e.preventDefault()
      skip(-SKIP_SECONDS)
    }
  }

  const progress = duration > 0 ? (current / duration) * 100 : 0

  // Append a media-fragment so mobile browsers decode and paint the frame at
  // 0.1s as the element's thumbnail — even before the clip scrolls fully into
  // view or starts playing. This is what makes the real first frame show
  // instead of the browser's blurry default play-glyph on a grey box.
  const posterTime = (trimStart ?? 0) > 0 ? (trimStart as number) : 0.1
  const posterSrc = src.includes("#") ? src : `${src}#t=${posterTime}`

  return (
    // Fill the parent frame (e.g. MindFeed's fixed 4:5 card) so every overlay —
    // the poster, the centered play button, and the bottom control bar — anchors
    // to the *visible* crop rather than the video's full natural height. Without
    // this the wrapper grew to the clip's intrinsic (e.g. 9:16) height, centering
    // the play button off-frame and pushing the controls out of the 4:5 view.
    <div className="group absolute inset-0 overflow-hidden bg-black">
      <video
        ref={ref}
        src={posterSrc}
        poster={poster}
        loop
        playsInline
        muted={muted}
        preload="metadata"
        className={cn("h-full w-full", className)}
        onClick={surfaceClick}
        onPlay={() => {
          setPlaying(true)
          setStarted(true)
          userPausedRef.current = false
        }}
        onPause={() => {
          setPlaying(false)
          if (programmaticPauseRef.current) {
            programmaticPauseRef.current = false
            return
          }
          userPausedRef.current = true
        }}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget
          if (onAspectRatio && el.videoWidth > 0 && el.videoHeight > 0) {
            onAspectRatio(el.videoWidth / el.videoHeight)
          }
          const real = el.duration && isFinite(el.duration) ? el.duration : 0
          // Finalize the trim window against the real duration, then expose the
          // trimmed length as the video's duration so all controls treat the
          // clip as if it were exactly the selected range.
          const ws = Math.max(0, Math.min(trimStart ?? 0, real))
          const we = Math.min(trimEnd != null ? trimEnd : real, real)
          windowStartRef.current = ws
          windowEndRef.current = we > ws ? we : real
          setDuration(Math.max(0, windowEndRef.current - ws))
          // Seek to the window start so the trimmed first frame is the thumbnail —
          // unless we're resuming a hand-off, in which case continue from the
          // position the inline preview last reached (clamped to the window).
          if (!started) {
            const handoff = resume ? getVideoPosition(src) : undefined
            const resumeAt =
              handoff != null && handoff >= ws && handoff < windowEndRef.current ? handoff : ws > 0 ? ws : 0.1
            try {
              el.currentTime = resumeAt
              setCurrent(Math.max(0, resumeAt - ws))
            } catch {
              /* seek not ready yet — the media fragment still covers this */
            }
          }
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget
          // Keep playback inside the trimmed window, looping back to its start.
          if (el.currentTime >= windowEndRef.current) {
            try {
              el.currentTime = windowStartRef.current
            } catch {
              /* ignore */
            }
          } else if (el.currentTime < windowStartRef.current - 0.05) {
            try {
              el.currentTime = windowStartRef.current
            } catch {
              /* ignore */
            }
          }
          // While actively dragging, the thumb is driven by the pointer.
          if (!draggingRef.current) {
            setCurrent(Math.max(0, el.currentTime - windowStartRef.current))
          }
          // Remember the absolute position so expanding into the reel can
          // continue from exactly here instead of restarting.
          rememberVideoPosition(src, el.currentTime)
        }}
      />

      {/* Premium poster overlay — sits on top of the real first-frame thumbnail
          with a light scrim so the thumbnail stays visible, while still hiding
          the browser's blurry default play-glyph until the clip first plays. */}
      {!started && (
        <button
          type="button"
          onClick={surfaceClick}
          aria-label={surfaceLabel}
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/45 via-black/15 to-black/25"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-white/15 text-white shadow-lg ring-1 ring-white/25 backdrop-blur-md transition-transform duration-200 group-hover:scale-105">
            <Play className="size-7 translate-x-0.5 fill-current" />
          </span>
        </button>
      )}

      {/* Center play affordance — shown only while paused after first play. */}
      {started && !playing && (
        <button
          type="button"
          onClick={surfaceClick}
          aria-label={surfaceLabel}
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/20 backdrop-blur-md transition-transform duration-200 hover:scale-105">
            <Play className="size-7 translate-x-0.5 fill-current" />
          </span>
        </button>
      )}

      {/* Bottom control bar */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-10 transition-opacity duration-200",
          started ? "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100" : "opacity-0",
        )}
      >
        <div className="pointer-events-auto flex items-center gap-2.5">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="text-white transition-transform hover:scale-110"
          >
            {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
          </button>

          <button
            type="button"
            onClick={() => skip(-SKIP_SECONDS)}
            aria-label="Back 10 seconds"
            className="relative text-white transition-transform hover:scale-110"
          >
            <RotateCcw className="size-5" />
            <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold">10</span>
          </button>

          <button
            type="button"
            onClick={() => skip(SKIP_SECONDS)}
            aria-label="Forward 10 seconds"
            className="relative text-white transition-transform hover:scale-110"
          >
            <RotateCw className="size-5" />
            <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold">10</span>
          </button>

          <span className="select-none text-xs font-medium tabular-nums text-white/90">
            {formatTime(current)} / {formatTime(duration)}
          </span>

          {/* Draggable seek bar */}
          <div
            ref={seekRef}
            onPointerDown={onSeekPointerDown}
            onPointerMove={onSeekPointerMove}
            onPointerUp={onSeekPointerUp}
            onKeyDown={onSeekKeyDown}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(current)}
            tabIndex={0}
            className="relative flex h-5 flex-1 cursor-pointer touch-none items-center"
          >
            <span className="h-1.5 w-full overflow-hidden rounded-full bg-white/25">
              <span className="block h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
            </span>
            <span
              className="absolute size-3.5 -translate-x-1/2 rounded-full bg-white shadow ring-2 ring-black/20"
              style={{ left: `${progress}%` }}
            />
          </div>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="text-white transition-transform hover:scale-110"
          >
            {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
        </div>
      </div>
    </div>
  )
}
