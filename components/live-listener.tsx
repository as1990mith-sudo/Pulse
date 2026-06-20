"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Pause, Play, Radio, Users, Volume2, VolumeX } from "lucide-react"
import type { LiveStreamView } from "@/app/actions/live"
import { joinBroadcast } from "@/app/actions/live"
import { useLiveAudio } from "@/lib/use-live-audio"
import { LiveBadge } from "@/components/live-badge"
import { cn } from "@/lib/utils"

function Waveform({ active }: { active: boolean }) {
  const bars = Array.from({ length: 32 }, (_, i) => i)
  return (
    <div className="flex h-16 items-end justify-center gap-1" aria-hidden="true">
      {bars.map((i) => (
        <span
          key={i}
          className={cn("w-1.5 rounded-full bg-primary", active ? "animate-live-pulse" : "h-1.5 opacity-30")}
          style={
            active
              ? { height: `${20 + ((i * 37) % 80)}%`, animationDelay: `${(i % 8) * 0.1}s`, animationDuration: "0.9s" }
              : undefined
          }
        />
      ))}
    </div>
  )
}

export function LiveListener({ stream, canListen }: { stream: LiveStreamView; canListen: boolean }) {
  const { state, connect, disconnect, setListenerMuted, startAudioPlayback } = useLiveAudio()
  const [muted, setMuted] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)

  async function join() {
    setError(null)
    setJoining(true)
    const res = await joinBroadcast({ roomName: stream.roomName })
    setJoining(false)
    if (!res.ok) {
      setError(res.error)
      setEnded(true)
      return
    }
    await connect({ serverUrl: res.serverUrl, token: res.token, publish: res.canPublish })
  }

  // Auto-join on mount for signed-in listeners.
  useEffect(() => {
    if (canListen) void join()
    return () => {
      void disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleMute() {
    const next = !muted
    setMuted(next)
    setListenerMuted(next)
  }

  const listeners = Math.max(0, state.listeners - 1)

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="relative flex flex-col items-center gap-6 px-6 py-8 sm:px-8">
        {stream.cover && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={stream.cover || "/placeholder.svg"}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 size-full object-cover opacity-20 blur-2xl"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 to-card" />
          </>
        )}

        <div className="relative flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <LiveBadge />
            <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Users className="size-3" /> {listeners.toLocaleString()} listening
            </span>
          </div>
          <span className="text-xs font-medium uppercase tracking-wider text-primary">Audio live</span>
        </div>

        {/* Host avatar / art */}
        <div className="relative flex size-44 items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-secondary shadow-lg sm:size-52">
          {stream.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={stream.cover || "/placeholder.svg"} alt={stream.title} className="size-full object-cover" />
          ) : (
            <Radio className="size-16 text-muted-foreground" />
          )}
        </div>

        <div className="relative text-center">
          <p className="font-semibold">{stream.hostName}</p>
          <p className="text-sm text-muted-foreground">{stream.hostHandle}</p>
        </div>

        <Waveform active={state.connected && state.speaking && !muted} />

        {state.connected && state.audioBlocked && (
          <button
            type="button"
            onClick={() => void startAudioPlayback()}
            className="relative flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-opacity hover:opacity-90"
          >
            <Volume2 className="size-4" /> Tap to enable sound
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-card px-4 py-3">
        {!canListen ? (
          <p className="text-sm text-muted-foreground">
            <Link href="/sign-in" className="font-medium text-primary hover:underline">
              Sign in
            </Link>{" "}
            to listen to this live stream.
          </p>
        ) : ended ? (
          <p className="text-sm text-muted-foreground">{error ?? "This stream has ended."}</p>
        ) : state.connecting || joining ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Connecting to the live audio…
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (state.connected) void disconnect()
                else void join()
              }}
              className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90"
              aria-label={state.connected ? "Leave stream" : "Join stream"}
            >
              {state.connected ? <Pause className="size-4" /> : <Play className="size-4 translate-x-0.5" />}
            </button>
            <button
              onClick={toggleMute}
              disabled={!state.connected}
              className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </button>
            <span className="ml-1 text-sm text-muted-foreground">
              {state.connected ? "Listening live" : "Tap play to listen"}
            </span>
          </div>
        )}
        {error && !ended && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}
