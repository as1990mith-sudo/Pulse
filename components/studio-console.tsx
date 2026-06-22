"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import {
  Check,
  CheckCircle2,
  Circle,
  Disc3,
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
  X,
} from "lucide-react"
import type { CurrentUser } from "@/lib/session"
import { publishShow } from "@/app/actions/shows"
import {
  startBroadcast,
  endBroadcast,
  getCallState,
  respondToCallRequest,
  removeFromStage,
  type CallRequestView,
} from "@/app/actions/live"
import { useLiveAudio } from "@/lib/use-live-audio"
import { uploadMedia } from "@/lib/upload-media"
import { LiveChat } from "@/components/live-chat"
import { LiveStage, MAX_GUESTS } from "@/components/live-stage"
import { ReactionLayer } from "@/components/live-reactions"
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

export function StudioConsole({ currentUser }: { currentUser: CurrentUser }) {
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
  const live = state.connected
  const micOn = state.micEnabled
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

  async function toggleLive() {
    setError(null)
    if (live) {
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
      setRoomName(res.roomName)
      setEndedSession(null)
      setElapsed(0)
      await connect({ serverUrl: res.serverUrl, token: res.token, publish: true })
      startRecording()
      setRecording(true)
    }
  }

  async function toggleRecording() {
    if (!live) return
    if (recording) {
      const blob = await stopRecording().catch(() => null)
      if (blob) recordedBlobRef.current = blob
      setRecording(false)
    } else {
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
      {/* Drifting aurora backdrop — the same immersive skin as the listener view. */}
      <div
        aria-hidden="true"
        className="stage-aurora pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(70% 55% at 20% 0%, color-mix(in oklch, var(--primary) 45%, transparent), transparent 60%), radial-gradient(60% 50% at 90% 20%, color-mix(in oklch, var(--call-accept) 30%, transparent), transparent 55%), radial-gradient(80% 60% at 50% 100%, color-mix(in oklch, var(--primary) 25%, transparent), transparent 60%)",
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

      <div className="relative mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-3 px-3 py-3 sm:px-4">
        {/* Broadcast header: cover artwork + live indicator + title + stats */}
        <header className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/15 sm:size-20">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover || "/placeholder.svg"} alt="Session cover art" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-white/60">
                <Radio className="size-6" />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                  live ? "bg-live text-live-foreground" : "bg-white/10 text-white/60",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    live ? "bg-live-foreground animate-live-pulse" : "bg-white/40",
                  )}
                />
                {live ? "Live" : "Offline"}
              </span>
              {live && (
                <span className="font-mono text-xs tabular-nums text-white/50">{formatTime(elapsed)}</span>
              )}
            </div>

            {live ? (
              <p className="truncate text-sm font-semibold leading-tight text-white sm:text-base">{title || "Untitled session"}</p>
            ) : (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Name your session…"
                aria-label="Session title"
                maxLength={80}
                className="w-full truncate rounded-md border border-transparent bg-transparent text-sm font-semibold leading-tight text-white outline-none transition-colors placeholder:text-white/40 hover:border-white/20 focus:border-primary focus:bg-white/10 focus:px-2 focus:py-1 sm:text-base"
              />
            )}
            <div className="mt-0.5 flex items-center gap-2 text-xs text-white/60">
              <span className="truncate">{currentUser.name}</span>
              {live && (
                <button
                  type="button"
                  onClick={() => setPanel("people")}
                  aria-label="See listeners and manage the stage"
                  className="flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Users className="size-3" /> {viewers.toLocaleString()}
                </button>
              )}
            </div>
          </div>

          <Button
            onClick={toggleLive}
            size="sm"
            variant={live ? "secondary" : "default"}
            className="shrink-0 gap-1.5"
            disabled={starting || state.connecting}
          >
            {starting || state.connecting ? <Loader2 className="size-4 animate-spin" /> : <Radio className="size-4" />}
            {live ? "End" : starting || state.connecting ? "…" : "Go live"}
          </Button>
        </header>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
            {error}
          </div>
        )}

        {/* Pre-live: pick cover art */}
        {!live && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl">
            <CoverUpload value={cover} onChange={setCover} label="Cover artwork (optional)" />
          </div>
        )}

        {/* Speaker stage — unified 4-col × 2-row grid (host first, then guests) */}
        <div className="relative shrink-0">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-white/60">On stage</h2>
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
            host={{ id: currentUser.id, name: currentUser.name, color: currentUser.color }}
            speakers={speakers}
            activeSpeakers={state.activeSpeakers}
            hostQuality={state.connectionQuality}
            isHost
            onRemoveGuest={dropGuest}
          />
          {live && roomName && <ReactionLayer roomName={roomName} />}
        </div>

        {/* Host control dock — compact essentials, sits right under the stage row */}
        <div className="shrink-0 rounded-2xl border border-white/10 bg-white/5 p-2 shadow-lg backdrop-blur-xl">
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            <DockButton
              icon={micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
              label={micOn ? "Mute mic" : "Unmute mic"}
              primary={micOn}
              disabled={!live}
              onClick={() => toggleMic()}
            />
            <DockButton
              icon={<Music className="size-5" />}
              label="Background music"
              active={panel === "music"}
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
            <DockButton
              icon={recording ? <Disc3 className="size-5 animate-spin [animation-duration:3s]" /> : <Circle className="size-5" />}
              label={recording ? "Stop recording" : "Start recording"}
              recording={recording}
              disabled={!live}
              onClick={toggleRecording}
            />
            {live && roomName && <ShareButton roomName={roomName} title={title} />}
          </div>
        </div>

        {/* Live chat — flows as one with the room, filling all remaining space */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden pb-safe">
          <div className="mb-2 flex shrink-0 items-center justify-between px-1">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/60">
              <MessageSquare className="size-3.5 text-primary" /> Live chat
            </h2>
            <span className="text-[11px] text-white/40">
              {guests.length}/{MAX_GUESTS} on stage
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
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
          onPublish={publishMusic}
          onVolume={setMusicVolume}
          onPlayingChange={setMusicPlaying}
          onSeek={seekMusic}
          onStop={stopMusic}
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
        "relative flex size-11 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-white/10 backdrop-blur-md transition-all hover:scale-105 active:scale-95 disabled:opacity-40",
        recording
          ? "bg-live text-live-foreground ring-transparent"
          : primary
            ? "bg-call-accept text-call-accept-foreground ring-transparent"
            : active
              ? "bg-primary text-primary-foreground ring-transparent"
              : "bg-white/10 text-white hover:bg-white/20",
      )}
    >
      {icon}
      {badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-live text-[10px] font-bold text-live-foreground">
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
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-inset ring-white/10 backdrop-blur-md transition-all hover:scale-105 hover:bg-white/20 active:scale-95"
    >
      {copied ? <Check className="size-5" /> : <UserPlus className="size-5" />}
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

/** Background music: multi-track playlist with volume + scrub controls. */
function MusicPanel({
  live,
  position,
  duration,
  onPublish,
  onVolume,
  onPlayingChange,
  onSeek,
  onStop,
  onClose,
}: {
  live: boolean
  position: number
  duration: number
  onPublish: (url: string) => Promise<void>
  onVolume: (value: number) => void
  onPlayingChange: (playing: boolean) => void
  onSeek: (seconds: number) => void
  onStop: () => Promise<void>
  onClose: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(0.4)
  const [uploading, setUploading] = useState(false)
  const [mixing, setMixing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    onVolume(volume)
  }, [volume, onVolume])

  useEffect(() => {
    if (!live && playing) {
      setPlaying(false)
      void onStop()
    }
  }, [live, playing, onStop])

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      for (const file of files) {
        if (!file.type.startsWith("audio/")) continue
        const data = await uploadMedia(file, "live-music")
        setTracks((t) => [...t, { url: data.url, name: data.name ?? file.name }])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function playTrack(index: number) {
    setError(null)
    setMixing(true)
    try {
      await onPublish(tracks[index].url)
      onVolume(volume)
      setActiveIndex(index)
      setPlaying(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mix the track in.")
    } finally {
      setMixing(false)
    }
  }

  function togglePlay() {
    if (activeIndex === null) return
    if (playing) {
      onPlayingChange(false)
      setPlaying(false)
    } else {
      onPlayingChange(true)
      setPlaying(true)
    }
  }

  return (
    <Sheet title="Background music" onClose={onClose}>
      <div className="space-y-3">
        <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={handlePick} />

        {activeIndex !== null && (
          <div className="space-y-2 rounded-lg border border-border/60 bg-background p-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                disabled={!live || mixing}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
                aria-label={playing ? "Pause" : "Play"}
              >
                {mixing ? <Loader2 className="size-4 animate-spin" /> : playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-0.5" />}
              </button>
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{tracks[activeIndex]?.name}</p>
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onSeek(Math.max(0, position - 15))} aria-label="Back 15s">
                <SkipBack className="size-4 text-muted-foreground" />
              </button>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={1}
                value={Math.min(position, duration || 0)}
                onChange={(e) => onSeek(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-primary"
                aria-label="Seek background music"
              />
              <button type="button" onClick={() => onSeek(position + 15)} aria-label="Forward 15s">
                <SkipForward className="size-4 text-muted-foreground" />
              </button>
            </div>
            <div className="flex justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
              <span>{formatTime(position)}</span>
              <span>{formatTime(duration || 0)}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Vol</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-primary"
                aria-label="Music volume"
              />
              <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{Math.round(volume * 100)}%</span>
            </div>
          </div>
        )}

        <ul className="space-y-1.5">
          {tracks.map((t, i) => (
            <li key={t.url} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-2">
              <button
                type="button"
                onClick={() => playTrack(i)}
                disabled={!live || mixing}
                className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-50"
              >
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", activeIndex === i ? "bg-primary text-primary-foreground" : "bg-secondary")}>
                  <Play className="size-3.5 translate-x-px" />
                </span>
                <span className="truncate text-sm">{t.name}</span>
              </button>
              <button
                type="button"
                onClick={() => setTracks((arr) => arr.filter((_, idx) => idx !== i))}
                aria-label={`Remove ${t.name}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>

        <Button type="button" variant="secondary" className="w-full gap-2" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {uploading ? "Uploading…" : "Add tracks"}
        </Button>
        {!live && <p className="text-xs text-muted-foreground">Go live to mix music into your broadcast.</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Sheet>
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
