"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, Loader2, Pause, Phone, PhoneOff, Play, Radio, Users, Volume2, VolumeX, X } from "lucide-react"
import type { CallRequestView, LiveStreamView } from "@/app/actions/live"
import {
  getCallState,
  joinBroadcast,
  requestToJoin,
  respondToCallRequest,
  removeFromStage,
} from "@/app/actions/live"
import { useLiveAudio } from "@/lib/use-live-audio"
import { LiveBadge } from "@/components/live-badge"
import { LiveStage } from "@/components/live-stage"
import { getAvatarColor } from "@/lib/identity"
import { cn } from "@/lib/utils"

function Waveform({ active }: { active: boolean }) {
  const bars = Array.from({ length: 32 }, (_, i) => i)
  return (
    <div className="flex h-8 items-end justify-center gap-1" aria-hidden="true">
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

export function LiveListener({
  stream,
  canListen,
  currentUserId = null,
}: {
  stream: LiveStreamView
  canListen: boolean
  currentUserId?: string | null
}) {
  const router = useRouter()
  const { state, speakers, connect, disconnect, toggleMic, setListenerMuted, startAudioPlayback } = useLiveAudio()
  const [muted, setMuted] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)
  // Set when the host ends the broadcast — shows a "Session ended" splash then
  // bounces the listener back to the Live tab.
  const [hostEnded, setHostEnded] = useState(false)

  // Call-in state, polled from the server.
  const [myStatus, setMyStatus] = useState<CallRequestView["status"] | null>(null)
  const [myInvite, setMyInvite] = useState<CallRequestView | null>(null)
  const [declinedFlash, setDeclinedFlash] = useState(false)
  const prevStatus = useRef<CallRequestView["status"] | null>(null)

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

  useEffect(() => {
    if (canListen) void join()
    return () => {
      void disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poll call state so the listener sees their request status + any invite.
  useEffect(() => {
    if (!canListen) return
    let cancelled = false
    const tick = async () => {
      const s = await getCallState({ roomName: stream.roomName })
      if (cancelled) return
      // Host ended the session: tear down audio, show the splash, then redirect.
      if (s.ended) {
        setHostEnded(true)
        void disconnect()
        setTimeout(() => router.push("/live"), 2600)
        return
      }
      setMyInvite(s.myInvite)
      // Flash a "declined" toast when status transitions to declined.
      if (s.myStatus === "declined" && prevStatus.current && prevStatus.current !== "declined") {
        setDeclinedFlash(true)
        setTimeout(() => setDeclinedFlash(false), 4000)
      }
      prevStatus.current = s.myStatus
      setMyStatus(s.myStatus)
    }
    void tick()
    const iv = setInterval(tick, 3000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canListen, stream.roomName])

  function toggleMute() {
    const next = !muted
    setMuted(next)
    setListenerMuted(next)
  }

  async function handleRequestCall() {
    setMyStatus("pending")
    const res = await requestToJoin({ roomName: stream.roomName })
    if (!res.ok) {
      setMyStatus(null)
      setError(res.error ?? "Could not send your request.")
    }
  }

  async function acceptInvite() {
    if (!myInvite) return
    await respondToCallRequest({ id: myInvite.id, accept: true })
    setMyInvite(null)
    // Permission elevation arrives via LiveKit; mic auto-enables in the hook.
  }

  async function declineInvite() {
    if (!myInvite) return
    await respondToCallRequest({ id: myInvite.id, accept: false })
    setMyInvite(null)
  }

  async function leaveStage() {
    if (!currentUserId) return
    await removeFromStage({ roomName: stream.roomName, userId: currentUserId })
  }

  // Audience count excludes the host + guests on stage.
  const onStage = 1 + speakers.filter((s) => s.identity !== stream.hostId).length
  const audience = Math.max(0, state.listeners - onStage)

  const isOnStage = state.canPublish && state.connected
  const colorById: Record<string, string> = {}
  for (const s of speakers) colorById[s.identity] = getAvatarColor(s.identity)

  if (hostEnded) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 bg-card px-6 py-14 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Radio className="size-6" />
        </span>
        <p className="text-lg font-semibold">Session Ended</p>
        <p className="text-sm text-muted-foreground">The host has ended this live session. Taking you back to Live…</p>
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      {/* Room title + host header sits on top of the live show. */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <LiveBadge />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight">{stream.title}</h1>
            <p className="truncate text-xs text-muted-foreground">with {stream.hostName}</p>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
          <Users className="size-3" /> {audience.toLocaleString()}
        </span>
      </div>

      <div className="relative flex flex-col items-center gap-3 px-4 py-4 sm:px-6">
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

        {/* Host + 3 guest stage */}
        <div className="relative w-full">
          <LiveStage
            host={{ id: stream.hostId, name: stream.hostName, color: getAvatarColor(stream.hostId) }}
            speakers={speakers}
            activeSpeakers={state.activeSpeakers}
            hostColorById={colorById}
            isHost={false}
            canRequestCall={canListen && !isOnStage && myStatus !== "pending"}
            callPending={myStatus === "pending"}
            onRequestCall={handleRequestCall}
          />
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

        {/* Invite from the host to come on stage. */}
        {myInvite && !isOnStage && (
          <div className="relative flex w-full items-center justify-between gap-3 rounded-xl border border-live/40 bg-live/5 px-3 py-2.5">
            <p className="text-sm font-medium text-pretty">The host invited you to join as a guest.</p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={acceptInvite}
                className="flex items-center gap-1 rounded-full bg-live px-3 py-1.5 text-xs font-semibold text-background"
              >
                <Check className="size-3.5" /> Join
              </button>
              <button
                onClick={declineInvite}
                className="flex size-7 items-center justify-center rounded-full bg-secondary text-muted-foreground"
                aria-label="Decline invite"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        )}

        {declinedFlash && (
          <p className="relative rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
            The host declined your request to join.
          </p>
        )}
      </div>

      {/* Controls */}
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
          <div className="flex w-full items-center gap-2">
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

            {isOnStage ? (
              <>
                {/* On-stage guest controls: mute own mic + leave stage. */}
                <button
                  onClick={() => void toggleMic()}
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full transition-colors",
                    state.micEnabled
                      ? "bg-live/15 text-live"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                  aria-label={state.micEnabled ? "Mute your mic" : "Unmute your mic"}
                >
                  {state.micEnabled ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
                </button>
                <button
                  onClick={() => void leaveStage()}
                  className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/20"
                >
                  <PhoneOff className="size-4" /> Leave stage
                </button>
                <span className="ml-auto text-xs font-medium text-live">You&apos;re live</span>
              </>
            ) : (
              <>
                <button
                  onClick={toggleMute}
                  disabled={!state.connected}
                  className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                  aria-label={muted ? "Unmute" : "Mute"}
                >
                  {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
                </button>
                {myStatus === "pending" ? (
                  <span className="ml-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Phone className="size-3.5 animate-pulse" /> Waiting for host…
                  </span>
                ) : (
                  <span className="ml-1 text-sm text-muted-foreground">
                    {state.connected ? "Listening live" : "Tap play to listen"}
                  </span>
                )}
              </>
            )}
          </div>
        )}
        {error && !ended && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}
