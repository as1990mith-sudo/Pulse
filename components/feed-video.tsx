"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Play, Pause, Volume2, VolumeX, RotateCcw, RotateCw } from "lucide-react"
import { cn } from "@/lib/utils"

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

// Shared, cross-instance mute preference. Starts unmuted ("sound on by
// default"); flips to muted only if the browser forces it or the user opts out.
let sharedMuted = false
const muteListeners = new Set<(m: boolean) => void>()
function setSharedMuted(next: boolean) {
  sharedMuted = next
  muteListeners.forEach((fn) => fn(next))
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

const SKIP_SECONDS = 10

export function FeedVideo({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const seekRef = useRef<HTMLDivElement>(null)
  const userPausedRef = useRef(false)
  const programmaticPauseRef = useRef(false)
  const draggingRef = useRef(false)

  const [muted, setMuted] = useState(sharedMuted)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  // Stays false until the clip has begun playing at least once. While false we
  // show a full-bleed premium poster that hides the native play-glyph flash.
  const [started, setStarted] = useState(false)

  // Keep this instance in sync with the shared mute preference.
  useEffect(() => {
    const fn = (m: boolean) => setMuted(m)
    muteListeners.add(fn)
    return () => {
      muteListeners.delete(fn)
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (el) el.muted = muted
  }, [muted])

  // Try to play with sound; if the browser blocks it, fall back to muted.
  const attemptPlay = useCallback((el: HTMLVideoElement) => {
    el.muted = sharedMuted
    el.play().catch(() => {
      if (!sharedMuted) {
        setSharedMuted(true)
        el.muted = true
        el.play().catch(() => {})
      }
    })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          if (!userPausedRef.current) attemptPlay(el)
        } else {
          programmaticPauseRef.current = true
          el.pause()
          userPausedRef.current = false
        }
      },
      { threshold: [0, 0.6, 1] },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [attemptPlay])

  function togglePlay() {
    const el = ref.current
    if (!el) return
    if (el.paused) {
      userPausedRef.current = false
      attemptPlay(el)
    } else {
      userPausedRef.current = true
      el.pause()
    }
  }

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
    const total = duration || el.duration || 0
    const next = Math.min(total, Math.max(0, el.currentTime + delta))
    el.currentTime = next
    setCurrent(next)
  }

  // Translate a pointer x-position over the track into a seek time.
  const seekToClientX = useCallback(
    (clientX: number) => {
      const el = ref.current
      const bar = seekRef.current
      if (!el || !bar) return
      const total = duration || el.duration || 0
      if (!total) return
      const rect = bar.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      const t = ratio * total
      el.currentTime = t
      setCurrent(t)
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
  const posterSrc = src.includes("#") ? src : `${src}#t=0.1`

  return (
    <div className="group relative overflow-hidden bg-black">
      <video
        ref={ref}
        src={posterSrc}
        loop
        playsInline
        muted={muted}
        preload="metadata"
        className={cn("w-full", className)}
        onClick={togglePlay}
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
          setDuration(e.currentTarget.duration)
          // Backstop for browsers that ignore the media fragment: nudge to a
          // tiny offset so a real frame is decoded and shown as the thumbnail.
          const el = e.currentTarget
          if (!started && el.currentTime < 0.05) {
            try {
              el.currentTime = 0.1
            } catch {
              /* seek not ready yet — the media fragment still covers this */
            }
          }
        }}
        onTimeUpdate={(e) => {
          // While actively dragging, the thumb is driven by the pointer.
          if (!draggingRef.current) setCurrent(e.currentTarget.currentTime)
        }}
      />

      {/* Premium poster overlay — sits on top of the real first-frame thumbnail
          with a light scrim so the thumbnail stays visible, while still hiding
          the browser's blurry default play-glyph until the clip first plays. */}
      {!started && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play video"
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
          onClick={togglePlay}
          aria-label="Play video"
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
