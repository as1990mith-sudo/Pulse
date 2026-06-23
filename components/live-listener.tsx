"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Check,
  Loader2,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Play,
  Radio,
  Send,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { ShareSheet } from "@/components/share-sheet"
import { BackExitMenu } from "@/components/live-back-menu"
import { LiveChat } from "@/components/live-chat"
import { CoverArt } from "@/components/cover-art"
import type { CurrentUser } from "@/lib/session"
import type { ShareTarget } from "@/lib/share-types"
import type { CallRequestView, LiveStreamView } from "@/app/actions/live"
import {
  getCallState,
  joinBroadcast,
  requestToJoin,
  respondToCallRequest,
  removeFromStage,
} from "@/app/actions/live"
import { toggleFollow, getFollowingIds } from "@/app/actions/follow"
import { useLiveAudio } from "@/lib/use-live-audio"
import { LiveBadge } from "@/components/live-badge"
import { LiveStage, QualityIcon } from "@/components/live-stage"
import { LiveAudience } from "@/components/live-audience"
import { ReactionLayer } from "@/components/live-reactions"
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
        "flex size-12 items-center justify-center rounded-full shadow-xl ring-1 ring-inset transition-all hover:scale-105 active:scale-95 disabled:opacity-50 [&>svg]:size-[22px] [&>svg]:stroke-[2.5]",
        tone === "danger"
          ? "bg-destructive text-white shadow-destructive/40 ring-white/25 hover:bg-destructive/90"
          : active && tone === "live"
            ? "bg-live text-live-foreground shadow-live/40 ring-white/25"
            : active
              ? "bg-primary text-primary-foreground shadow-primary/40 ring-white/25"
              : "bg-white/25 text-white ring-white/25 hover:bg-white/35",
      )}
    >
      {children}
    </button>
  )
}

export function LiveListener({
  stream,
  canListen,
  currentUser = null,
  currentUserId = null,
  onMinimize,
  onExit,
  onMeta,
}: {
  stream: LiveStreamView
  canListen: boolean
  currentUser?: CurrentUser | null
  currentUserId?: string | null
  onMinimize?: () => void
  onExit?: () => void
  onMeta?: (m: { title: string; cover: string | null; live: boolean; subtitle?: string }) => void
}) {
  const router = useRouter()
  const { state, speakers, connect, disconnect, toggleMic, setListenerMuted, startAudioPlayback } = useLiveAudio()
  const [muted, setMuted] = useState(false)
  // The audience/crowd view is hidden by default (frees space for the stage +
  // chat) and revealed by tapping the audience pill in the header.
  const [showAudience, setShowAudience] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  // Set when the host ends the broadcast — shows a "Session ended" splash then
  // bounces the listener back to the Live tab.
  const [hostEnded, setHostEnded] = useState(false)

  // Whether the current listener follows the host (drives the follow chip on
  // the host's stage tile). The host can't follow themselves.
  const isSelfHost = currentUserId === stream.hostId
  const [following, setFollowing] = useState(false)
  const [followPending, setFollowPending] = useState(false)
  useEffect(() => {
    if (!currentUser || isSelfHost) return
    let cancelled = false
    getFollowingIds()
      .then((ids) => !cancelled && setFollowing(ids.includes(stream.hostId)))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [currentUser, isSelfHost, stream.hostId])

  async function handleToggleFollow() {
    if (!currentUser || isSelfHost || followPending) return
    const next = !following
    setFollowing(next)
    setFollowPending(true)
    try {
      await toggleFollow({ targetUserId: stream.hostId, follow: next })
    } catch {
      setFollowing(!next)
    } finally {
      setFollowPending(false)
    }
  }

  // Live duration clock, ticking from when this viewer connected.
  const [elapsed, setElapsed] = useState(0)
  const startedAtRef = useRef<number | null>(null)

  // Call-in state, polled from the server.
  const [myStatus, setMyStatus] = useState<CallRequestView["status"] | null>(null)
  const [myInvite, setMyInvite] = useState<CallRequestView | null>(null)
  const [declinedFlash, setDeclinedFlash] = useState(false)
  const [locked, setLocked] = useState<boolean>(stream.locked ?? false)
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

  // Keep the app-level mini-player's "now playing" info in sync.
  useEffect(() => {
    onMeta?.({ title: stream.title, cover: stream.cover ?? null, live: true, subtitle: `with ${stream.hostName}` })
  }, [stream.title, stream.cover, stream.hostName, onMeta])

  // Guard against an accidental refresh / tab close while connected to the
  // room — it would drop the listener out of the live session unexpectedly.
  useEffect(() => {
    if (!state.connected) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
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
        setTimeout(() => (onExit ? onExit() : router.push("/live")), 2600)
        return
      }
      setMyInvite(s.myInvite)
      setLocked(s.locked)
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

  const shareTarget: ShareTarget = {
    type: "live",
    key: stream.roomName,
    title: stream.title,
    subtitle: `Join ${stream.hostName} live on Frequency`,
    url: `/live/${stream.roomName}`,
    image: stream.cover ?? null,
    downloadUrl: null,
    downloadKind: null,
  }

  // Audience count excludes the host + guests on stage.
  const onStage = 1 + speakers.filter((s) => s.identity !== stream.hostId).length
  const audience = Math.max(0, state.listeners - onStage)

  const isOnStage = state.canPublish && state.connected
  const colorById: Record<string, string> = {}
  for (const s of speakers) colorById[s.identity] = getAvatarColor(s.identity)

  if (hostEnded) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-950 px-6 py-14 text-center text-white">
        <span className="flex size-14 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-inset ring-white/15">
          <Radio className="size-7" strokeWidth={2.5} />
        </span>
        <p className="text-lg font-bold">Session Ended</p>
        <p className="text-sm text-white/60">The host has ended this live session. Taking you back to Live…</p>
        <Loader2 className="size-4 animate-spin text-white/60" />
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-zinc-950 text-white">
      {/* Drifting aurora backdrop tinted from the cover art for an immersive room. */}
      <div
        aria-hidden="true"
        className="stage-aurora pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(70% 55% at 20% 0%, color-mix(in oklch, var(--primary) 45%, transparent), transparent 60%), radial-gradient(60% 50% at 90% 20%, color-mix(in oklch, var(--call-accept) 30%, transparent), transparent 55%), radial-gradient(80% 60% at 50% 100%, color-mix(in oklch, var(--primary) 25%, transparent), transparent 60%)",
        }}
      />
      {stream.cover && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={stream.cover || "/placeholder.svg"}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full object-cover opacity-15 blur-3xl"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/40 to-zinc-950/85" />
        </>
      )}

      {/* ───────── Broadcast header: cover art + live + title + stats ───────── */}
      <header className="relative z-30 flex items-center gap-3 border-b border-white/10 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1rem)] backdrop-blur-xl">
        {/* Back control — opens Leave / Minimise while connected. */}
        <BackExitMenu
          showMenu={state.connected}
          exitLabel="Leave"
          onExit={() => {
            void disconnect()
            if (onExit) onExit()
            else router.push("/live")
          }}
          onMinimize={onMinimize ?? (() => {})}
        />
        <CoverArt src={stream.cover ?? null} alt={`${stream.title} cover art`} />

        <div className="relative min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <LiveBadge />
            {state.connected && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-white/60">
                <QualityIcon quality={state.connectionQuality} />
                <span className="capitalize">{state.connectionQuality !== "unknown" ? state.connectionQuality : ""}</span>
              </span>
            )}
          </div>
          <h1 className="mt-0.5 truncate text-base font-bold leading-tight tracking-tight text-white">{stream.title}</h1>
          <p className="truncate text-xs font-medium text-white/70">with {stream.hostName}</p>
        </div>

        <div className="relative flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => setShowAudience((s) => !s)}
            aria-label="See who's listening"
            aria-pressed={showAudience}
            className={cn(
              "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
              showAudience
                ? "bg-primary/20 text-primary ring-primary/30"
                : "bg-white/10 text-white/80 ring-white/10 hover:bg-white/20",
            )}
          >
            <Users className="size-3" /> {audience.toLocaleString()}
          </button>
          {state.connected && (
            <span className="font-mono text-[11px] tabular-nums text-white/50">{formatElapsed(elapsed)}</span>
          )}
        </div>
      </header>

      {/* ───────────────────────── Speaker stage ───────────────────────── */}
      <div className="relative flex shrink-0 flex-col gap-3 px-4 py-3 sm:px-6 sm:py-3.5">
        {/* Floating reactions drift up over the stage. */}
        <ReactionLayer roomName={state.connected ? stream.roomName : undefined} />

        <div className="relative">
          <LiveStage
            host={{ id: stream.hostId, name: stream.hostName, color: getAvatarColor(stream.hostId) }}
            speakers={speakers}
            activeSpeakers={state.activeSpeakers}
            hostColorById={colorById}
            isHost={false}
            canRequestCall={canListen && !isOnStage && !locked && myStatus !== "pending"}
            callPending={myStatus === "pending"}
            hostFollow={{
              isFollowing: following,
              canFollow: Boolean(currentUser) && !isSelfHost,
              pending: followPending,
              onToggle: () => void handleToggleFollow(),
            }}
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
          <div className="relative flex w-full items-center justify-between gap-3 rounded-xl border border-live/40 bg-live/10 px-3 py-2.5 backdrop-blur-md">
            <p className="text-sm font-medium text-pretty text-white">The host invited you to join as a guest.</p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={acceptInvite}
                className="flex items-center gap-1 rounded-full bg-live px-3 py-1.5 text-xs font-semibold text-background"
              >
                <Check className="size-3.5" /> Join
              </button>
              <button
                onClick={declineInvite}
                className="flex size-7 items-center justify-center rounded-full bg-white/10 text-white/70 ring-1 ring-inset ring-white/10"
                aria-label="Decline invite"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        )}

        {declinedFlash && (
          <p className="relative mx-auto rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/70 ring-1 ring-inset ring-white/10 backdrop-blur-md">
            The host declined your request to join.
          </p>
        )}

        {/* Audience section — revealed via the header pill (see who's listening). */}
        {showAudience && <LiveAudience count={audience} glass className="relative" />}
      </div>

      {/* ─────────────────────────── Guest dock ──────��──────────────────── */}
      <div className="relative shrink-0 border-t border-white/10 px-4 py-2 pl-safe pr-safe backdrop-blur-xl">
        {!canListen ? (
          <p className="text-sm text-white/70">
            <Link href="/sign-in" className="font-medium text-primary hover:underline">
              Sign in
            </Link>{" "}
            to listen to this live stream.
          </p>
        ) : ended ? (
          <p className="text-sm text-white/70">{error ?? "This stream has ended."}</p>
        ) : state.connecting || joining ? (
          <div className="flex items-center gap-2 text-sm text-white/70">
            <Loader2 className="size-4 animate-spin" /> Connecting to the live audio…
          </div>
        ) : !state.connected ? (
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => void join()}
              className="flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:opacity-95 active:scale-[0.98]"
            >
              <Play className="size-4 translate-x-0.5" strokeWidth={2.75} /> Join the room
            </button>
            <DockButton label="Share room" onClick={() => setShareOpen(true)}>
              <Send className="size-5" />
            </DockButton>
          </div>
        ) : (
          // One compact, centered control row (no edge-pinned buttons).
          <div className="flex items-center justify-center gap-2 sm:gap-3">
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
              </>
            )}

            <DockButton label="Share room" onClick={() => setShareOpen(true)}>
              <Send className="size-5" />
            </DockButton>

            {/* Request-to-speak affordance for listeners. */}
            {!isOnStage &&
              (myStatus === "pending" ? (
                <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white/70 ring-1 ring-inset ring-white/10">
                  <Mic className="size-4 animate-pulse" /> Waiting…
                </span>
              ) : locked ? (
                <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white/60 ring-1 ring-inset ring-white/10">
                  <Lock className="size-4" /> Locked
                </span>
              ) : (
                <button
                  onClick={handleRequestCall}
                  className="flex items-center gap-1.5 rounded-full bg-call-accept px-4 py-2.5 text-xs font-bold text-call-accept-foreground shadow-lg shadow-call-accept/30 transition-all hover:opacity-95 active:scale-95"
                >
                  <Mic className="size-4" strokeWidth={2.75} /> Speak
                </button>
              ))}
          </div>
        )}
        {error && !ended && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>

      {/* Live chat — always-on, inline below the dock so no extra tap is needed. */}
      <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden border-t border-white/10 pb-safe">
        <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-2.5">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white/70">
            <MessageSquare className="size-3.5 text-primary" strokeWidth={2.5} /> Live chat
          </h2>
        </div>
        <div className="min-h-0 flex-1">
          <LiveChat
            immersive
            currentUser={currentUser}
            roomName={stream.roomName}
            bgUrl={stream.chatBgUrl ?? null}
            bgEffect={stream.chatBgEffect ?? "none"}
          />
        </div>
      </section>

      <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  )
}
