"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Pause, Play, X } from "lucide-react"
import { formatClock, generateVideoThumbnails } from "@/lib/media-edit"
import { cn } from "@/lib/utils"

const MIN_GAP = 1 // seconds — smallest allowed trim length
const THUMB_COUNT = 10

/**
 * WhatsApp-style video trim editor. Shows a looping preview plus a timeline
 * strip of thumbnail frames with two draggable handles (start/end). Playback
 * loops within the selected range. "Apply" returns the chosen trimStart/trimEnd
 * (metadata — no re-encode); "Cancel" discards.
 */
export function TrimModal({
  videoSrc,
  maxSeconds,
  title = "Trim video",
  onCancel,
  onApply,
}: {
  videoSrc: string
  maxSeconds?: number
  title?: string
  onCancel: () => void
  onApply: (range: { trimStart: number; trimEnd: number }) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  const [duration, setDuration] = useState(0)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [thumbs, setThumbs] = useState<string[]>([])

  // Mirror the range into refs so the drag handlers and the loop callback always
  // read the latest values without re-subscribing.
  const startRef = useRef(0)
  const endRef = useRef(0)
  startRef.current = start
  endRef.current = end

  // Generate the timeline thumbnails once the source is known.
  useEffect(() => {
    let cancelled = false
    generateVideoThumbnails(videoSrc, THUMB_COUNT).then((t) => {
      if (!cancelled) setThumbs(t)
    })
    return () => {
      cancelled = true
    }
  }, [videoSrc])

  function onLoadedMetadata() {
    const v = videoRef.current
    if (!v) return
    const dur = v.duration && isFinite(v.duration) ? v.duration : 0
    setDuration(dur)
    const initialEnd = maxSeconds ? Math.min(dur, maxSeconds) : dur
    setStart(0)
    setEnd(initialEnd)
    v.currentTime = 0
  }

  // Loop playback within [start, end].
  function onTimeUpdate() {
    const v = videoRef.current
    if (!v) return
    setPlayhead(v.currentTime)
    if (v.currentTime >= endRef.current) {
      v.currentTime = startRef.current
      if (!v.paused) void v.play()
    } else if (v.currentTime < startRef.current - 0.1) {
      v.currentTime = startRef.current
    }
  }

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      if (v.currentTime < start || v.currentTime >= end) v.currentTime = start
      void v.play()
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }

  function timeFromClientX(clientX: number): number {
    const strip = stripRef.current
    if (!strip || duration === 0) return 0
    const rect = strip.getBoundingClientRect()
    const pct = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
    return pct * duration
  }

  function beginDrag(which: "start" | "end") {
    return (e: React.PointerEvent) => {
      e.preventDefault()
      const v = videoRef.current
      if (v && !v.paused) {
        v.pause()
        setPlaying(false)
      }
      const max = maxSeconds ?? duration

      const move = (ev: PointerEvent) => {
        const t = timeFromClientX(ev.clientX)
        if (which === "start") {
          const next = Math.min(t, endRef.current - MIN_GAP)
          const clamped = Math.max(next, endRef.current - max, 0)
          setStart(clamped)
          if (videoRef.current) videoRef.current.currentTime = clamped
        } else {
          const next = Math.max(t, startRef.current + MIN_GAP)
          const clamped = Math.min(next, startRef.current + max, duration)
          setEnd(clamped)
          if (videoRef.current) videoRef.current.currentTime = clamped
        }
      }
      const up = () => {
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
        // Return the preview to the start of the selection.
        if (videoRef.current) videoRef.current.currentTime = startRef.current
        setPlayhead(startRef.current)
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up)
    }
  }

  const pctStart = duration ? (start / duration) * 100 : 0
  const pctEnd = duration ? (end / duration) * 100 : 100
  const pctPlayhead = duration ? (playhead / duration) * 100 : 0
  const selectedLen = Math.max(0, end - start)

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={title}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onCancel}
          className="flex size-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 active:scale-90"
          aria-label="Cancel"
        >
          <X className="size-6" />
        </button>
        <span className="text-sm font-semibold text-white">{title}</span>
        <button
          type="button"
          onClick={() => onApply({ trimStart: start, trimEnd: end })}
          disabled={duration === 0}
          className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:brightness-110 active:scale-90 disabled:opacity-50"
          aria-label="Apply trim"
        >
          <Check className="size-6" />
        </button>
      </div>

      {/* Preview */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          src={videoSrc}
          playsInline
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          onClick={togglePlay}
          className="max-h-full max-w-full"
        />
        <button
          type="button"
          onClick={togglePlay}
          className={cn(
            "absolute flex size-16 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-opacity",
            playing && "opacity-0",
          )}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="size-7 fill-current" /> : <Play className="size-7 translate-x-0.5 fill-current" />}
        </button>
      </div>

      {/* Timeline + controls */}
      <div className="space-y-4 bg-black px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5">
        <div className="flex items-center justify-center gap-2 text-sm font-medium text-white">
          <span className="tabular-nums text-white/70">{formatClock(start)}</span>
          <span className="text-white/40">–</span>
          <span className="tabular-nums text-white/70">{formatClock(end)}</span>
          <span className="ml-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
            {formatClock(selectedLen)}
          </span>
        </div>

        {/* Timeline strip. The outer padding leaves room so the start/end
            handles stay fully on-screen and easy to grab even at 0% / 100% —
            previously the end handle sat off the right edge and couldn't be
            dragged inward to trim the ending. */}
        <div className="px-4">
          <div ref={stripRef} className="relative h-16 select-none touch-none">
            <div className="pointer-events-none absolute inset-0 flex overflow-hidden rounded-xl bg-white/5">
              {thumbs.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src || "/placeholder.svg"} alt="" className="h-full flex-1 object-cover" draggable={false} />
              ))}
            </div>

            {/* Dim the trimmed-away regions (purely visual — never intercept the
                drag so the handles are always grabbable). */}
            <div className="pointer-events-none absolute inset-y-0 left-0 rounded-l-xl bg-black/60" style={{ width: `${pctStart}%` }} />
            <div className="pointer-events-none absolute inset-y-0 right-0 rounded-r-xl bg-black/60" style={{ width: `${100 - pctEnd}%` }} />

            {/* Selection frame */}
            <div
              className="pointer-events-none absolute inset-y-0 border-y-[3px] border-primary"
              style={{ left: `${pctStart}%`, right: `${100 - pctEnd}%` }}
            />

            {/* Playhead */}
            {playing && (
              <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90" style={{ left: `${pctPlayhead}%` }} />
            )}

            {/* Start handle — wide, centered on its point for an easy touch target */}
            <div
              onPointerDown={beginDrag("start")}
              className="absolute inset-y-0 z-20 flex w-8 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center rounded-xl bg-primary shadow-lg"
              style={{ left: `${pctStart}%` }}
              role="slider"
              aria-label="Trim start"
              aria-valuenow={Math.round(start)}
            >
              <span className="h-6 w-1 rounded-full bg-primary-foreground/80" />
            </div>

            {/* End handle */}
            <div
              onPointerDown={beginDrag("end")}
              className="absolute inset-y-0 z-20 flex w-8 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center rounded-xl bg-primary shadow-lg"
              style={{ left: `${pctEnd}%` }}
              role="slider"
              aria-label="Trim end"
              aria-valuenow={Math.round(end)}
            >
              <span className="h-6 w-1 rounded-full bg-primary-foreground/80" />
            </div>
          </div>
        </div>

        {maxSeconds && duration > maxSeconds && (
          <p className="text-center text-xs text-white/50">
            Clips are limited to {formatClock(maxSeconds)} — drag the handles to select your range.
          </p>
        )}
      </div>
    </div>
  )
}
