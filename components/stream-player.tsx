"use client"

import { useState } from "react"
import { Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react"
import type { Show } from "@/lib/data"
import { LiveBadge } from "@/components/live-badge"
import { cn } from "@/lib/utils"

function Equalizer({ active }: { active: boolean }) {
  return (
    <div className="flex h-5 items-end gap-0.5" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <span
          key={i}
          className={cn("w-1 rounded-full bg-primary", active ? "animate-live-pulse" : "h-1 opacity-40")}
          style={
            active
              ? { height: `${30 + ((i * 13) % 70)}%`, animationDelay: `${i * 0.12}s`, animationDuration: "0.9s" }
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
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-black">
      <div className="relative aspect-video">
        <img
          src={show.cover || "/placeholder.svg"}
          alt={`${show.host.name} live video feed`}
          className={cn("size-full object-cover transition-all", !playing && "blur-sm brightness-50")}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

        <div className="absolute left-4 top-4 flex items-center gap-2">
          <LiveBadge />
          <span className="rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
            {show.listeners.toLocaleString()} watching
          </span>
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

        <div className="absolute bottom-4 left-4 flex items-center gap-3">
          <div className="rounded-lg bg-black/50 px-3 py-2 backdrop-blur">
            <p className="text-sm font-semibold text-white">{show.host.name}</p>
            <p className="text-xs text-white/70">{show.host.handle}</p>
          </div>
          {playing && (
            <div className="rounded-lg bg-black/50 px-3 py-2.5 backdrop-blur">
              <Equalizer active={!muted} />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 bg-card px-4 py-3">
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
          <span className="ml-1 text-sm text-muted-foreground">
            {playing ? "Streaming live" : "Paused"}
          </span>
        </div>
        <button
          className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Fullscreen"
        >
          <Maximize2 className="size-5" />
        </button>
      </div>
    </div>
  )
}
