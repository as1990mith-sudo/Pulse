"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Check,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Play,
  Radio,
  Share2,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
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
import { LiveStage, QualityIcon } from "@/components/live-stage"
import { LiveAudience } from "@/components/live-audience"
import { ReactionLayer, ReactionPicker } from "@/components/live-reactions"
import { getAvatarColor } from "@/lib/identity"
import { cn } from "@/lib/utils"

/** Formats elapsed seconds as H:MM:SS / M:SS for the live duration clock. */
function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m)
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`
}

/** A small dock control button used along the bottom guest control bar. */
function DockButton({
  label,
  onClick,
  disabled,
  active,
  tone = "default",
  children,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  tone?: "default" | "live" | "danger"
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex size-11 items-center justify-center rounded-full transition-colors disabled:opacity-50",
        tone === "danger"
          ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
          : active && tone === "live"
            ? "bg-live/15 text-live"
            : active
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-foreground hover:bg-secondary/80",
      )}
    >
      {children}
    </button>
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
  const [shared, setShared] = useState(false)
  // Set when the host ends the broadcast — shows a "Session ended" splash then
  // bounces the listener back to the Live tab.
  const [hostEnded, setHostEnded] = useState(false)

  // Live duration clock, ticking from when this viewer connected.
  const [elapsed, setElapsed] = useState(0)
  const startedAtRef = useRef<number | null>(null)

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

  // Start the duration clock once connected.
  useEffect(() => {
    if (!state.connected) return
    if (startedAtRef.current == null) startedAtRef.current = Date.now()
    const iv = setInterval(() => {
      if (startedAtRef.current != null) setElapsed((Date.now() - startedAtRef.current) / 1000)
    }, 1000)
    return () => clearInterval(iv)
  }, [state.connected])

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

  async function share() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/live/${stream.roomName}` : ""
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: stream.title, text: `Join ${stream.hostName} live on Frequency`, url })
        return
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        setShared(true)
        setTimeout(() => setShared(false), 2000)
      }
    } catch {
      // user dismissed the share sheet — ignore
    }
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
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card">
      {/* ───────── Broadcast header: cover art + live + title + stats ───────── */}
      <header className="relative flex items-center gap-3 overflow-hidden border-b border-border/60 px-4 py-3">
        {stream.cover && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={stream.cover || "/placeholder.svg"}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 size-full object-cover opacity-15 blur-2xl"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-card via-card/80 to-card" />
          </>
        )}

        <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-secondary ring-1 ring-border/50">
          {stream.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={stream.cover || "/placeholder.svg"} alt="Cover art" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-muted-foreground">
              <Radio className="size-5" />
            </span>
          )}
        </span>

        <div className="relative min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <LiveBadge />
            {state.connected && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <QualityIcon quality={state.connectionQuality} />
                <span className="capitalize">{state.connectionQuality !== "unknown" ? state.connectionQuality : ""}</span>
              </span>
            )}
          </div>
          <h1 className="mt-0.5 truncate text-sm font-semibold leading-tight">{stream.title}</h1>
          <p className="truncate text-xs text-muted-foreground">with {stream.hostName}</p>
        </div>

        <div className="relative flex shrink-0 flex-col items-end gap-1">
          <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <Users className="size-3" /> {audience.toLocaleString()}
          </span>
          {state.connected && (
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{formatElapsed(elapsed)}</span>
          )}
        </div>
      </header>

      {/* ───────────────────────── Speaker stage ───────────────────────── */}
      <div className="relative flex flex-col gap-4 px-4 py-5 sm:px-6">
        {stream.cover && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={stream.cover || "/placeholder.svg"}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 size-full object-cover opacity-10 blur-3xl"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/30 to-card" />
          </>
        )}

        {/* Floating reactions + gifts drift up over the stage. */}
        <ReactionLayer roomName={state.connected ? stream.roomName : undefined} />

        <div className="relative">
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

        {/* Audio playback unblock (browsers block autoplay until a gesture). */}
        {state.connected && state.audioBlocked && (
          <button
            type="button"
            onClick={() => void startAudioPlayback()}
            className="relative mx-auto flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-opacity hover:opacity-90"
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
          <p className="relative mx-auto rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
            The host declined your request to join.
          </p>
        )}

        {/* Audience section */}
        <LiveAudience count={audience} className="relative" />
      </div>

      {/* ─────────────────────────── Guest dock ─────────────────────────── */}
      <div className="border-t border-border/60 bg-card px-4 py-3">
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
        ) : !state.connected ? (
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => void join()}
              className="flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Play className="size-4 translate-x-0.5" /> Join the room
            </button>
            <DockButton label="Share room" onClick={() => void share()}>
              {shared ? <Check className="size-5" /> : <Share2 className="size-5" />}
            </DockButton>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {isOnStage ? (
                <>
                  {/* On-stage guest: mute own mic + leave stage. */}
                  <DockButton
                    label={state.micEnabled ? "Mute your mic" : "Unmute your mic"}
                    onClick={() => void toggleMic()}
                    active={state.micEnabled}
                    tone="live"
                  >
                    {state.micEnabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
                  </DockButton>
                  <DockButton label="Leave the stage" onClick={() => void leaveStage()} tone="danger">
                    <PhoneOff className="size-5" />
                  </DockButton>
                  <span className="ml-1 hidden text-xs font-medium text-live sm:inline">You&apos;re on stage</span>
                </>
              ) : (
                <>
                  {/* Listener: mute incoming audio. */}
                  <DockButton
                    label={muted ? "Unmute audio" : "Mute audio"}
                    onClick={toggleMute}
                    active={muted}
                  >
                    {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
                  </DockButton>
                  {myStatus === "pending" ? (
                    <span className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mic className="size-3.5 animate-pulse" /> Waiting for host…
                    </span>
                  ) : (
                    <span className="ml-1 hidden text-xs text-muted-foreground sm:inline">Listening live</span>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Send reactions + virtual gifts to the whole room. */}
              <ReactionPicker roomName={stream.roomName} />
              {/* Jump to chat (mobile: chat lives below the fold). */}
              <a href="#live-chat" className="sm:hidden">
                <DockButton label="Open chat">
                  <MessageSquare className="size-5" />
                </DockButton>
              </a>
              <DockButton label="Share room" onClick={() => void share()}>
                {shared ? <Check className="size-5" /> : <Share2 className="size-5" />}
              </DockButton>
              {!isOnStage && myStatus !== "pending" && (
                <button
                  onClick={handleRequestCall}
                  className="flex items-center gap-1.5 rounded-full bg-call-accept/15 px-3 py-2 text-xs font-semibold text-call-accept transition-colors hover:bg-call-accept/25"
                >
                  <Mic className="size-4" /> Request to speak
                </button>
              )}
            </div>
          </div>
        )}
        {error && !ended && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}
