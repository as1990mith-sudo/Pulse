"use client"

import { useEffect, useRef, useState } from "react"
import { Pause, Play, Radio, RotateCcw, RotateCw, Gauge, Maximize, Minimize } from "lucide-react"
import type { Show } from "@/lib/data"
import { cn } from "@/lib/utils"

function fmt(s: number) {
  if (!isFinite(s) || s < 0) return "0:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}

const SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const

/**
 * Immersive on-demand player for a published episode. Video episodes render
 * edge-to-edge (no card) with the cover art used as the poster frame; the
 * playback controls live in the page below and, while in fullscreen, in an
 * overlay docked inside the video frame so they stay visible. Audio episodes
 * keep the ambient cover-art card. Tapping the video never pauses it.
 */
export function EpisodePlayer({ show }: { show: Show }) {
  const mediaRef = useRef<HTMLVideoElement>(null)
  // The video frame is the element we put into fullscreen so our own controls
  // (rendered as an overlay inside it) stay visible, rather than the bare <video>.
  const frameRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speedIdx, setSpeedIdx] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  // A single <video> drives both kinds; for audio the frame is hidden.
  const isVideo = Boolean(show.videoUrl)
  const mediaUrl = show.videoUrl ?? show.audioUrl
  const hasMedia = Boolean(mediaUrl)
  const pct = duration > 0 ? (current / duration) * 100 : 0

  function toggle() {
    const el = mediaRef.current
    if (!el) return
    if (playing) el.pause()
    else void el.play().catch(() => {})
  }

  function skip(delta: number) {
    const el = mediaRef.current
    if (!el) return
    const t = Math.min(Math.max(0, el.currentTime + delta), duration || el.duration || 0)
    el.currentTime = t
    setCurrent(t)
  }

  function cycleSpeed() {
    const next = (speedIdx + 1) % SPEEDS.length
    setSpeedIdx(next)
    if (mediaRef.current) mediaRef.current.playbackRate = SPEEDS[next]
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const el = mediaRef.current
    if (!el) return
    const t = Number(e.target.value)
    el.currentTime = t
    setCurrent(t)
  }

  // Toggle a YouTube-style fullscreen: we put the whole video *frame* into
  // fullscreen (so our scrubber/controls stay visible) and lock the screen to
  // landscape. iOS Safari/WKWebView can't fullscreen arbitrary elements, so we
  // fall back to the native video fullscreen there (which also auto-rotates).
  async function toggleFullscreen() {
    const fsEl = document.fullscreenElement ?? (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement
    if (fsEl) {
      try {
        if (document.exitFullscreen) await document.exitFullscreen()
        else (document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen?.()
      } catch {
        /* ignore */
      }
      return
    }

    const frame = frameRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      | null
    const video = mediaRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    try {
      if (frame?.requestFullscreen) {
        await frame.requestFullscreen()
      } else if (frame?.webkitRequestFullscreen) {
        await frame.webkitRequestFullscreen()
      } else if (video && typeof video.webkitEnterFullscreen === "function") {
        // iOS: native fullscreen player (handles its own landscape rotation).
        video.webkitEnterFullscreen()
        return
      }
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: "landscape" | "portrait") => Promise<void>
      }
      if (orientation && typeof orientation.lock === "function") {
        await orientation.lock("landscape").catch(() => {})
      }
    } catch {
      /* user dismissed or the browser blocked the request */
    }
  }

  // Track fullscreen state (to swap the icon/styles) and release the
  // orientation lock when fullscreen is exited.
  useEffect(() => {
    const onFsChange = () => {
      const active = Boolean(
        document.fullscreenElement ?? (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement,
      )
      setIsFullscreen(active)
      if (!active) {
        try {
          screen.orientation?.unlock?.()
        } catch {
          /* unlock unsupported */
        }
      }
    }
    document.addEventListener("fullscreenchange", onFsChange)
    document.addEventListener("webkitfullscreenchange", onFsChange)
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange)
      document.removeEventListener("webkitfullscreenchange", onFsChange)
    }
  }, [])

  // Recorded sessions (webm/streamed blobs) often report duration as Infinity
  // until the browser scans to the end. Force a seek to the end to make the
  // real length available, then restore the position.
  function onMeta(e: React.SyntheticEvent<HTMLVideoElement>) {
    const el = e.currentTarget
    if (el.duration === Infinity || Number.isNaN(el.duration)) {
      const onUpdate = () => {
        if (el.duration !== Infinity && !Number.isNaN(el.duration)) {
          setDuration(el.duration)
          el.currentTime = 0
          el.removeEventListener("timeupdate", onUpdate)
        }
      }
      el.addEventListener("timeupdate", onUpdate)
      el.currentTime = 1e7
    } else {
      setDuration(el.duration)
    }
  }

  // Shared playback controls (scrubber + transport + speed). `white` renders the
  // cinematic light-on-dark variant used by the fullscreen overlay.
  const renderControls = (white: boolean) => (
    <div className="flex w-full flex-col gap-4">
      {/* Scrubber */}
      <div className="flex flex-col gap-1.5">
        <div className="group relative h-1.5 w-full">
          <div className={cn("absolute inset-0 rounded-full", white ? "bg-white/25" : "bg-foreground/15")} />
          <div
            className={cn("absolute inset-y-0 left-0 rounded-full", white ? "bg-white" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            onChange={seek}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Seek"
          />
        </div>
        <div
          className={cn(
            "flex items-center justify-between text-[11px] font-medium tabular-nums",
            white ? "text-white/80" : "text-muted-foreground",
          )}
        >
          <span>{fmt(current)}</span>
          <span>-{fmt(Math.max(0, duration - current))}</span>
        </div>
      </div>

      {/* Transport controls */}
      <div className="flex items-center justify-center gap-6">
        <button
          onClick={() => skip(-15)}
          className={cn(
            "flex items-center justify-center transition-colors active:scale-90",
            white ? "text-white/85 hover:text-white" : "text-muted-foreground hover:text-foreground",
          )}
          aria-label="Rewind 15 seconds"
        >
          <RotateCcw className="size-6" />
        </button>
        <button
          onClick={toggle}
          className={cn(
            "flex size-16 shrink-0 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95",
            white ? "bg-white text-black" : "bg-primary text-primary-foreground shadow-primary/30",
          )}
          aria-label={playing ? "Pause episode" : "Play episode"}
        >
          {playing ? <Pause className="size-7" /> : <Play className="size-7 translate-x-0.5" />}
        </button>
        <button
          onClick={() => skip(15)}
          className={cn(
            "flex items-center justify-center transition-colors active:scale-90",
            white ? "text-white/85 hover:text-white" : "text-muted-foreground hover:text-foreground",
          )}
          aria-label="Forward 15 seconds"
        >
          <RotateCw className="size-6" />
        </button>
      </div>

      {/* Secondary row: playback speed (+ fullscreen exit in the overlay) */}
      <div className={cn("flex items-center", white ? "justify-between" : "justify-center")}>
        <button
          onClick={cycleSpeed}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
            white
              ? "bg-white/15 text-white/90 hover:bg-white/25 hover:text-white"
              : "bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
          )}
          aria-label="Change playback speed"
        >
          <Gauge className="size-3.5" />
          {SPEEDS[speedIdx]}x
        </button>
        {white && (
          <button
            onClick={toggleFullscreen}
            className="flex size-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 active:scale-90"
            aria-label="Exit fullscreen"
          >
            <Minimize className="size-5" />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="relative isolate">
      {/* Immersive, edge-to-edge video frame (no card). The cover art is the
          poster so the thumbnail shows before playback instead of a play glyph. */}
      {isVideo ? (
        <div
          ref={frameRef}
          className={cn(
            "relative bg-black",
            isFullscreen
              ? "flex h-screen w-screen items-center justify-center"
              : "-mx-4 aspect-video overflow-hidden sm:-mx-6",
          )}
        >
          <video
            ref={mediaRef}
            src={mediaUrl}
            poster={show.cover ?? undefined}
            playsInline
            preload="metadata"
            className="size-full object-contain"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
            onLoadedMetadata={onMeta}
            onDurationChange={(e) => {
              const d = e.currentTarget.duration
              if (d !== Infinity && !Number.isNaN(d)) setDuration(d)
            }}
            onEnded={() => setPlaying(false)}
          />

          {/* Fullscreen: dock the controls inside the frame so they stay visible. */}
          {isFullscreen && hasMedia && (
            <div className="absolute inset-x-0 bottom-0 z-10 mx-auto flex max-w-3xl flex-col gap-3 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-[max(1.5rem,env(safe-area-inset-left))] pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-20">
            {renderControls(true)}
            </div>
          )}

          {/* Enter-fullscreen button (windowed only). */}
          {!isFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="Expand to fullscreen"
              className="absolute bottom-3 right-3 z-10 flex size-10 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-black/70 active:scale-90"
            >
              <Maximize className="size-5" />
            </button>
          )}
        </div>
      ) : (
        /* Audio: ambient cover-art card. */
        <div className="relative isolate overflow-hidden rounded-3xl">
          {show.cover ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={show.cover || "/placeholder.svg"}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 -z-10 size-full scale-125 object-cover opacity-40 blur-3xl saturate-150"
              />
              <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/30 via-background/60 to-background" />
            </>
          ) : (
            <div className="absolute inset-0 -z-10 bg-secondary/40" />
          )}
          <div className="flex flex-col items-center px-6 pt-8 sm:px-10">
            <div className="relative aspect-square w-44 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-foreground/10 sm:w-52">
              <video
                ref={mediaRef}
                src={mediaUrl}
                playsInline
                preload="metadata"
                className="absolute inset-0 -z-10 size-full opacity-0"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                onLoadedMetadata={onMeta}
                onDurationChange={(e) => {
                  const d = e.currentTarget.duration
                  if (d !== Infinity && !Number.isNaN(d)) setDuration(d)
                }}
                onEnded={() => setPlaying(false)}
              />
              {show.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={show.cover || "/placeholder.svg"} alt={show.title} className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center bg-secondary">
                  <Radio className="size-16 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Title + windowed controls (hidden behind the frame while fullscreen). */}
      <div className="flex flex-col items-center gap-5 px-6 pt-6 sm:px-10">
        <div className="text-center">
          <h2 className="text-balance text-lg font-bold leading-tight tracking-tight">{show.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{show.host.name}</p>
        </div>
      </div>

      <div className="px-6 pb-7 pt-5 sm:px-10">
        {hasMedia ? (
          <div className="flex items-center justify-center">{renderControls(false)}</div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            This episode was published without a recording, so there&apos;s no audio to play.
          </p>
        )}
      </div>
    </div>
  )
}
