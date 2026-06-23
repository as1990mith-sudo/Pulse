"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { ChevronDown, Gauge, ListMusic, Pause, Play, Radio, RotateCcw, RotateCw, X } from "lucide-react"
import type { Show } from "@/lib/data"
import { cn } from "@/lib/utils"

function fmt(s: number) {
  if (!isFinite(s) || s < 0) return "0:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}

const SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const

/** An episode is playable on-demand when it has a recording and isn't live/upcoming. */
export function isPlayable(show: Show): boolean {
  return Boolean(show.audioUrl) && show.status !== "live" && show.status !== "upcoming"
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
  const audioRef = useRef<HTMLAudioElement>(null)
  const [current, setCurrent] = useState<Show | null>(null)
  const [queue, setQueue] = useState<Show[]>([])
  const [minimized, setMinimized] = useState(false)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speedIdx, setSpeedIdx] = useState(0)

  const play = useCallback((show: Show, q?: Show[]) => {
    if (!isPlayable(show)) return
    // Keep only playable tracks in the queue so up-next never lists live/upcoming.
    const playableQueue = (q ?? [show]).filter(isPlayable)
    setQueue(playableQueue.length > 0 ? playableQueue : [show])
    setCurrent(show)
    setMinimized(false)
    setCurrentTime(0)
    setDuration(0)
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
    const el = audioRef.current
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
    const el = audioRef.current
    if (!el || !current?.audioUrl) return
    el.playbackRate = SPEEDS[speedIdx]
    void el.play().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])

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
    const el = audioRef.current
    if (!el) return
    if (playing) el.pause()
    else void el.play().catch(() => {})
  }

  function skip(delta: number) {
    const el = audioRef.current
    if (!el) return
    const t = Math.min(Math.max(0, el.currentTime + delta), duration || el.duration || 0)
    el.currentTime = t
    setCurrentTime(t)
  }

  function cycleSpeed() {
    const next = (speedIdx + 1) % SPEEDS.length
    setSpeedIdx(next)
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next]
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const el = audioRef.current
    if (!el) return
    const t = Number(e.target.value)
    el.currentTime = t
    setCurrentTime(t)
  }

  // Recorded blobs often report Infinity duration until scanned; force it.
  function onMeta(e: React.SyntheticEvent<HTMLAudioElement>) {
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

      {/* Persistent audio element — lives above the router so playback survives
          navigation and minimise. */}
      <audio
        ref={audioRef}
        src={current?.audioUrl}
        preload="metadata"
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

      {/* Immersive overlay */}
      {current && (
        <div
          className="fixed inset-0 z-[58] flex flex-col overscroll-contain bg-background"
          style={minimized ? { display: "none" } : undefined}
          aria-hidden={minimized}
        >
          {/* Ambient backdrop */}
          {current.cover ? (
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
          )}

          {/* Top bar */}
          <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
            <button
              type="button"
              onClick={minimize}
              aria-label="Minimize player"
              className="flex size-10 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground active:scale-90"
            >
              <ChevronDown className="size-6" />
            </button>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Now playing</span>
            <button
              type="button"
              onClick={close}
              aria-label="Close player"
              className="flex size-10 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground active:scale-90"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
            <div className="mx-auto w-full max-w-xl">
              {/* Artwork */}
              <div className="mt-2 flex justify-center sm:mt-4">
                <div className="relative aspect-square w-52 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-foreground/10 sm:w-60">
                  {current.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={current.cover || "/placeholder.svg"} alt={current.title} className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-secondary">
                      <Radio className="size-16 text-muted-foreground" />
                    </div>
                  )}
                </div>
              </div>

              {/* Title block */}
              <div className="mt-5 text-center">
                <h2 className="text-balance font-display text-xl font-bold leading-tight tracking-tight">
                  {current.title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{current.host.name}</p>
              </div>

              {/* Scrubber */}
              <div className="mt-6 flex flex-col gap-1.5">
                <div className="group relative h-1.5 w-full">
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

              {/* Transport */}
              <div className="mt-3 flex items-center justify-center gap-6">
                <button
                  onClick={() => skip(-15)}
                  className="flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground active:scale-90"
                  aria-label="Rewind 15 seconds"
                >
                  <RotateCcw className="size-6" />
                </button>
                <button
                  onClick={toggle}
                  className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95"
                  aria-label={playing ? "Pause episode" : "Play episode"}
                >
                  {playing ? <Pause className="size-7" /> : <Play className="size-7 translate-x-0.5" />}
                </button>
                <button
                  onClick={() => skip(15)}
                  className="flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground active:scale-90"
                  aria-label="Forward 15 seconds"
                >
                  <RotateCw className="size-6" />
                </button>
              </div>

              {/* Speed */}
              <div className="mt-4 flex items-center justify-center">
                <button
                  onClick={cycleSpeed}
                  className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                  aria-label="Change playback speed"
                >
                  <Gauge className="size-3.5" />
                  {SPEEDS[speedIdx]}x
                </button>
              </div>

              {/* Up-next queue */}
              {upNext.length > 0 && (
                <div className="mt-8">
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <ListMusic className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Up next</h3>
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
                            <img
                              src={show.cover || "/placeholder.svg"}
                              alt=""
                              className="size-full object-cover"
                            />
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
