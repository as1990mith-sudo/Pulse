"use client"

import { useRef, useState } from "react"
import { Pause, Play, Radio } from "lucide-react"
import type { Show } from "@/lib/data"
import { cn } from "@/lib/utils"

function fmt(s: number) {
  if (!isFinite(s) || s < 0) return "0:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}

/**
 * On-demand player for a published episode. Plays the recorded session audio
 * when one exists; otherwise shows that the episode has no recording.
 */
export function EpisodePlayer({ show }: { show: Show }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const hasAudio = Boolean(show.audioUrl)

  function toggle() {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
    } else {
      void el.play().catch(() => {})
    }
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
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="relative flex flex-col items-center gap-6 px-6 py-8 sm:px-8">
        {show.cover && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={show.cover || "/placeholder.svg"}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 size-full object-cover opacity-20 blur-2xl"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 to-card" />
          </>
        )}

        <div className="relative flex size-44 items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-secondary shadow-lg sm:size-52">
          {show.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={show.cover || "/placeholder.svg"} alt={show.title} className="size-full object-cover" />
          ) : (
            <Radio className="size-16 text-muted-foreground" />
          )}
        </div>

        <div className="relative text-center">
          <p className="font-semibold">{show.host.name}</p>
          <p className="text-sm text-muted-foreground">{show.host.handle}</p>
        </div>
      </div>

      <div className="border-t border-border/60 bg-card px-4 py-4 sm:px-6">
        {hasAudio ? (
          <div className="flex items-center gap-4">
            <button
              onClick={toggle}
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90"
              aria-label={playing ? "Pause episode" : "Play episode"}
            >
              {playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-0.5" />}
            </button>
            <div className="flex flex-1 flex-col gap-1.5">
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={current}
                onChange={seek}
                className="h-1.5 w-full cursor-pointer accent-primary"
                aria-label="Seek"
              />
              <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
                <span>{fmt(current)}</span>
                <span>{fmt(duration)}</span>
              </div>
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
          <p className={cn("text-sm text-muted-foreground")}>
            This episode was published without a recording, so there&apos;s no audio to play.
          </p>
        )}
      </div>
    </div>
  )
}
