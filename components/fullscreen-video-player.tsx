"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getVideoPosition,
  rememberVideoPosition,
  setImmersiveViewerOpen,
} from "@/lib/video-handoff"

/**
 * Full-screen video lightbox with the app's premium control chrome (matching
 * FeedVideo) instead of the browser's default <video controls> bar. Renders the
 * clip at its true aspect ratio (object-contain) letterboxed on black, autoplays
 * with sound where the browser allows, and exposes play/pause, ±10s skip, a
 * draggable seek track, elapsed/total time, and mute. Opened by tapping an
 * attached clip in the community feed.
 */

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

const SKIP_SECONDS = 10

export function FullscreenVideoPlayer({ src, onClose }: { src: string; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null)
  const seekRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  // Controls auto-hide while playing, and reveal on any pointer activity.
  const [chromeVisible, setChromeVisible] = useState(true)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Lock body scroll and close on Escape while the lightbox is open. Also raise
  // the immersive-viewer gate so the inline feed clip behind us pauses — only
  // this expanded player should be playing (fixes two videos playing at once).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    setImmersiveViewerOpen(true)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
      // Drop the gate so the in-view inline clip can resume (from the shared
      // position this player advanced) once the lightbox closes.
      setImmersiveViewerOpen(false)
    }
  }, [onClose])

  // Continue from where the inline preview left off (by src) instead of
  // restarting, then attempt autoplay with sound; fall back to muted if the
  // browser blocks it.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const resumeAt = getVideoPosition(src)
    const start = () => {
      el.play().catch(() => {
        el.muted = true
        setMuted(true)
        el.play().catch(() => {})
      })
    }
    if (resumeAt != null && resumeAt > 0) {
      const seek = () => {
        try {
          el.currentTime = resumeAt
          setCurrent(resumeAt)
        } catch {
          /* not seekable yet */
        }
        start()
      }
      if (el.readyState >= 1) seek()
      else el.addEventListener("loadedmetadata", seek, { once: true })
    } else {
      start()
    }
  }, [src])

  const revealChrome = useCallback(() => {
    setChromeVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      // Only auto-hide while actively playing; keep visible when paused.
      if (ref.current && !ref.current.paused) setChromeVisible(false)
    }, 2600)
  }, [])

  useEffect(() => {
    revealChrome()
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [revealChrome])

  function togglePlay() {
    const el = ref.current
    if (!el) return
    if (el.paused) el.play().catch(() => {})
    else el.pause()
    revealChrome()
  }

  function toggleMute() {
    const el = ref.current
    const next = !muted
    setMuted(next)
    if (el) el.muted = next
    revealChrome()
  }

  function skip(delta: number) {
    const el = ref.current
    if (!el) return
    el.currentTime = Math.min(el.duration || 0, Math.max(0, el.currentTime + delta))
    setCurrent(el.currentTime)
    revealChrome()
  }

  const seekToClientX = useCallback(
    (clientX: number) => {
      const el = ref.current
      const bar = seekRef.current
      if (!el || !bar || !duration) return
      const rect = bar.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      el.currentTime = ratio * duration
      setCurrent(ratio * duration)
    },
    [duration],
  )

  function onSeekPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    seekToClientX(e.clientX)
  }
  function onSeekPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (draggingRef.current) seekToClientX(e.clientX)
  }
  function onSeekPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
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

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Expanded video"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 backdrop-blur-sm"
      onClick={onClose}
      onPointerMove={revealChrome}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close video"
        className={cn(
          "absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-10 flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-all hover:bg-white/20",
          chromeVisible ? "opacity-100" : "opacity-0",
        )}
      >
        <X className="size-5" />
      </button>

      {/* Player surface — stop propagation so taps here don't close the lightbox. */}
      <div
        className="group relative flex max-h-[92vh] max-w-full items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={ref}
          src={src}
          playsInline
          className="max-h-[92vh] max-w-full object-contain"
          onClick={togglePlay}
          onPlay={() => {
            setPlaying(true)
            revealChrome()
          }}
          onPause={() => {
            setPlaying(false)
            setChromeVisible(true)
          }}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration
            setDuration(Number.isFinite(d) ? d : 0)
          }}
          onTimeUpdate={(e) => {
            if (!draggingRef.current) setCurrent(e.currentTarget.currentTime)
            // Share the position so closing continues the inline preview here.
            rememberVideoPosition(src, e.currentTarget.currentTime)
          }}
        />

        {/* Center play affordance while paused. */}
        {!playing && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Play"
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
            "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-10 transition-opacity duration-200",
            chromeVisible ? "opacity-100" : "opacity-0",
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
              className="group/seek relative flex h-6 flex-1 cursor-pointer items-center"
            >
              <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25">
                <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${progress}%` }} />
              </div>
              <span
                className="absolute size-3 -translate-x-1/2 rounded-full bg-white shadow ring-1 ring-black/10 transition-transform group-hover/seek:scale-110"
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
    </div>,
    document.body,
  )
}
