"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import {
  Check,
  CheckCircle2,
  Loader2,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  Music,
  Pause,
  Phone,
  PhoneOff,
  Play,
  Radio,
  Share2,
  SkipBack,
  SkipForward,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import type { CurrentUser } from "@/lib/session"
import { publishShow } from "@/app/actions/shows"
import {
  startBroadcast,
  endBroadcast,
  joinBroadcast,
  heartbeatBroadcast,
  getCallState,
  respondToCallRequest,
  removeFromStage,
  type CallRequestView,
} from "@/app/actions/live"
import { useLiveAudio } from "@/lib/use-live-audio"
import { uploadMedia } from "@/lib/upload-media"
import { LiveChat } from "@/components/live-chat"
import { LiveStage, MAX_GUESTS, QualityIcon } from "@/components/live-stage"
import { LiveBadge } from "@/components/live-badge"
import { ReactionLayer } from "@/components/live-reactions"
import { BackExitMenu } from "@/components/live-back-menu"
import { CoverUpload } from "@/components/admin/cover-upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
}

function formatDuration(s: number) {
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${(m % 60).toString().padStart(2, "0")}m`
}

type EndedSession = { title: string; duration: string; audioBlob: Blob | null } | null
type Track = { url: string; name: string }

export function StudioConsole({
  currentUser,
  onMinimize,
  onExit,
  onMeta,
}: {
  currentUser: CurrentUser
  onMinimize?: () => void
  onExit?: () => void
  onMeta?: (m: { title: string; cover: string | null; live: boolean; subtitle?: string }) => void
}) {
  const {
    state,
    speakers,
    connect,
    disconnect,
    toggleMic,
    publishMusic,
    setMusicVolume,
    setMusicPlaying,
    seekMusic,
    stopMusic,
    startRecording,
    stopRecording,
  } = useLiveAudio()
  // "On air" is an intent that persists across a dropped/recovering connection,
  // so a transient network blip never flips the host back to the offline setup
  // screen (which is what made it feel like the app "signed you out" of a live).
  // The actual transport status lives in state.connected / state.reconnecting.
  const [onAir, setOnAir] = useState(false)
  const live = onAir
  // True while we have the intent to broadcast but the transport isn't fully up.
  const reconnecting = onAir && (state.reconnecting || !state.connected)
  const micOn = state.micEnabled
  // Mirrors of values the disconnect-recovery callback needs without going stale.
  const onAirRef = useRef(false)
  const roomNameRef = useRef<string | null>(null)
  const recoverRef = useRef<() => void>(() => {})
  const [elapsed, setElapsed] = useState(0)
  const [title, setTitle] = useState(`${currentUser.name} — live session`)
  const [cover, setCover] = useState<string | null>(null)
  const [endedSession, setEndedSession] = useState<EndedSession>(null)
  const [roomName, setRoomName] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  // The most recent captured recording blob, kept when the host stops recording
  // mid-session so it can still be published when they go off air.
  const recordedBlobRef = useRef<Blob | null>(null)
  // Which slide-up panel is open. Only one at a time keeps the studio compact.
  const [panel, setPanel] = useState<null | "music" | "people">(null)

  // ── Background-music playlist (lifted here so it survives closing the music
  // panel and minimising the whole console — the audio engine itself lives in
  // the persistent useLiveAudio hook, so playback never stops on its own). ──
  const [musicTracks, setMusicTracks] = useState<Track[]>([])
  const [musicActiveIndex, setMusicActiveIndex] = useState<number | null>(null)
  const [musicPlaying, setMusicPlayingState] = useState(false)
  const [musicVolume, setMusicVolumeState] = useState(0.4)
  const [musicMixing, setMusicMixing] = useState(false)
  const [musicError, setMusicError] = useState<string | null>(null)

  // Mix a playlist track into the broadcast and mark it now-playing.
  async function playMusicTrack(index: number) {
    const track = musicTracks[index]
    if (!track) return
    setMusicError(null)
    setMusicMixing(true)
    try {
      await publishMusic(track.url)
      setMusicVolume(musicVolume)
      setMusicActiveIndex(index)
      setMusicPlayingState(true)
    } catch (err) {
      setMusicError(err instanceof Error ? err.message : "Could not mix the track in.")
    } finally {
      setMusicMixing(false)
    }
  }

  function toggleMusicPlay() {
    if (musicActiveIndex === null) return
    const next = !musicPlaying
    setMusicPlaying(next)
    setMusicPlayingState(next)
  }

  function changeMusicVolume(value: number) {
    setMusicVolumeState(value)
    setMusicVolume(value)
  }

  function removeMusicTrack(index: number) {
    setMusicTracks((arr) => arr.filter((_, i) => i !== index))
    setMusicActiveIndex((cur) => {
      if (cur === null) return cur
      if (index === cur) return null
      return index < cur ? cur - 1 : cur
    })
  }

  // If the host goes off air while music is mixed in, tear it down cleanly.
  useEffect(() => {
    if (!live && musicActiveIndex !== null) {
      setMusicActiveIndex(null)
      setMusicPlayingState(false)
      void stopMusic()
    }
  }, [live, musicActiveIndex, stopMusic])

  const viewers = Math.max(0, state.listeners - 1 - speakers.filter((s) => !s.isLocal).length)

  // Host polls the call state to surface pending guest requests.
  const { data: callState, mutate: refreshCalls } = useSWR(
    live && roomName ? ["call-state", roomName] : null,
    () => getCallState({ roomName: roomName! }),
    { refreshInterval: 2500 },
  )
  const pending = callState?.pendingRequests ?? []
  const guests = callState?.guests ?? []
  const locked = callState?.locked ?? false

  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [live])

  // Keep the app-level mini-player's "now playing" info in sync.
  useEffect(() => {
    onMeta?.({ title, cover, live, subtitle: live ? "You're live" : "Setting up" })
  }, [title, cover, live, onMeta])

  // Guard against an accidental refresh / tab close while broadcasting — it
  // would silently drop the live stream. The browser shows its native prompt.
  useEffect(() => {
    if (!live) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [live])

  // Keep the refs the recovery callback reads in sync with render state.
  useEffect(() => {
    onAirRef.current = onAir
  }, [onAir])
  useEffect(() => {
    roomNameRef.current = roomName
  }, [roomName])

  // Auto-recover from an unexpected hard disconnect: re-mint a token for the
  // same room and reconnect, so the host is never silently dropped from a live
  // they intended to keep running. If the stream has already ended server-side
  // (e.g. it was cleaned up after being abandoned), finalize gracefully.
  recoverRef.current = async () => {
    const rn = roomNameRef.current
    if (!onAirRef.current || !rn) return
    const res = await joinBroadcast({ roomName: rn }).catch(() => null)
    if (!res || !res.ok) {
      onAirRef.current = false
      setOnAir(false)
      setRoomName(null)
      setError("Your live session ended because the connection was lost.")
      return
    }
    await connect({
      serverUrl: res.serverUrl,
      token: res.token,
      publish: true,
      onDisconnected: () => recoverRef.current(),
    }).catch(() => {})
  }

  // Heartbeat: while on air, ping the server so the stream stays marked live.
  // If the server reports it already ended, stop locally to stay in sync.
  useEffect(() => {
    if (!live || !roomName) return
    let cancelled = false
    const ping = async () => {
      const res = await heartbeatBroadcast({ roomName }).catch(() => null)
      if (!cancelled && res?.ended) {
        onAirRef.current = false
        setOnAir(false)
        await disconnect().catch(() => {})
      }
    }
    void ping()
    const t = setInterval(ping, 20000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [live, roomName, disconnect])

  async function toggleLive() {
    setError(null)
    if (live) {
      // Clear the on-air intent first so the disconnect isn't treated as a drop
      // that should auto-recover.
      onAirRef.current = false
      setOnAir(false)
      const duration = formatDuration(elapsed)
      const audioBlob = recording ? await stopRecording().catch(() => null) : recordedBlobRef.current
      if (roomName) await endBroadcast({ roomName }).catch(() => {})
      await disconnect()
      setRoomName(null)
      setPanel(null)
      setRecording(false)
      recordedBlobRef.current = null
      setEndedSession({ title, duration, audioBlob })
      setElapsed(0)
    } else {
      setStarting(true)
      const res = await startBroadcast({ title, cover })
      setStarting(false)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onAirRef.current = true
      roomNameRef.current = res.roomName
      setOnAir(true)
      setRoomName(res.roomName)
      setEndedSession(null)
      setElapsed(0)
      await connect({
        serverUrl: res.serverUrl,
        token: res.token,
        publish: true,
        onDisconnected: () => recoverRef.current(),
      })
      startRecording()
      setRecording(true)
    }
  }

  async function acceptCall(id: number) {
    const res = await respondToCallRequest({ id, accept: true })
    if (!res.ok && res.error) setError(res.error)
    refreshCalls()
  }
  async function declineCall(id: number) {
    await respondToCallRequest({ id, accept: false })
    refreshCalls()
  }
  async function dropGuest(identity: string) {
    if (!roomName) return
    await removeFromStage({ roomName, userId: identity })
    refreshCalls()
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-950 text-white">
      {/* Deep vertical wash gives the immersive, full-bleed canvas its depth. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklch, var(--primary) 14%, #09090b) 0%, #09090b 42%, #050506 100%)",
        }}
      />
      {/* Drifting aurora backdrop — the same immersive skin as the listener view. */}
      <div
        aria-hidden="true"
        className="stage-aurora pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(75% 55% at 18% -5%, color-mix(in oklch, var(--primary) 55%, transparent), transparent 60%), radial-gradient(65% 50% at 95% 18%, color-mix(in oklch, var(--call-accept) 32%, transparent), transparent 55%), radial-gradient(90% 60% at 50% 108%, color-mix(in oklch, var(--primary) 30%, transparent), transparent 62%)",
        }}
      />
      {cover && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover || "/placeholder.svg"}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full object-cover opacity-15 blur-3xl"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/40 to-zinc-950/85" />
        </>
      )}

      <div className="relative flex min-h-0 w-full flex-1 flex-col">
        {/* Broadcast header: cover artwork + live indicator + title + stats */}
        <header className="relative z-30 flex items-center gap-3 border-b border-white/[0.07] px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6">
          <BackExitMenu
            showMenu={live}
            exitLabel="End"
            onExit={live ? toggleLive : (onExit ?? (() => {}))}
            onMinimize={onMinimize ?? (() => {})}
          />
          {/* Compact cover thumbnail — same footprint as the listener header. */}
          <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-white/10 shadow-xl ring-2 ring-white/30">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover || "/placeholder.svg"} alt="Session cover art" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-white/80">
                <Radio className="size-5" strokeWidth={2.75} />
              </span>
            )}
          </span>

          <div className="relative min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {live ? (
                <>
                  <LiveBadge />
                  {reconnecting ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-amber-300">
                      <Loader2 className="size-3 animate-spin" />
                      Reconnecting…
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-white/60">
                      <QualityIcon quality={state.connectionQuality} />
                      <span className="capitalize">
                        {state.connectionQuality !== "unknown" ? state.connectionQuality : ""}
                      </span>
                    </span>
                  )}
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white/60">
                  <span className="size-1.5 rounded-full bg-white/40" />
                  Offline
                </span>
              )}
            </div>

            {live ? (
              <h1 className="mt-0.5 truncate text-base font-bold leading-tight tracking-tight text-white">
                {title || "Untitled session"}
              </h1>
            ) : (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Name your session…"
                aria-label="Session title"
                maxLength={80}
                className="mt-0.5 w-full truncate rounded-md border border-transparent bg-transparent text-base font-bold leading-tight tracking-tight text-white outline-none transition-colors placeholder:text-white/40 hover:border-white/20 focus:border-primary focus:bg-white/10 focus:px-2 focus:py-1"
              />
            )}
            <p className="truncate text-xs font-medium text-white/70">{currentUser.name}</p>
          </div>

          {/* While live: a compact listener pill + timer (mirrors the listener
              header). While offline: the Go live action. */}
          {live ? (
            <div className="relative flex shrink-0 flex-col items-end gap-1">
              <button
                type="button"
                onClick={() => setPanel("people")}
                aria-label="See listeners and manage the stage"
                className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/20"
              >
                <Users className="size-3" /> {viewers.toLocaleString()}
              </button>
              <span className="font-mono text-[11px] tabular-nums text-white/50">{formatTime(elapsed)}</span>
            </div>
          ) : (
            <Button
              onClick={toggleLive}
              size="sm"
              variant="default"
              className="shrink-0 gap-1.5 rounded-full px-4 font-bold shadow-lg"
              disabled={starting || state.connecting}
            >
              {starting || state.connecting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Radio className="size-4" strokeWidth={2.75} />
              )}
              {starting || state.connecting ? "…" : "Go live"}
            </Button>
          )}
        </header>

        {error && (
          <div className="mx-4 mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground sm:mx-6">
            {error}
          </div>
        )}

        {/* Pre-live: pick cover art */}
        {!live && (
          <div className="border-b border-white/[0.07] px-4 py-4 sm:px-6">
            <CoverUpload value={cover} onChange={setCover} label="Cover artwork (optional)" />
          </div>
        )}

        {/* Speaker stage — unified 4-col × 2-row grid (host first, then guests) */}
        <div className="relative shrink-0 border-b border-white/[0.07] px-4 py-4 sm:px-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/70">On stage</h2>
            <div className="flex items-center gap-1.5">
              {locked && (
                <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/60">
                  <Lock className="size-3" /> Locked
                </span>
              )}
              {pending.length > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-live/20 px-2 py-0.5 text-[11px] font-semibold text-live">
                  <Phone className="size-3" /> {pending.length} waiting
                </span>
              )}
            </div>
          </div>
          <LiveStage
            host={{ id: currentUser.id, name: currentUser.name, color: currentUser.color, image: currentUser.image }}
            speakers={speakers}
            activeSpeakers={state.activeSpeakers}
            hostQuality={state.connectionQuality}
            isHost
            onRemoveGuest={dropGuest}
          />
          {live && roomName && <ReactionLayer roomName={roomName} />}
        </div>

        {/* Host control dock ��� compact essentials, sits right under the stage row */}
        <div className="shrink-0 border-b border-white/[0.07] px-4 py-4 sm:px-6">
          <div className="flex items-center justify-center gap-3 sm:gap-4">
            <DockButton
              icon={micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
              label={micOn ? "Mute mic" : "Unmute mic"}
              primary={micOn}
              disabled={!live}
              onClick={() => toggleMic()}
            />
            <DockButton
              icon={<Music className="size-5" />}
              label={musicPlaying ? "Background music (playing)" : "Background music"}
              active={panel === "music" || musicPlaying}
              disabled={!live}
              onClick={() => setPanel((p) => (p === "music" ? null : "music"))}
            />
            <DockButton
              icon={<Users className="size-5" />}
              label="Manage speakers & audience"
              badge={pending.length}
              active={panel === "people"}
              disabled={!live}
              onClick={() => setPanel((p) => (p === "people" ? null : "people"))}
            />
            {live && roomName && <ShareButton roomName={roomName} title={title} />}
          </div>
        </div>

        {/* Live chat — flows as one with the room, filling all remaining space */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden pb-safe">
          <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-4 sm:px-6">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/60">
              <MessageSquare className="size-3.5 text-primary" /> Live chat
            </h2>
            <span className="text-[11px] text-white/40">
              {guests.length}/{MAX_GUESTS} on stage
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <LiveChat asHost immersive currentUser={currentUser} roomName={roomName ?? undefined} />
          </div>
        </section>
      </div>

      {/* Slide-up panels */}
      {panel === "people" && (
        <PeoplePanel
          roomName={roomName}
          pending={pending}
          guests={guests}
          viewers={viewers}
          onAccept={acceptCall}
          onDecline={declineCall}
          onRemove={dropGuest}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "music" && (
        <MusicPanel
          live={live}
          position={state.musicPosition}
          duration={state.musicDuration}
          tracks={musicTracks}
          activeIndex={musicActiveIndex}
          playing={musicPlaying}
          volume={musicVolume}
          mixing={musicMixing}
          error={musicError}
          onAddTracks={(added) => setMusicTracks((t) => [...t, ...added])}
          onPlayTrack={playMusicTrack}
          onTogglePlay={toggleMusicPlay}
          onVolume={changeMusicVolume}
          onSeek={seekMusic}
          onRemoveTrack={removeMusicTrack}
          onError={setMusicError}
          onClose={() => setPanel(null)}
        />
      )}

      {endedSession && <PublishOverlay session={endedSession} onClose={() => setEndedSession(null)} />}
    </div>
  )
}

function DockButton({
  icon,
  label,
  badge = 0,
  active,
  primary,
  recording,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  badge?: number
  active?: boolean
  primary?: boolean
  recording?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "relative flex size-14 shrink-0 items-center justify-center rounded-full shadow-xl ring-1 ring-inset transition-all hover:scale-105 active:scale-95 disabled:opacity-40 [&>svg]:size-[26px] [&>svg]:[stroke-width:2.75]",
        recording
          ? "bg-live text-live-foreground shadow-live/40 ring-white/25"
          : primary
            ? "bg-call-accept text-call-accept-foreground shadow-call-accept/40 ring-white/25"
            : active
              ? "bg-primary text-primary-foreground shadow-primary/40 ring-white/25"
              : "bg-white/25 text-white ring-white/25 hover:bg-white/35",
      )}
    >
      {icon}
      {badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-live text-[10px] font-bold text-live-foreground ring-2 ring-zinc-950">
          {badge}
        </span>
      )}
    </button>
  )
}

/** Bottom sheet shell shared by all studio panels. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 max-h-[80dvh] w-full overflow-y-auto rounded-t-2xl border border-border/60 bg-card p-4 sm:max-w-md sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <Button type="button" size="icon" variant="ghost" className="size-8" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ShareButton({ roomName, title }: { roomName: string; title?: string }) {
  const [copied, setCopied] = useState(false)
  const url = typeof window !== "undefined" ? `${window.location.origin}/live/${roomName}` : `/live/${roomName}`
  async function share() {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: title || "Live on Frequency", text: "Join my live session on Frequency", url })
        return
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // user dismissed the share sheet — ignore
    }
  }
  return (
    <button
      onClick={share}
      aria-label="Invite people / share room link"
      title="Invite people"
      className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white/25 text-white shadow-xl ring-1 ring-inset ring-white/25 backdrop-blur-md transition-all hover:scale-105 hover:bg-white/35 active:scale-95 [&>svg]:size-[26px] [&>svg]:stroke-[2.75]"
    >
      {copied ? <Check /> : <UserPlus />}
    </button>
  )
}



/** People panel: pending call-in requests, current guests, listener invites. */
function PeoplePanel({
  roomName,
  pending,
  guests,
  viewers,
  onAccept,
  onDecline,
  onRemove,
  onClose,
}: {
  roomName: string | null
  pending: CallRequestView[]
  guests: CallRequestView[]
  viewers: number
  onAccept: (id: number) => void
  onDecline: (id: number) => void
  onRemove: (identity: string) => void
  onClose: () => void
}) {
  return (
    <Sheet title="Speakers & audience" onClose={onClose}>
      <div className="space-y-4">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="size-4" /> {viewers.toLocaleString()} listening
        </p>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Requests to join {pending.length > 0 && `(${pending.length})`}
          </h3>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending requests.</p>
          ) : (
            <ul className="space-y-2">
              {pending.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn("flex size-8 items-center justify-center rounded-full text-xs font-semibold", r.color)}>
                      {r.initials}
                    </span>
                    <span className="truncate text-sm">{r.userName}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" className="h-8 gap-1 bg-call-accept text-call-accept-foreground hover:bg-call-accept/90" onClick={() => onAccept(r.id)}>
                      <Phone className="size-3.5" /> Accept
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => onDecline(r.id)} aria-label="Decline">
                      <PhoneOff className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            On stage {guests.length > 0 && `(${guests.length}/3)`}
          </h3>
          {guests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No guests on stage yet.</p>
          ) : (
            <ul className="space-y-2">
              {guests.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn("flex size-8 items-center justify-center rounded-full text-xs font-semibold", g.color)}>
                      {g.initials}
                    </span>
                    <span className="truncate text-sm">{g.userName}</span>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => onRemove(g.userId)} disabled={!roomName}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Sheet>
  )
}

/** How many backing tracks the host can keep queued at once. */
const MAX_MUSIC_TRACKS = 4

/**
 * Background music: a premium multi-track playlist with a now-playing card
 * (scrubber + volume) and a queue. All playback state is owned by the parent
 * console (so it survives closing this panel / minimising the studio); this
 * component is fully controlled and only owns the transient upload spinner.
 */
function MusicPanel({
  live,
  position,
  duration,
  tracks,
  activeIndex,
  playing,
  volume,
  mixing,
  error,
  onAddTracks,
  onPlayTrack,
  onTogglePlay,
  onVolume,
  onSeek,
  onRemoveTrack,
  onError,
  onClose,
}: {
  live: boolean
  position: number
  duration: number
  tracks: Track[]
  activeIndex: number | null
  playing: boolean
  volume: number
  mixing: boolean
  error: string | null
  onAddTracks: (tracks: Track[]) => void
  onPlayTrack: (index: number) => void
  onTogglePlay: () => void
  onVolume: (value: number) => void
  onSeek: (seconds: number) => void
  onRemoveTrack: (index: number) => void
  onError: (message: string | null) => void
  onClose: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const activeTrack = activeIndex !== null ? tracks[activeIndex] : null
  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0
  const canAdd = tracks.length < MAX_MUSIC_TRACKS

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    onError(null)
    setUploading(true)
    try {
      const room = MAX_MUSIC_TRACKS - tracks.length
      const added: Track[] = []
      for (const file of files.slice(0, room)) {
        if (!file.type.startsWith("audio/")) continue
        const data = await uploadMedia(file, "live-music")
        added.push({ url: data.url, name: data.name ?? file.name })
      }
      if (added.length) onAddTracks(added)
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <Sheet title="Background music" onClose={onClose}>
      <div className="space-y-4">
        <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={handlePick} />

        {/* ── Now playing: premium control surface ── */}
        {activeTrack && (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-secondary/60 to-card p-4 shadow-lg">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "relative flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-inset ring-primary/20",
                  playing && "animate-pulse",
                )}
              >
                <Music className="size-6" strokeWidth={2.5} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Now playing</p>
                <p className="truncate text-sm font-semibold text-foreground">{activeTrack.name}</p>
              </div>
              <button
                type="button"
                onClick={onTogglePlay}
                disabled={!live || mixing}
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95 disabled:opacity-50"
                aria-label={playing ? "Pause" : "Play"}
              >
                {mixing ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : playing ? (
                  <Pause className="size-5" strokeWidth={2.5} />
                ) : (
                  <Play className="size-5 translate-x-0.5" strokeWidth={2.5} />
                )}
              </button>
            </div>

            {/* Scrubber */}
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSeek(Math.max(0, position - 15))}
                aria-label="Back 15 seconds"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <SkipBack className="size-4" strokeWidth={2.5} />
              </button>
              <div className="relative h-2 flex-1">
                <div className="absolute inset-0 rounded-full bg-muted" />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary"
                  style={{ width: `${progress}%` }}
                />
                <span
                  className="pointer-events-none absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-primary shadow ring-2 ring-card"
                  style={{ left: `calc(${progress}% - 7px)` }}
                />
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={1}
                  value={Math.min(position, duration || 0)}
                  onChange={(e) => onSeek(Number(e.target.value))}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  aria-label="Seek background music"
                />
              </div>
              <button
                type="button"
                onClick={() => onSeek(position + 15)}
                aria-label="Forward 15 seconds"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <SkipForward className="size-4" strokeWidth={2.5} />
              </button>
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
              <span>{formatTime(position)}</span>
              <span>{formatTime(duration || 0)}</span>
            </div>

            {/* Volume */}
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => onVolume(volume === 0 ? 0.4 : 0)}
                aria-label={volume === 0 ? "Unmute music" : "Mute music"}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {volume === 0 ? <VolumeX className="size-4" strokeWidth={2.5} /> : <Volume2 className="size-4" strokeWidth={2.5} />}
              </button>
              <div className="relative h-2 flex-1">
                <div className="absolute inset-0 rounded-full bg-muted" />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
                  style={{ width: `${volume * 100}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => onVolume(Number(e.target.value))}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  aria-label="Music volume"
                />
              </div>
              <span className="w-9 text-right text-xs font-medium tabular-nums text-muted-foreground">
                {Math.round(volume * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* ── Queue ── */}
        <div>
          <div className="mb-2 flex items-center justify-between px-0.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Playlist</h3>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {tracks.length}/{MAX_MUSIC_TRACKS}
            </span>
          </div>
          {tracks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
              Add up to {MAX_MUSIC_TRACKS} tracks to mix into your broadcast.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {tracks.map((t, i) => {
                const isActive = activeIndex === i
                return (
                  <li
                    key={t.url}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-xl border p-2 transition-colors",
                      isActive ? "border-primary/40 bg-primary/5" : "border-border/60",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onPlayTrack(i)}
                      disabled={!live || mixing}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:opacity-50"
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full",
                          isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
                        )}
                      >
                        {isActive && playing ? <EqBars /> : <Play className="size-3.5 translate-x-px" strokeWidth={2.5} />}
                      </span>
                      <span className={cn("truncate text-sm", isActive ? "font-semibold text-foreground" : "text-foreground/90")}>
                        {t.name}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveTrack(i)}
                      aria-label={`Remove ${t.name}`}
                      className="shrink-0 p-1 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <Button
          type="button"
          variant="secondary"
          className="w-full gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !canAdd}
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {uploading ? "Uploading…" : canAdd ? "Add tracks" : "Playlist full"}
        </Button>
        {!live && <p className="text-xs text-muted-foreground">Go live to mix music into your broadcast.</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Sheet>
  )
}

/** Tiny three-bar equalizer shown on the currently playing queue item. */
function EqBars() {
  return (
    <span className="flex h-3.5 items-end gap-0.5" aria-hidden>
      <span className="h-full w-0.5 origin-bottom animate-eq-bounce rounded-full bg-current [animation-delay:-0.2s]" />
      <span className="h-full w-0.5 origin-bottom animate-eq-bounce rounded-full bg-current" />
      <span className="h-full w-0.5 origin-bottom animate-eq-bounce rounded-full bg-current [animation-delay:-0.4s]" />
    </span>
  )
}

/** Full-screen overlay to publish the recorded session after going off air. */
function PublishOverlay({ session, onClose }: { session: { title: string; duration: string; audioBlob: Blob | null }; onClose: () => void }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [published, setPublished] = useState(false)

  const [title, setTitle] = useState(session.title)
  const [description, setDescription] = useState("")
  const [cover, setCover] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      let audioUrl: string | null = null
      if (session.audioBlob) {
        try {
          const ext = session.audioBlob.type.includes("mp4") ? "mp4" : "webm"
          const file = new File([session.audioBlob], `session.${ext}`, { type: session.audioBlob.type })
          const data = await uploadMedia(file, "episodes")
          audioUrl = data.url
        } catch {
          // publish without audio rather than failing
        }
      }
      const res = await publishShow({ title, tagline: "", category: "", duration: session.duration, description, cover, audioUrl })
      if (res.ok) {
        setPublished(true)
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <Sheet title={published ? "Published" : "Publish this session"} onClose={onClose}>
      {published ? (
        <div className="space-y-3 py-4 text-center">
          <CheckCircle2 className="mx-auto size-8 text-primary" />
          <p className="font-semibold">Session published to your catalogue</p>
          <p className="text-sm text-muted-foreground">Anyone visiting your profile can listen now.</p>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Recorded {session.duration}.{" "}
            {session.audioBlob ? "Audio attached for on-demand playback." : "No audio captured — publishes as a show page."}
          </p>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Episode title" aria-label="Episode title" />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was this session about?" className="min-h-20" aria-label="Description" />
          <CoverUpload value={cover} onChange={setCover} label="Cover art" />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Publish
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Not now
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  )
}
