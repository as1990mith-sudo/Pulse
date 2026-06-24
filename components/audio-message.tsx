"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Play, Pause } from "lucide-react"
import { cn } from "@/lib/utils"

function fmt(secs: number) {
  if (!Number.isFinite(secs) || secs < 0) return "0:00"
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

/**
 * A compact voice-note / audio player for chat bubbles with a fully draggable
 * scrubber. The progress bar can be tapped or dragged (pointer + keyboard) to
 * scrub to any position. Colors adapt to the bubble: `mine` renders on the
 * primary bubble (light controls), otherwise on the secondary bubble.
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
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [dragging, setDragging] = useState(false)

  const progress = duration > 0 ? (current / duration) * 100 : 0

  function togglePlay() {
    const el = audioRef.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
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
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration
          if (Number.isFinite(d)) setDuration(d)
        }}
        onTimeUpdate={(e) => {
          if (!dragging) setCurrent(e.currentTarget.currentTime)
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

      <div className="flex min-w-[140px] flex-1 flex-col gap-1">
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
          className="group relative flex h-4 cursor-pointer touch-none items-center"
        >
          <span className={cn("h-1 w-full rounded-full", mine ? "bg-primary-foreground/30" : "bg-foreground/20")}>
            <span
              className={cn("block h-full rounded-full", mine ? "bg-primary-foreground" : "bg-primary")}
              style={{ width: `${progress}%` }}
            />
          </span>
          <span
            className={cn(
              "absolute size-3 -translate-x-1/2 rounded-full shadow transition-opacity",
              mine ? "bg-primary-foreground" : "bg-primary",
              dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            style={{ left: `${progress}%` }}
          />
        </div>
        <span
          className={cn(
            "select-none text-[11px] font-medium tabular-nums",
            mine ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          {fmt(current)} / {fmt(duration)}
        </span>
      </div>
    </div>
  )
}
