"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Play, Pause } from "lucide-react"
import { cn } from "@/lib/utils"

function fmt(secs: number) {
  if (!Number.isFinite(secs) || secs < 0) return "0:00"
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

// Deterministic waveform bar heights derived from the src, so a given clip always
// renders the same shape (no layout jitter between renders).
function useWaveform(src: string, bars = 34) {
  return useMemo(() => {
    let h = 2166136261
    for (let i = 0; i < src.length; i++) {
      h ^= src.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    const heights: number[] = []
    let state = h >>> 0
    for (let i = 0; i < bars; i++) {
      // xorshift for a stable pseudo-random sequence.
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      state >>>= 0
      const r = state / 0xffffffff
      // Bias toward mid heights with a gentle envelope for a natural look.
      const envelope = Math.sin((i / (bars - 1)) * Math.PI) * 0.5 + 0.5
      heights.push(0.28 + r * 0.72 * (0.55 + envelope * 0.45))
    }
    return heights
  }, [src, bars])
}

const SPEEDS = [1, 1.5, 2, 0.5] as const

/**
 * A compact voice-note / audio player for chat bubbles, styled to match the
 * group chatroom bubbles: play/pause button, a tappable/draggable waveform,
 * a duration timer, and a playback-speed toggle (1x → 1.5x → 2x → 0.5x).
 * Colors adapt to the bubble: `mine` renders on the primary bubble (light
 * controls), otherwise on the secondary bubble.
 */
export function AudioMessage({
  src,
  mine = false,
  className,
}: {
  src: string
  mine?: boolean
  className?: string
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [speedIndex, setSpeedIndex] = useState(0)

  const waveform = useWaveform(src)
  const progress = duration > 0 ? current / duration : 0
  const speed = SPEEDS[speedIndex]

  // Drive progress from the audio engine's clock every animation frame (~60fps)
  // instead of the `timeupdate` DOM event (which only fires ~4x/sec and makes
  // the tracker feel sluggish and jumpy). `audio.currentTime` is the single
  // source of truth, so the tracker stays locked to the sound.
  const syncFromAudio = useCallback(() => {
    const el = audioRef.current
    if (el && !dragging) setCurrent(el.currentTime)
  }, [dragging])

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const startRaf = useCallback(() => {
    stopRaf()
    const tick = () => {
      syncFromAudio()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [stopRaf, syncFromAudio])

  // Cancel any pending frame on unmount.
  useEffect(() => () => stopRaf(), [stopRaf])

  function togglePlay() {
    const el = audioRef.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }

  function cycleSpeed() {
    const next = (speedIndex + 1) % SPEEDS.length
    setSpeedIndex(next)
    const el = audioRef.current
    if (el) el.playbackRate = SPEEDS[next]
  }

  // Map a clientX to a time and (optionally) commit it to the media element.
  const seekToClientX = useCallback(
    (clientX: number, commit: boolean) => {
      const track = trackRef.current
      const el = audioRef.current
      if (!track || !duration) return
      const rect = track.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      const time = ratio * duration
      setCurrent(time)
      if (commit && el) el.currentTime = time
    },
    [duration],
  )

  // While dragging, listen on the window so the pointer can leave the track.
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => seekToClientX(e.clientX, false)
    const onUp = (e: PointerEvent) => {
      seekToClientX(e.clientX, true)
      setDragging(false)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [dragging, seekToClientX])

  function onKeyDown(e: React.KeyboardEvent) {
    const el = audioRef.current
    if (!el || !duration) return
    if (e.key === "ArrowRight") {
      el.currentTime = Math.min(duration, el.currentTime + 5)
      e.preventDefault()
    } else if (e.key === "ArrowLeft") {
      el.currentTime = Math.max(0, el.currentTime - 5)
      e.preventDefault()
    }
  }

  return (
    <div className={cn("flex items-center gap-2.5 py-0.5", className)}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => {
          setPlaying(true)
          startRaf()
        }}
        onPause={() => {
          setPlaying(false)
          stopRaf()
          syncFromAudio()
        }}
        onEnded={() => {
          setPlaying(false)
          stopRaf()
          const el = audioRef.current
          if (el) setCurrent(el.duration || 0)
        }}
        onSeeked={syncFromAudio}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration
          if (Number.isFinite(d)) setDuration(d)
          e.currentTarget.playbackRate = speed
        }}
        // Lightweight fallback so the position stays roughly correct even when
        // the tab is backgrounded and rAF is throttled/paused by the browser.
        onTimeUpdate={(e) => {
          if (!dragging && rafRef.current == null) setCurrent(e.currentTarget.currentTime)
        }}
      />

      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95",
          mine ? "bg-primary-foreground/20 text-primary-foreground" : "bg-foreground/10 text-foreground",
        )}
      >
        {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 translate-x-px fill-current" />}
      </button>

      <div className="flex min-w-[150px] flex-1 flex-col gap-1">
        {/* Waveform doubles as the seek track. */}
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          onPointerDown={(e) => {
            e.preventDefault()
            setDragging(true)
            seekToClientX(e.clientX, true)
          }}
          onKeyDown={onKeyDown}
          className="relative flex h-8 cursor-pointer touch-none items-center gap-[2px]"
        >
          {waveform.map((height, i) => {
            // Fractional fill: the bar the cursor is currently over fills
            // proportionally (0–100%) rather than snapping, so motion reads as
            // continuous across the whole waveform.
            const barStart = i / waveform.length
            const barEnd = (i + 1) / waveform.length
            const fill = Math.min(1, Math.max(0, (progress - barStart) / (barEnd - barStart)))
            const emptyColor = mine ? "rgba(255,255,255,0.3)" : "var(--color-foreground)"
            const fillColor = mine ? "var(--color-primary-foreground)" : "var(--color-primary)"
            return (
              <span
                key={i}
                className={cn("flex-1 rounded-full", !mine && fill < 1 && "opacity-25")}
                style={{
                  height: `${Math.round(height * 100)}%`,
                  // A hard gradient stop at the fill point paints the passed
                  // portion in the fill color and the rest in the empty color.
                  background: `linear-gradient(to right, ${fillColor} ${fill * 100}%, ${emptyColor} ${fill * 100}%)`,
                }}
              />
            )
          })}

          {/* Smooth gliding cursor — the primary sense of motion. It tracks the
              exact playback ratio and eases briefly between rAF samples so it
              feels buttery even if a frame is dropped. */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 h-full w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full",
              mine ? "bg-primary-foreground" : "bg-primary",
            )}
            style={{
              left: `${progress * 100}%`,
              transition: dragging ? "none" : "left 80ms linear",
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "select-none text-[11px] font-medium tabular-nums",
              mine ? "text-primary-foreground/80" : "text-muted-foreground",
            )}
          >
            {fmt(current)} / {fmt(duration)}
          </span>
          <button
            type="button"
            onClick={cycleSpeed}
            aria-label={`Playback speed ${speed}x`}
            className={cn(
              "select-none rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums transition-colors",
              mine
                ? "bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30"
                : "bg-foreground/10 text-foreground hover:bg-foreground/20",
            )}
          >
            {speed}x
          </button>
        </div>
      </div>
    </div>
  )
}
