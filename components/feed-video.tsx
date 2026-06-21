"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Play, Pause, Volume2, VolumeX } from "lucide-react"
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

export function FeedVideo({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const userPausedRef = useRef(false)
  const programmaticPauseRef = useRef(false)

  const [muted, setMuted] = useState(sharedMuted)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)

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

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    el.currentTime = ratio * duration
    setCurrent(el.currentTime)
  }

  const progress = duration > 0 ? (current / duration) * 100 : 0

  return (
    <div className="group relative">
      <video
        ref={ref}
        src={src}
        loop
        playsInline
        muted={muted}
        className={cn("w-full", className)}
        onClick={togglePlay}
        onPlay={() => {
          setPlaying(true)
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
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
      />

      {/* Center play affordance — shown only while paused */}
      {!playing && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play video"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-transform duration-200 hover:scale-105">
            <Play className="size-7 translate-x-0.5 fill-current" />
          </span>
        </button>
      )}

      {/* Bottom control bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2.5 pt-8 opacity-0 transition-opacity duration-200 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <div className="pointer-events-auto flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="text-white transition-transform hover:scale-110"
          >
            {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
          </button>

          <span className="select-none text-xs font-medium tabular-nums text-white/90">
            {formatTime(current)} / {formatTime(duration)}
          </span>

          {/* Seek bar */}
          <div
            onClick={seek}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(current)}
            tabIndex={0}
            className="group/seek relative flex h-4 flex-1 cursor-pointer items-center"
          >
            <span className="h-1 w-full rounded-full bg-white/30">
              <span className="block h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
            </span>
            <span
              className="absolute size-3 -translate-x-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover/seek:opacity-100"
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
