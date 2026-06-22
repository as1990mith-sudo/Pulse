"use client"

import { useRef, useState } from "react"
import { Pause, Play, Radio, RotateCcw, RotateCw, Gauge } from "lucide-react"
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
 * Immersive on-demand player for a published episode. Borderless, ambient
 * design with the cover art bleeding into a blurred backdrop. Plays the
 * recorded session audio when one exists; otherwise notes there's no recording.
 */
export function EpisodePlayer({ show }: { show: Show }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speedIdx, setSpeedIdx] = useState(0)
  const hasAudio = Boolean(show.audioUrl)
  const pct = duration > 0 ? (current / duration) * 100 : 0

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
    setCurrent(t)
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
    setCurrent(t)
  }

  // Recorded sessions (webm/streamed blobs) often report duration as Infinity
  // until the browser scans to the end. Force a seek to the end to make the
  // real length available, then restore the position.
  function onMeta(e: React.SyntheticEvent<HTMLAudioElement>) {
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

  return (
    <div className="relative isolate overflow-hidden rounded-3xl">
      {/* Ambient backdrop from the cover art */}
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

      <div className="flex flex-col items-center gap-5 px-6 pt-8 sm:px-10">
        {/* Artwork */}
        <div className="relative aspect-square w-44 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-foreground/10 sm:w-52">
          {show.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={show.cover || "/placeholder.svg"} alt={show.title} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center bg-secondary">
              <Radio className="size-16 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Title block */}
        <div className="text-center">
          <h2 className="text-balance text-lg font-bold leading-tight tracking-tight">{show.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{show.host.name}</p>
        </div>
      </div>

      <div className="px-6 pb-7 pt-5 sm:px-10">
        {hasAudio ? (
          <div className="flex flex-col gap-4">
            {/* Scrubber */}
            <div className="flex flex-col gap-1.5">
              <div className="group relative h-1.5 w-full">
                <div className="absolute inset-0 rounded-full bg-foreground/15" />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary"
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
              <div className="flex items-center justify-between text-[11px] font-medium tabular-nums text-muted-foreground">
                <span>{fmt(current)}</span>
                <span>-{fmt(Math.max(0, duration - current))}</span>
              </div>
            </div>

            {/* Transport controls */}
            <div className="flex items-center justify-center gap-6">
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

            {/* Secondary row: playback speed */}
            <div className="flex items-center justify-center">
              <button
                onClick={cycleSpeed}
                className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                aria-label="Change playback speed"
              >
                <Gauge className="size-3.5" />
                {SPEEDS[speedIdx]}x
              </button>
            </div>

            <audio
              ref={audioRef}
              src={show.audioUrl}
              preload="metadata"
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
          </div>
        ) : (
          <p className={cn("text-center text-sm text-muted-foreground")}>
            This episode was published without a recording, so there&apos;s no audio to play.
          </p>
        )}
      </div>
    </div>
  )
}
