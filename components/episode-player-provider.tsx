"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronUp, Gauge, ListMusic, Maximize, Minimize, Pause, Play, Radio, RotateCcw, RotateCw, X } from "lucide-react"
import type { Show } from "@/lib/data"
import { cn } from "@/lib/utils"
import { getEpisodeComments } from "@/app/actions/episodes"
import { EpisodeNowPlayingActions } from "@/components/episode-now-playing-actions"
import { EpisodeCommentsInline } from "@/components/episode-comments-inline"

function fmt(s: number) {
  if (!isFinite(s) || s < 0) return "0:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}

const SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const

/** An episode is playable on-demand when it has a recording (audio OR video) and isn't live/upcoming. */
export function isPlayable(show: Show): boolean {
  return Boolean(show.audioUrl || show.videoUrl) && show.status !== "live" && show.status !== "upcoming"
}

type Ctx = {
  /** Start (or switch to) a track. `queue` is the ordered catalogue it belongs to. */
  play: (show: Show, queue?: Show[]) => void
  close: () => void
  minimize: () => void
  expand: () => void
  activeId: string | null
}

const EpisodePlayerContext = createContext<Ctx | null>(null)

export function useEpisodePlayer() {
  const ctx = useContext(EpisodePlayerContext)
  if (!ctx) throw new Error("useEpisodePlayer must be used within EpisodePlayerProvider")
  return ctx
}

/**
 * Owns a single persistent <audio> element mounted above the router, so episode
 * playback survives navigation exactly like a live session. Opening a track
 * shows an immersive overlay (with the rest of the catalogue as an up-next
 * queue); collapsing it reveals the page underneath with a docked mini-player
 * while audio keeps playing.
 */
export function EpisodePlayerProvider({ children }: { children: React.ReactNode }) {
  const mediaRef = useRef<HTMLVideoElement>(null)
  // The video frame is the element we put into fullscreen so our own controls
  // (docked inside it) stay visible — rather than the bare, control-less <video>.
  const frameRef = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState<Show | null>(null)
  const [queue, setQueue] = useState<Show[]>([])
  const [minimized, setMinimized] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speedIdx, setSpeedIdx] = useState(0)
  // Whether the on-video transport controls are shown (tap the video to toggle;
  // they auto-hide a few seconds after playback starts, like YouTube).
  const [controlsVisible, setControlsVisible] = useState(true)
  // Inline comment section (Section 2): expanded shows composer + thread, else a
  // compact "Comments (n)" row. Count is loaded per track so the badge/row stay
  // accurate whether or not the section is expanded.
  const [commentsExpanded, setCommentsExpanded] = useState(false)
  const [commentCount, setCommentCount] = useState(0)

  // The active track's playable source + whether it's a video recording. A
  // single <video> element drives both audio and video episodes (a <video>
  // plays audio-only files fine); for audio we simply hide the frame.
  const isVideo = Boolean(current?.videoUrl)
  const mediaUrl = current?.videoUrl ?? current?.audioUrl

  const play = useCallback((show: Show, q?: Show[]) => {
    if (!isPlayable(show)) return
    // Keep only playable tracks in the queue so up-next never lists live/upcoming.
    const playableQueue = (q ?? [show]).filter(isPlayable)
    setQueue(playableQueue.length > 0 ? playableQueue : [show])
    setCurrent(show)
    setMinimized(false)
    setCurrentTime(0)
    setDuration(0)
    setControlsVisible(true)
    setCommentsExpanded(false)
    setCommentCount(0)
  }, [])

  const expand = useCallback(() => setMinimized(false), [])

  const minimize = useCallback(() => {
    // Consume the sentinel history entry (pushed when the overlay opened) so the
    // back stack stays balanced; its popstate handler flips `minimized`.
    if (typeof window !== "undefined" && (window.history.state as { __episodeOverlay?: boolean })?.__episodeOverlay) {
      window.history.back()
    } else {
      setMinimized(true)
    }
  }, [])

  const close = useCallback(() => {
    const el = mediaRef.current
    if (el) el.pause()
    if (typeof window !== "undefined" && (window.history.state as { __episodeOverlay?: boolean })?.__episodeOverlay) {
      window.history.back()
    }
    setCurrent(null)
    setQueue([])
    setMinimized(false)
    setPlaying(false)
  }, [])

  // When the active track changes, (re)load and start playback. This runs off a
  // user tap, so autoplay is permitted.
  useEffect(() => {
    const el = mediaRef.current
    if (!el || !mediaUrl) return
    el.playbackRate = SPEEDS[speedIdx]
    void el.play().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])

  // Load the comment count for the active track so the pinned action bar badge
  // and the compact "Comments (n)" row stay accurate before the section opens.
  useEffect(() => {
    const episodeId = current?.episodeId
    if (!episodeId) {
      setCommentCount(0)
      return
    }
    let active = true
    getEpisodeComments(episodeId)
      .then((c) => active && setCommentCount(c.length))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [current?.episodeId])

  // Auto-hide the on-video controls a few seconds after playback starts; any tap
  // re-reveals them. Paused keeps them visible so users can scrub/resume.
  useEffect(() => {
    if (!controlsVisible || !playing || !isVideo) return
    const t = window.setTimeout(() => setControlsVisible(false), 3000)
    return () => window.clearTimeout(t)
  }, [controlsVisible, playing, isVideo])

  // Sentinel history entry so the hardware/browser back gesture collapses the
  // immersive player instead of navigating away from the catalogue underneath.
  const overlayOpen = Boolean(current) && !minimized
  useEffect(() => {
    if (!overlayOpen) return
    window.history.pushState({ __episodeOverlay: true }, "")
    const onPop = () => setMinimized(true)
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [overlayOpen])

  // Reserve space for the docked mini-player so page content never hides behind it.
  const miniShown = Boolean(current) && minimized
  useEffect(() => {
    if (!miniShown) return
    const body = document.body
    const prev = body.style.paddingBottom
    body.style.paddingBottom = "calc(5.25rem + env(safe-area-inset-bottom))"
    return () => {
      body.style.paddingBottom = prev
    }
  }, [miniShown])

  // Lock the underlying page from scrolling while the immersive overlay is open.
  useEffect(() => {
    if (!overlayOpen) return
    const html = document.documentElement
    const body = document.body
    const prev = { htmlOverflow: html.style.overflow, bodyOverflow: body.style.overflow }
    html.style.overflow = "hidden"
    body.style.overflow = "hidden"
    return () => {
      html.style.overflow = prev.htmlOverflow
      body.style.overflow = prev.bodyOverflow
    }
  }, [overlayOpen])

  function toggle() {
    const el = mediaRef.current
    if (!el) return
    if (playing) el.pause()
    else void el.play().catch(() => {})
  }

  // Tapping the video surface toggles the on-video controls (show/hide).
  function toggleControls() {
    setControlsVisible((v) => !v)
  }

  function skip(delta: number) {
    const el = mediaRef.current
    if (!el) return
    const t = Math.min(Math.max(0, el.currentTime + delta), duration || el.duration || 0)
    el.currentTime = t
    setCurrentTime(t)
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
    setCurrentTime(t)
  }

  // Toggle a YouTube-style fullscreen: we put the whole video *frame* into
  // fullscreen (so our scrubber/controls stay visible) and lock to landscape
  // where supported. iOS Safari/WKWebView can't fullscreen arbitrary elements,
  // so we fall back to the native video fullscreen there.
  async function toggleFullscreen() {
    const fsEl =
      document.fullscreenElement ??
      (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement
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
        // iOS Safari: opens the native fullscreen player (which auto-rotates).
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

  // Track fullscreen state (to dock/undock the controls) and release the
  // orientation lock automatically when fullscreen is exited.
  useEffect(() => {
    const onFsChange = () => {
      const active = Boolean(
        document.fullscreenElement ??
          (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement,
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

  // Recorded blobs often report Infinity duration until scanned; force it.
  function onMeta(e: React.SyntheticEvent<HTMLVideoElement>) {
    const el = e.currentTarget
    el.playbackRate = SPEEDS[speedIdx]
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

  function handleEnded() {
    setPlaying(false)
    // Auto-advance to the next playable track in the queue.
    const idx = queue.findIndex((s) => s.id === current?.id)
    const next = idx >= 0 ? queue[idx + 1] : undefined
    if (next) play(next, queue)
  }

  const upNext = current ? queue.slice(queue.findIndex((s) => s.id === current.id) + 1) : []
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <EpisodePlayerContext.Provider value={{ play, close, minimize, expand, activeId: current?.id ?? null }}>
      {children}

      {/* Immersive overlay */}
      {current && (
        <div
          className="fixed inset-0 z-[58] flex flex-col overscroll-contain bg-background"
          style={minimized ? { display: "none" } : undefined}
          aria-hidden={minimized}
        >
          {/* Ambient backdrop (audio only — video is edge-to-edge black) */}
          {!isVideo &&
            (current.cover ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={current.cover || "/placeholder.svg"}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 -z-10 size-full scale-125 object-cover opacity-40 blur-3xl saturate-150"
                />
                <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-background/70 to-background" />
              </>
            ) : (
              <div className="pointer-events-none absolute inset-0 -z-10 bg-secondary/40" />
            ))}

          {/* ============ SECTION 1 — PINNED (never scrolls) ============ */}
          <div className="relative z-10 flex shrink-0 flex-col bg-background">
            {isVideo ? (
              /* Borderless, edge-to-edge video with controls docked on top of it.
                 Tapping the surface shows/hides the controls. */
              <div
                ref={frameRef}
                onClick={toggleControls}
                className={cn(
                  "group relative bg-black",
                  isFullscreen ? "flex h-screen w-screen items-center justify-center" : "aspect-video w-full",
                )}
              >
                <video
                  ref={mediaRef}
                  src={mediaUrl}
                  poster={current.cover ?? undefined}
                  playsInline
                  preload="metadata"
                  className="size-full object-contain"
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  onLoadedMetadata={onMeta}
                  onDurationChange={(e) => {
                    const d = e.currentTarget.duration
                    if (d !== Infinity && !Number.isNaN(d)) setDuration(d)
                  }}
                  onEnded={handleEnded}
                />

                {/* Minimize — circular downward chevron, upper-left, on the video. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    minimize()
                  }}
                  aria-label="Minimize player"
                  className={cn(
                    "absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex size-9 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/15 backdrop-blur-md transition-opacity duration-200 active:scale-90",
                    controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
                  )}
                >
                  <ChevronDown className="size-5" />
                </button>

                {/* Close — upper-right, on the video. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    close()
                  }}
                  aria-label="Close player"
                  className={cn(
                    "absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex size-9 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/15 backdrop-blur-md transition-opacity duration-200 active:scale-90",
                    controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
                  )}
                >
                  <X className="size-4" />
                </button>

                {/* On-video controls: scrubber + transport + speed + fullscreen. */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pt-16 text-white transition-opacity duration-200",
                    isFullscreen
                      ? "mx-auto max-w-3xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
                      : "pb-3",
                    controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
                  )}
                >
                  <div className="flex flex-col gap-1">
                    <div className="relative h-1.5 w-full">
                      <div className="absolute inset-0 rounded-full bg-white/25" />
                      <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${pct}%` }} />
                      <input
                        type="range"
                        min={0}
                        max={duration || 0}
                        step={0.1}
                        value={currentTime}
                        onChange={seek}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        aria-label="Seek"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-medium tabular-nums text-white/80">
                      <span>{fmt(currentTime)}</span>
                      <span>-{fmt(Math.max(0, duration - currentTime))}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-8">
                    <button onClick={() => skip(-15)} aria-label="Rewind 15 seconds" className="text-white/85 transition-colors hover:text-white active:scale-90">
                      <RotateCcw className="size-6" />
                    </button>
                    <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="flex size-14 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105 active:scale-95">
                      {playing ? <Pause className="size-6" /> : <Play className="size-6 translate-x-0.5" />}
                    </button>
                    <button onClick={() => skip(15)} aria-label="Forward 15 seconds" className="text-white/85 transition-colors hover:text-white active:scale-90">
                      <RotateCw className="size-6" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <button onClick={cycleSpeed} aria-label="Change playback speed" className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white/90 transition-colors hover:bg-white/25 hover:text-white">
                      <Gauge className="size-3.5" />
                      {SPEEDS[speedIdx]}x
                    </button>
                    <button onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} className="flex size-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 active:scale-90">
                      {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Audio: hidden media element + a pinned header (cover, scrubber,
                 transport) so playback stays put while comments scroll below. */
              <div className="relative">
                <video
                  ref={mediaRef}
                  src={mediaUrl}
                  playsInline
                  preload="metadata"
                  className="sr-only"
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  onLoadedMetadata={onMeta}
                  onDurationChange={(e) => {
                    const d = e.currentTarget.duration
                    if (d !== Infinity && !Number.isNaN(d)) setDuration(d)
                  }}
                  onEnded={handleEnded}
                />
                <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
                  <button
                    type="button"
                    onClick={minimize}
                    aria-label="Minimize player"
                    className="flex size-9 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground active:scale-90"
                  >
                    <ChevronDown className="size-6" />
                  </button>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Now playing</span>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close player"
                    className="flex size-9 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground active:scale-90"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <div className="flex justify-center px-4 pt-2">
                  {current.cover ? (
                    <div className="relative aspect-square w-44 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-foreground/10 sm:w-52">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={current.cover || "/placeholder.svg"} alt={current.title} className="size-full object-cover" />
                    </div>
                  ) : (
                    <div className="relative flex aspect-square w-44 items-center justify-center overflow-hidden rounded-2xl bg-secondary shadow-2xl ring-1 ring-foreground/10 sm:w-52">
                      <Radio className="size-16 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="mx-auto w-full max-w-xl px-4 pt-4">
                  <div className="flex flex-col gap-1.5">
                    <div className="relative h-1.5 w-full">
                      <div className="absolute inset-0 rounded-full bg-foreground/15" />
                      <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      <input
                        type="range"
                        min={0}
                        max={duration || 0}
                        step={0.1}
                        value={currentTime}
                        onChange={seek}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        aria-label="Seek"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-medium tabular-nums text-muted-foreground">
                      <span>{fmt(currentTime)}</span>
                      <span>-{fmt(Math.max(0, duration - currentTime))}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-center gap-8">
                    <button onClick={() => skip(-15)} aria-label="Rewind 15 seconds" className="text-muted-foreground transition-colors hover:text-foreground active:scale-90">
                      <RotateCcw className="size-6" />
                    </button>
                    <button onClick={toggle} aria-label={playing ? "Pause episode" : "Play episode"} className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95">
                      {playing ? <Pause className="size-6" /> : <Play className="size-6 translate-x-0.5" />}
                    </button>
                    <button onClick={() => skip(15)} aria-label="Forward 15 seconds" className="text-muted-foreground transition-colors hover:text-foreground active:scale-90">
                      <RotateCw className="size-6" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-center">
                    <button onClick={cycleSpeed} aria-label="Change playback speed" className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground">
                      <Gauge className="size-3.5" />
                      {SPEEDS[speedIdx]}x
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Title + creator */}
            <div className={cn("mx-auto w-full max-w-xl px-4 pt-3", !isVideo && "text-center")}>
              <h2 className="text-balance font-display text-lg font-bold leading-tight tracking-tight">
                {current.title}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{current.host.name}</p>
            </div>

            {/* Action bar: Like, Comment, Save, Share */}
            <div className="mx-auto w-full max-w-xl border-b border-border/60 px-2 py-2">
              <EpisodeNowPlayingActions
                show={current}
                commentCount={commentCount}
                commentsExpanded={commentsExpanded}
                onToggleComments={() => setCommentsExpanded((v) => !v)}
              />
            </div>
          </div>

          {/* ============ SECTION 2 — SCROLLABLE (starts below the action bar) ============ */}
          <div className="relative z-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
            <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
              {/* Comments — toggled by the Comment button (and this compact row). */}
              {commentsExpanded ? (
                <div className="duration-300 animate-in fade-in slide-in-from-top-1">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      Comments
                      {commentCount > 0 && <span className="ml-1 text-muted-foreground">({commentCount})</span>}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setCommentsExpanded(false)}
                      aria-label="Collapse comments"
                      className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Hide <ChevronUp className="size-4" />
                    </button>
                  </div>
                  {current.episodeId ? (
                    <EpisodeCommentsInline episodeId={current.episodeId} onCountChange={setCommentCount} />
                  ) : (
                    <p className="text-sm text-muted-foreground">Comments aren&apos;t available for this item.</p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCommentsExpanded(true)}
                  disabled={!current.episodeId}
                  aria-expanded={false}
                  className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-card px-4 py-3 text-sm font-semibold transition-colors hover:bg-secondary/60 disabled:opacity-50"
                >
                  <span>
                    Comments
                    {commentCount > 0 && <span className="ml-1 text-muted-foreground">({commentCount})</span>}
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground" />
                </button>
              )}

              {/* More from… (up next / recommended) — directly beneath comments. */}
              {upNext.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <ListMusic className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">More from {current.host.name}</h3>
                    <span className="text-xs text-muted-foreground">· {upNext.length}</span>
                  </div>
                  <ul className="flex flex-col">
                    {upNext.map((show) => (
                      <li key={show.id}>
                        <button
                          type="button"
                          onClick={() => play(show, queue)}
                          className="group flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left transition-colors hover:bg-foreground/5 active:bg-foreground/10"
                        >
                          <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-secondary">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={show.cover || "/placeholder.svg"} alt="" className="size-full object-cover" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold leading-tight">{show.title}</span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {show.duration ? `${show.duration} · ` : ""}
                              {show.host.name}
                            </span>
                          </span>
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover:bg-foreground/10 group-hover:text-foreground">
                            <Play className="size-4 translate-x-px" />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Docked mini-player while minimised */}
      {current && minimized && (
        <div className="fixed inset-x-0 bottom-0 z-[55] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex w-full max-w-2xl items-center gap-2 rounded-2xl border border-white/15 bg-zinc-900/95 p-2 text-left shadow-2xl ring-1 ring-black/40 backdrop-blur-xl">
            <button
              type="button"
              onClick={expand}
              aria-label={`Expand player: ${current.title}`}
              className="flex min-w-0 flex-1 items-center gap-3 transition-transform active:scale-[0.99]"
            >
              <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-800 ring-1 ring-white/10">
                {current.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={current.cover || "/placeholder.svg"} alt="" className="size-full object-cover" />
                ) : (
                  <Radio className="size-5 text-white/70" strokeWidth={2.5} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-white">{current.title}</span>
                <span className="mt-0.5 block truncate text-xs font-medium text-white/55">{current.host.name}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? "Pause" : "Play"}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-zinc-900 transition-transform active:scale-90"
            >
              {playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-px" />}
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="Close player"
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
    </EpisodePlayerContext.Provider>
  )
}
