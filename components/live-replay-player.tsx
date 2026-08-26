"use client"

import { useEffect, useRef, useState } from "react"
import { Pause, Play, RotateCcw, RotateCw, Maximize, Minimize, ChevronDown, X, PictureInPicture2, Volume2, VolumeX } from "lucide-react"
import type { Show } from "@/lib/data"
import { cn } from "@/lib/utils"
import { useSharedPlayback, formatTime } from "@/lib/hooks/use-shared-playback"
import { noteAutoplayBlocked, useSharedMute } from "@/lib/shared-mute"
import { exclusivePlaybackProps, installExclusivePlayback } from "@/lib/exclusive-playback"

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
  onControlsVisibleChange,
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
  // Fired whenever the player's controls show/hide. The reel wrapper uses this
  // to fade its own overlaid chrome (creator/title + like/comment/share/save
  // rail) in lockstep with the tap-to-toggle, so a single tap governs ALL
  // replay controls, not just the ones the player draws.
  onControlsVisibleChange?: (visible: boolean) => void
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
  // *unmuted* — media the viewer put in focus should have sound. If the browser
  // then refuses gesture-free playback, the player falls back to muted and
  // reports it via noteAutoplayBlocked() so the first tap restores sound.
  const [muted, setMuted] = useSharedMute()
  useEffect(() => {
    if (mediaRef.current) mediaRef.current.muted = muted
  }, [muted, mediaRef])

  // Arm the app-wide "only one recorded media element plays" guard (idempotent).
  useEffect(() => {
    installExclusivePlayback()
  }, [])

  // YouTube-style auto-hiding controls.
  const [controlsVisible, setControlsVisible] = useState(true)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the reel wrapper's own overlays in sync with the player's controls so
  // one tap toggles everything together.
  useEffect(() => {
    onControlsVisibleChange?.(controlsVisible)
  }, [controlsVisible, onControlsVisibleChange])

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

  // Drive the progress tracker from the media clock every animation frame while
  // playing. `timeupdate` only fires ~4x/sec, which makes the scrubber/thumb
  // and time labels visibly step on 60–120Hz displays; reading `currentTime`
  // via requestAnimationFrame instead lets them advance once per rendered frame
  // so playback controls stay perfectly smooth on high-refresh hardware.
  const progressRafRef = useRef<number | null>(null)
  useEffect(() => {
    if (!playing) {
      if (progressRafRef.current != null) {
        cancelAnimationFrame(progressRafRef.current)
        progressRafRef.current = null
      }
      return
    }
    const tick = () => {
      const el = mediaRef.current
      // Don't fight an in-flight seek — its target is already reflected in state.
      if (el && !el.seeking) setCurrent(el.currentTime)
      progressRafRef.current = requestAnimationFrame(tick)
    }
    progressRafRef.current = requestAnimationFrame(tick)
    return () => {
      if (progressRafRef.current != null) {
        cancelAnimationFrame(progressRafRef.current)
        progressRafRef.current = null
      }
    }
  }, [playing, mediaRef, setCurrent])

  // Reel slides play only while they are the active (centered) slide. When a
  // slide scrolls off, pause it so no off-screen replay keeps decoding in the
  // background — this keeps a single video (and a single rAF loop) live at a
  // time, which is what keeps scrolling and rendering smooth on the reel.
  useEffect(() => {
    const el = mediaRef.current
    if (!el) return
    if (autoPlay) {
      el.muted = muted
      el.play().catch(() => {
        // The browser blocked gesture-free playback with sound. Fall back to
        // muted so the replay still starts, but record it as an autoplay block
        // rather than writing a mute *preference* — otherwise this silence would
        // latch for the whole session and the next tap would leave it muted.
        noteAutoplayBlocked()
        el.muted = true
        el.play().catch(() => {})
      })
    } else if (isReel) {
      el.pause()
    }
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

  // ── Unified control language ───────────────────────────────────────────────
  // Every control shares ONE visual system: a soft glass circle with identical
  // dimensions, corner radius, ring, blur and interaction feedback. Hierarchy
  // comes from POSITION and the single solid primary play button — never from
  // mixing shapes, sizes or surfaces. `controlBase` carries the shared motion +
  // focus behaviour; `glass` is the translucent secondary surface.
  const controlBase =
    "flex items-center justify-center rounded-full text-white outline-none transition-[transform,background-color,box-shadow] duration-200 ease-out active:scale-90 focus-visible:ring-2 focus-visible:ring-white/70"
  const glass = "bg-white/10 ring-1 ring-white/20 backdrop-blur-md hover:bg-white/20"

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
          // The active slide (autoPlay) eagerly buffers the media so playback
          // begins the moment the viewer opens the replay instead of stalling
          // on a metadata-only fetch; inactive slides stay light at "metadata".
          // The poster (cover art) paints instantly while the first frames load.
          preload={autoPlay ? "auto" : "metadata"}
          // Contain keeps the portrait recording in its native aspect ratio, so
          // nothing important is cropped even on non-portrait viewports.
          className="size-full object-contain"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          // While playing, the rAF loop above owns `current` at the display
          // refresh rate; this only backfills the position when paused/seeking.
          onTimeUpdate={(e) => {
            if (e.currentTarget.paused) setCurrent(e.currentTarget.currentTime)
          }}
          onLoadedMetadata={onLoadedMetadata}
          onDurationChange={(e) => {
            const d = e.currentTarget.duration
            if (d !== Infinity && !Number.isNaN(d)) setDuration(d)
          }}
          onEnded={() => setPlaying(false)}
          {...exclusivePlaybackProps}
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
            {/* Legibility scrims top & bottom — soft, so the frame reads clean. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/70 to-transparent" />

            {/* ── Top bar ── minimize (left) · secondary actions (right).
                Speed, mute, PiP and close all share the same glass circle so the
                row reads as one system. Slides gently down from the top edge. */}
            <div
              className={cn(
                "absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 pt-[max(0.75rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] transition-transform duration-300 ease-out",
                controlsVisible ? "translate-y-0" : "-translate-y-2",
              )}
            >
              <div className="flex items-center gap-2">
                {onMinimize && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onMinimize()
                    }}
                    aria-label="Minimize player"
                    className={cn(controlBase, glass, "size-10")}
                  >
                    <ChevronDown className="size-5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    cycleSpeed()
                    revealControls()
                  }}
                  aria-label={`Playback speed ${speed}x`}
                  className={cn(controlBase, glass, "size-10 text-[11px] font-bold tabular-nums")}
                >
                  {speed}×
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMuted(!muted)
                    revealControls()
                  }}
                  aria-label={muted ? "Unmute" : "Mute"}
                  className={cn(controlBase, glass, "size-10")}
                >
                  {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void togglePip()
                    revealControls()
                  }}
                  aria-label="Picture in Picture"
                  className={cn(controlBase, glass, "size-10", isPip && "bg-white/25")}
                >
                  <PictureInPicture2 className="size-5" />
                </button>
                {onClose && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onClose()
                    }}
                    aria-label="Close replay"
                    className={cn(controlBase, glass, "size-10")}
                  >
                    <X className="size-5" />
                  </button>
                )}
              </div>
            </div>

            {/* ── Center transport ── rewind · play/pause (PRIMARY) · forward.
                The solid white play button is the single strongest element; the
                skip controls flank it in the shared subtle glass. */}
            <div
              className={cn(
                "pointer-events-none absolute inset-0 flex items-center justify-center transition-transform duration-300 ease-out",
                controlsVisible ? "scale-100" : "scale-95",
              )}
            >
              <div className="pointer-events-auto flex items-center justify-center gap-5 sm:gap-7">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    rewind()
                    revealControls()
                  }}
                  aria-label="Rewind 15 seconds"
                  className={cn(controlBase, glass, "relative size-11 sm:size-12")}
                >
                  <RotateCcw className="size-6" />
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">15</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle()
                    revealControls()
                  }}
                  aria-label={playing ? "Pause replay" : "Play replay"}
                  className={cn(
                    controlBase,
                    "size-16 bg-white text-black shadow-lg shadow-black/30 hover:scale-105 sm:size-[4.5rem]",
                  )}
                >
                  {playing ? (
                    <Pause className="size-7 fill-current" />
                  ) : (
                    <Play className="size-7 translate-x-0.5 fill-current" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    forward()
                    revealControls()
                  }}
                  aria-label="Forward 15 seconds"
                  className={cn(controlBase, glass, "relative size-11 sm:size-12")}
                >
                  <RotateCw className="size-6" />
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">15</span>
                </button>
              </div>
            </div>

            {/* ── Bottom cluster ── the primary timeline + fullscreen anchor.
                Time labels sit above an elegant scrubber; fullscreen shares the
                exact control language and is aligned as a deliberate primary
                action to the right. Slides gently up from the bottom edge. */}
            <div
              className={cn(
                "absolute inset-x-0 bottom-0 z-30 pb-[max(0.875rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] transition-transform duration-300 ease-out",
                controlsVisible ? "translate-y-0" : "translate-y-2",
              )}
            >
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium tabular-nums text-white/85">
                <span>{formatTime(current)}</span>
                <span>-{formatTime(Math.max(0, duration - current))}</span>
              </div>
              <div className="flex items-center gap-3">
                {/* Scrubber: thin & elegant at rest, thicker with a thumb during
                    interaction, over a generous h-8 hit area. touch-action:none
                    keeps a horizontal drag scrubbing instead of scrolling the reel. */}
                <div
                  className="group relative h-8 flex-1 cursor-pointer"
                  style={{ touchAction: "none" }}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-white/25 transition-[height] duration-200 ease-out group-hover:h-[5px] group-focus-within:h-[5px]">
                    <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
                  </div>
                  <div
                    className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.5)] transition-transform duration-200 ease-out group-hover:scale-100 group-focus-within:scale-100 group-active:scale-100"
                    style={{ left: `${pct}%` }}
                  />
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
                    style={{ touchAction: "none" }}
                    aria-label="Seek"
                  />
                </div>
                {/* Fullscreen — primary action, identical control weight. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void toggleFullscreen()
                    revealControls()
                  }}
                  aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                  className={cn(controlBase, glass, "size-10 shrink-0")}
                >
                  {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
