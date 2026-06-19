"use client"

import { useState } from "react"
import { Pause, Play, Volume2, VolumeX } from "lucide-react"
import type { Show } from "@/lib/data"
import { LiveBadge } from "@/components/live-badge"
import { cn } from "@/lib/utils"

function Waveform({ active }: { active: boolean }) {
  // A wider equalizer used as the centrepiece of the audio player.
  const bars = Array.from({ length: 32 }, (_, i) => i)
  return (
    <div className="flex h-16 items-end justify-center gap-1" aria-hidden="true">
      {bars.map((i) => (
        <span
          key={i}
          className={cn("w-1.5 rounded-full bg-primary", active ? "animate-live-pulse" : "h-1.5 opacity-30")}
          style={
            active
              ? {
                  height: `${20 + ((i * 37) % 80)}%`,
                  animationDelay: `${(i % 8) * 0.1}s`,
                  animationDuration: "0.9s",
                }
              : undefined
          }
        />
      ))}
    </div>
  )
}

export function StreamPlayer({ show }: { show: Show }) {
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(false)

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="relative flex flex-col items-center gap-6 px-6 py-8 sm:px-8">
        {/* Ambient backdrop built from the cover art */}
        <img
          src={show.cover || "/placeholder.svg"}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full object-cover opacity-20 blur-2xl"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 to-card" />

        <div className="relative flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <LiveBadge />
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {show.listeners.toLocaleString()} listening
            </span>
          </div>
          <span className="text-xs font-medium uppercase tracking-wider text-primary">Audio live</span>
        </div>

        {/* Album art */}
        <div className="relative">
          <div
            className={cn(
              "size-44 overflow-hidden rounded-2xl border border-border/60 shadow-lg transition-all sm:size-52",
              !playing && "brightness-50",
            )}
          >
            <img
              src={show.cover || "/placeholder.svg"}
              alt={`${show.title} cover art`}
              className="size-full object-cover"
            />
          </div>
          {!playing && (
            <button
              onClick={() => setPlaying(true)}
              className="absolute inset-0 flex items-center justify-center"
              aria-label="Resume stream"
            >
              <span className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Play className="size-7 translate-x-0.5" />
              </span>
            </button>
          )}
        </div>

        <div className="relative text-center">
          <p className="font-semibold">{show.host.name}</p>
          <p className="text-sm text-muted-foreground">{show.host.handle}</p>
        </div>

        <Waveform active={playing && !muted} />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90"
            aria-label={playing ? "Pause stream" : "Play stream"}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-0.5" />}
          </button>
          <button
            onClick={() => setMuted((m) => !m)}
            className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
          <span className="ml-1 text-sm text-muted-foreground">{playing ? "Streaming live" : "Paused"}</span>
        </div>
      </div>
    </div>
  )
}
