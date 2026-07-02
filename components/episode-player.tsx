"use client"

import { useEffect, useRef, useState } from "react"
import { Pause, Play, Radio, RotateCcw, RotateCw, Gauge, Maximize, Minimize, ChevronDown } from "lucide-react"
import type { Show } from "@/lib/data"
import { cn } from "@/lib/utils"
import { MarqueeTitle } from "@/components/marquee-title"

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
 *
 * When `onMinimize`/`onRestore` are provided (the watch page), the video shows a
 * YouTube-style downward-chevron in the upper-left that collapses the player
 * into a floating mini-player. The SAME `<video>` element stays mounted across
 * both states, so playback never pauses and the position is preserved.
 */
export function EpisodePlayer({
  show,
  minimized = false,
  onMinimize,
  onRestore,
}: {
  show: Show
  minimized?: boolean
  onMinimize?: () => void
  onRestore?: () => void
}) {
  const mediaRef = useRef<HTMLVideoElement>(null)
  // The video frame is the element we put into fullscreen so our own controls
  // (rendered as an overlay inside it) stay visible, rather than the bare <video>.
  const frameRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speedIdx, setSpeedIdx] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  // YouTube-style overlay controls: visible by default, auto-hidden a few
  // seconds into playback, and toggled when the video surface is tapped.
  const [controlsVisible, setControlsVisible] = useState(true)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A single <video> drives both kinds; for audio the frame is hidden.
  const isVideo = Boolean(show.videoUrl)
  const mediaUrl = show.videoUrl ?? show.audioUrl
  const hasMedia = Boolean(mediaUrl)
  const pct = duration > 0 ? (current / duration) * 100 : 0
  // A real, host-uploaded cover vs. the generic "/placeholder.svg" fallback that
  // `lib/content.ts` substitutes when no cover was set. When there's no real
  // cover we let the <video> paint its own first frame as the thumbnail instead
  // of pinning the blank placeholder poster.
  const hasRealCover = Boolean(show.cover) && !show.cover!.includes("/placeholder.svg")

  // Reveal the overlay controls and schedule an auto-hide while playing. When
  // paused we keep them up so the surface never looks "dead".
  function scheduleHide() {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setControlsVisible(false), 3000)
  }
  function revealControls() {
    setControlsVisible(true)
    if (playing) scheduleHide()
    else if (hideTimer.current) clearTimeout(hideTimer.current)
  }
  // Tapping the video surface toggles the controls (hide if shown, reveal if not).
  function onSurfaceTap() {
    if (controlsVisible) {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      setControlsVisible(false)
    } else {
      revealControls()
    }
  }

  // Keep controls pinned while paused; start the auto-hide countdown on play.
  useEffect(() => {
    if (playing) scheduleHide()
    else {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      setControlsVisible(true)
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

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
          // Seek slightly past 0 (when no real cover) so a frame is decoded and
          // shown as the thumbnail; otherwise reset to the start.
          el.currentTime = hasRealCover ? 0 : 0.1
          el.removeEventListener("timeupdate", onUpdate)
        }
      }
      el.addEventListener("timeupdate", onUpdate)
      el.currentTime = 1e7
    } else {
      setDuration(el.duration)
      // Finite duration: with preload="metadata" no frame is decoded yet, so the
      // surface would stay blank. Nudge a tiny seek to paint the first frame as
      // the thumbnail when there's no host-provided cover.
      if (!hasRealCover && el.currentTime === 0) {
        try {
          el.currentTime = 0.1
        } catch {
          /* ignore seek errors */
        }
      }
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

  // YouTube-style overlay that lives *on* the video: transport cluster centered,
  // scrubber + times docked at the base, speed + fullscreen as secondary
  // affordances. Fades out (and ignores taps) when the controls are hidden.
  const renderVideoOverlay = () => (
    <div
      className={cn(
        "absolute inset-0 z-10 transition-opacity duration-200",
        controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {/* Legibility scrim, darker at the base where the scrubber sits. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/35" />

      {/* Minimize (top-left) — collapses into a floating mini-player, replacing
          the old page Back button. Playback continues uninterrupted. */}
      {onMinimize && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onMinimize()
          }}
          aria-label="Minimize player"
          className="absolute left-3 top-3 z-20 flex size-10 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/15 backdrop-blur-md transition-colors hover:bg-black/65 active:scale-90"
        >
          <ChevronDown className="size-5" />
        </button>
      )}

      {/* Fullscreen toggle (top-right). */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          void toggleFullscreen()
          revealControls()
        }}
        aria-label={isFullscreen ? "Exit fullscreen" : "Expand to fullscreen"}
        className="absolute right-3 top-3 z-20 flex size-10 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/15 backdrop-blur-md transition-colors hover:bg-black/65 active:scale-90"
      >
        {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
      </button>

      {/* Centered transport cluster (rewind / play / forward) + speed pill. The
          wrapper spans the whole frame, so it must NOT capture pointer events
          (otherwise it would sit over the fullscreen button and the surface-tap
          target); only the actual controls below opt back in. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4">
        <div className="pointer-events-auto flex items-center justify-center gap-8">
          <button
            onClick={(e) => {
              e.stopPropagation()
              skip(-15)
              revealControls()
            }}
            className="flex items-center justify-center text-white/85 transition-colors hover:text-white active:scale-90"
            aria-label="Rewind 15 seconds"
          >
            <RotateCcw className="size-7" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggle()
              revealControls()
            }}
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 transition-transform hover:scale-105 active:scale-95"
            aria-label={playing ? "Pause episode" : "Play episode"}
          >
            {playing ? <Pause className="size-7" /> : <Play className="size-7 translate-x-0.5" />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              skip(15)
              revealControls()
            }}
            className="flex items-center justify-center text-white/85 transition-colors hover:text-white active:scale-90"
            aria-label="Forward 15 seconds"
          >
            <RotateCw className="size-7" />
          </button>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            cycleSpeed()
            revealControls()
          }}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-md transition-colors hover:bg-black/65"
          aria-label="Change playback speed"
        >
          <Gauge className="size-3.5" />
          {SPEEDS[speedIdx]}x
        </button>
      </div>

      {/* Scrubber docked at the base (YouTube-style). */}
      <div className="absolute inset-x-0 bottom-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium tabular-nums text-white/85">
          <span>{fmt(current)}</span>
          <span>-{fmt(Math.max(0, duration - current))}</span>
        </div>
        <div className="group relative h-1.5 w-full" onClick={(e) => e.stopPropagation()}>
          <div className="absolute inset-0 rounded-full bg-white/25" />
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct}%` }} />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            onChange={(e) => {
              seek(e)
              revealControls()
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Seek"
          />
        </div>
      </div>
    </div>
  )

  // Compact overlay for the floating mini-player: a subtle expand hint plus a
  // small play/pause. Tapping anywhere else on the frame restores the full player.
  const renderMiniOverlay = () => (
    <div className="absolute inset-0 z-10">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
      <span className="pointer-events-none absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md bg-black/55 text-white backdrop-blur-sm">
        <Maximize className="size-3.5" />
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          toggle()
        }}
        aria-label={playing ? "Pause" : "Play"}
        className="absolute bottom-1.5 left-1.5 flex size-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-transform active:scale-90"
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-px" />}
      </button>
    </div>
  )

  return (
    <div className="relative isolate">
      {/* Immersive, edge-to-edge video frame (no card). The cover art is the
          poster so the thumbnail shows before playback instead of a play glyph. */}
      {isVideo ? (
        <div
          ref={frameRef}
          onClick={minimized ? onRestore : onSurfaceTap}
          className={cn(
            "relative bg-black",
            isFullscreen
              ? "flex h-screen w-screen cursor-pointer items-center justify-center"
              : minimized
                ? // Floating mini-player docked bottom-right, above the fixed tab
                  // bar; the same <video> keeps playing so position is preserved.
                  // A spring-eased zoom-in makes tapping it restore smoothly.
                  "fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 aspect-video w-40 cursor-pointer overflow-hidden rounded-xl shadow-floating ring-1 ring-white/15 duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] animate-in fade-in zoom-in-95 sm:w-56"
                : // Full-bleed within the player (the page renders this player
                  // without horizontal padding, so it reaches both screen edges).
                  "aspect-video w-full cursor-pointer overflow-hidden",
          )}
        >
          <video
            ref={mediaRef}
            src={mediaUrl}
            poster={hasRealCover ? (show.cover ?? undefined) : undefined}
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

          {/* YouTube-style controls overlaid on the video itself (windowed and
              fullscreen alike); tapping the surface hides/reveals them. The
              floating mini-player shows a compact overlay instead. */}
          {hasMedia && (minimized ? renderMiniOverlay() : renderVideoOverlay())}
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

      {/* Title + windowed controls (hidden behind the frame while fullscreen,
          and hidden entirely while collapsed into the floating mini-player). */}
      <div className={cn("flex flex-col items-center gap-5 px-6 pt-6 sm:px-10", minimized && "hidden")}>
        <div className="w-full max-w-full text-center">
          {/* Title stays on a single line; it auto-scrolls right-to-left when
              it can't fit, so the full title is always readable. */}
          <MarqueeTitle
            text={show.title}
            className="text-center text-lg font-bold leading-tight tracking-tight"
          />
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {show.host.name}
            {show.publishedAt && <span> · {show.publishedAt}</span>}
          </p>
        </div>
      </div>

      {/* Audio keeps its controls below the cover-art card; video controls now
          live on the video surface itself, so nothing renders here for video. */}
      {!isVideo && (
        <div className="px-6 pb-7 pt-5 sm:px-10">
          {hasMedia ? (
            <div className="flex items-center justify-center">{renderControls(false)}</div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              This episode was published without a recording, so there&apos;s no audio to play.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
