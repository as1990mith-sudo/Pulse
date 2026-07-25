"use client"

import { useEffect, useRef, useState } from "react"
import { Pause, Play, RotateCcw, RotateCw, Gauge, Maximize, Minimize, ChevronDown, X, PictureInPicture2, Volume2, VolumeX } from "lucide-react"
import type { Show } from "@/lib/data"
import { cn } from "@/lib/utils"
import { useSharedPlayback, formatTime } from "@/lib/hooks/use-shared-playback"
import { useSharedMute } from "@/lib/shared-mute"

/**
 * LiveReplayPlayer — a dedicated player for archived *video livestream* replays
 * (content whose `source === "live"`). It is a completely separate playback
 * surface from the YouTube-style `EpisodePlayer`, but drives the SAME
 * `useSharedPlayback` engine so seek, ±skip, speed, fullscreen, native PiP and
 * analytics behave identically.
 *
 * Unlike uploaded videos, livestreams are recorded in PORTRAIT. This player:
 *  • presents a tall portrait stage that occupies most of the viewport height,
 *  • lets the video keep its natural aspect via `object-contain` (no forced
 *    16:9, minimal black bars, never cropped),
 *  • strips every live-only affordance (LIVE badge, viewer count, hearts, gifts,
 *    chat, host/guest controls) so it reads as a clean rewatch.
 *
 * It honours the same minimize contract as the standard player: the same
 * `<video>` element stays mounted across full/mini states so playback never
 * pauses, and a swipe-down gesture collapses it into the floating mini-player.
 */
export function LiveReplayPlayer({
  show,
  minimized = false,
  onMinimize,
  onRestore,
  onClose,
  variant = "page",
  autoPlay = false,
}: {
  show: Show
  minimized?: boolean
  onMinimize?: () => void
  onRestore?: () => void
  onClose?: () => void
  // "page" is the classic pinned player (portrait stage + minimize contract).
  // "reel" makes the player fill its parent slide edge-to-edge for the
  // full-screen vertical replay reel — no minimize/close chrome of its own, so
  // the reel supplies its own close button and overlaid action rail.
  variant?: "page" | "reel"
  // Reel slides auto-play the moment they become the active slide.
  autoPlay?: boolean
}) {
  const isReel = variant === "reel"
  const mediaUrl = show.videoUrl
  const hasRealCover = Boolean(show.cover) && !show.cover!.includes("/placeholder.svg")

  const engine = useSharedPlayback({
    episodeId: show.episodeId ?? null,
    hasRealCover,
    skipSeconds: 15,
    autoPlay,
  })
  const {
    mediaRef,
    frameRef,
    playing,
    current,
    duration,
    pct,
    speed,
    isFullscreen,
    isPip,
    toggle,
    rewind,
    forward,
    cycleSpeed,
    seekTo,
    togglePip,
    toggleFullscreen,
    onLoadedMetadata,
    setPlaying,
    setCurrent,
    setDuration,
  } = engine

  // App-wide mute preference (shared with the feed + reels players). It starts
  // muted so the reel can autoplay — browsers only allow gesture-free autoplay
  // on muted media — and the viewer can unmute with the toggle below.
  const [muted, setMuted] = useSharedMute()
  useEffect(() => {
    if (mediaRef.current) mediaRef.current.muted = muted
  }, [muted, mediaRef])

  // YouTube-style auto-hiding controls.
  const [controlsVisible, setControlsVisible] = useState(true)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function scheduleHide() {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setControlsVisible(false), 3000)
  }
  function revealControls() {
    setControlsVisible(true)
    if (playing) scheduleHide()
    else if (hideTimer.current) clearTimeout(hideTimer.current)
  }
  function onSurfaceTap() {
    if (controlsVisible) {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      setControlsVisible(false)
    } else {
      revealControls()
    }
  }
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

  // Reel slides autoplay as soon as they mount (they only mount when active).
  useEffect(() => {
    if (!autoPlay) return
    const el = mediaRef.current
    if (!el) return
    el.muted = muted
    el.play().catch(() => {
      // Autoplay with sound is blocked by browsers; fall back to muted playback
      // so the replay still starts, then the viewer can unmute with the toggle.
      setMuted(true)
      el.muted = true
      el.play().catch(() => {})
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay])

  // Swipe-down-to-minimize gesture (matches the standard player's minimize).
  // Disabled in reel mode so the vertical reel scroll owns vertical gestures.
  const touchStartY = useRef<number | null>(null)
  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0]?.clientY ?? null
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartY.current == null || minimized || isReel) return
    const dy = (e.changedTouches[0]?.clientY ?? 0) - touchStartY.current
    if (dy > 70) onMinimize?.()
    touchStartY.current = null
  }

  if (!mediaUrl) return null

  return (
    <div className={cn("relative isolate", isReel && "h-full w-full")}>
      <div
        ref={frameRef}
        onClick={minimized ? onRestore : onSurfaceTap}
        onTouchStart={minimized || isReel ? undefined : onTouchStart}
        onTouchEnd={minimized || isReel ? undefined : onTouchEnd}
        className={cn(
          "relative bg-black",
          isFullscreen
            ? "flex h-screen w-screen cursor-pointer items-center justify-center"
            : minimized
              ? // Floating mini-player docked bottom-right — portrait framed, same
                // spring-eased entrance as the standard player.
                "fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-50 aspect-[9/16] w-28 cursor-pointer overflow-hidden rounded-xl shadow-floating ring-1 ring-white/15 duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] animate-in fade-in zoom-in-95"
              : isReel
                ? // Reel slide: fill the whole slide edge-to-edge; the portrait
                  // recording stays centered via object-contain on the black stage.
                  "flex h-full w-full cursor-pointer items-center justify-center overflow-hidden"
                : // Portrait stage: tall, occupies most of the viewport height, and
                  // is capped so both edges stay reachable on wide screens.
                  "mx-auto flex h-[78dvh] max-h-[78dvh] w-full max-w-[calc(78dvh*9/16)] cursor-pointer items-center justify-center overflow-hidden",
        )}
      >
        <video
          ref={mediaRef}
          src={mediaUrl}
          poster={hasRealCover ? (show.cover ?? undefined) : undefined}
          playsInline
          preload="metadata"
          // Contain keeps the portrait recording in its native aspect ratio, so
          // nothing important is cropped even on non-portrait viewports.
          className="size-full object-contain"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onLoadedMetadata={onLoadedMetadata}
          onDurationChange={(e) => {
            const d = e.currentTarget.duration
            if (d !== Infinity && !Number.isNaN(d)) setDuration(d)
          }}
          onEnded={() => setPlaying(false)}
        />

        {minimized ? (
          /* Compact mini overlay: expand hint + small play/pause. */
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
        ) : (
          /* Full replay overlay. */
          <div
            className={cn(
              "absolute inset-0 z-10 transition-opacity duration-300",
              controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            {/* Legibility scrims top & bottom. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/55 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/65 to-transparent" />

            {/* Top-left: minimize chevron (matches standard player). */}
            {onMinimize && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onMinimize()
                }}
                aria-label="Minimize player"
                className="absolute left-3 top-3 z-20 flex items-center justify-center text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] transition-transform active:scale-90"
              >
                <ChevronDown className="size-7" />
              </button>
            )}

            {/* Top-right: speed (reel only) + mute + Picture-in-Picture + close.
                In reel mode the speed control lives up here so it never collides
                with the creator/title overlay pinned to the bottom-left. */}
            <div className="absolute right-3 top-3 z-20 flex items-center gap-3">
              {isReel && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    cycleSpeed()
                    revealControls()
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-md transition-colors hover:bg-black/65"
                  aria-label="Change playback speed"
                >
                  <Gauge className="size-3.5" />
                  {speed}x
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setMuted(!muted)
                  revealControls()
                }}
                aria-label={muted ? "Unmute" : "Mute"}
                className="flex items-center justify-center text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] transition-transform active:scale-90"
              >
                {muted ? <VolumeX className="size-6" /> : <Volume2 className="size-6" />}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  void togglePip()
                  revealControls()
                }}
                aria-label="Picture in Picture"
                className={cn(
                  "flex items-center justify-center text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] transition-transform active:scale-90",
                  isPip && "text-primary",
                )}
              >
                <PictureInPicture2 className="size-6" />
              </button>
              {onClose && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose()
                  }}
                  aria-label="Close replay"
                  className="flex items-center justify-center text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] transition-transform active:scale-90"
                >
                  <X className="size-7" />
                </button>
              )}
            </div>

            {/* Center transport: rewind / play / forward. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="pointer-events-auto flex items-center justify-center gap-8">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    rewind()
                    revealControls()
                  }}
                  className="flex items-center justify-center text-white/85 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] transition-colors hover:text-white active:scale-90"
                  aria-label="Rewind 15 seconds"
                >
                  <RotateCcw className="size-8" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle()
                    revealControls()
                  }}
                  className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white/70 text-black shadow-lg shadow-black/20 backdrop-blur-sm transition-transform hover:scale-105 active:scale-95"
                  aria-label={playing ? "Pause replay" : "Play replay"}
                >
                  {playing ? <Pause className="size-6" /> : <Play className="size-6 translate-x-0.5" />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    forward()
                    revealControls()
                  }}
                  className="flex items-center justify-center text-white/85 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] transition-colors hover:text-white active:scale-90"
                  aria-label="Forward 15 seconds"
                >
                  <RotateCw className="size-8" />
                </button>
              </div>
            </div>

            {/* Base cluster: (page-only speed + fullscreen row) above the scrubber.
                In reel mode the speed control moved to the top-right and
                fullscreen is redundant, so this bottom cluster shrinks to just
                the time + scrubber — leaving room for the reel's creator/title
                and action rail to sit clear above it. */}
            <div className="absolute inset-x-0 bottom-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {!isReel && (
                <div className="mb-2 flex items-center justify-between">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      cycleSpeed()
                      revealControls()
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-md transition-colors hover:bg-black/65"
                    aria-label="Change playback speed"
                  >
                    <Gauge className="size-3.5" />
                    {speed}x
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void toggleFullscreen()
                      revealControls()
                    }}
                    aria-label={isFullscreen ? "Exit fullscreen" : "Expand to fullscreen"}
                    className="flex items-center justify-center text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] transition-transform active:scale-90"
                  >
                    {isFullscreen ? <Minimize className="size-6" /> : <Maximize className="size-6" />}
                  </button>
                </div>
              )}

              <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium tabular-nums text-white/85">
                <span>{formatTime(current)}</span>
                <span>-{formatTime(Math.max(0, duration - current))}</span>
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
                    seekTo(Number(e.target.value))
                    revealControls()
                  }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="Seek"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
