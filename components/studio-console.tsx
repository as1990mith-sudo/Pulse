"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import {
  Check,
  CheckCircle2,
  Copy,
  ImageIcon,
  Loader2,
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
  setChatBackground,
  type CallRequestView,
  type ChatBgEffect,
} from "@/app/actions/live"
import { useLiveAudio } from "@/lib/use-live-audio"
import { uploadMedia } from "@/lib/upload-media"
import { LiveChat } from "@/components/live-chat"
import { LiveStage } from "@/components/live-stage"
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
  const [endedSession, setEndedSession] = useState<EndedSession>(null)
  const [roomName, setRoomName] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Which slide-up panel is open (music / listeners / background). Only one at a
  // time keeps the studio compact and free of scroll.
  const [panel, setPanel] = useState<null | "music" | "people" | "background">(null)

  const viewers = Math.max(0, state.listeners - 1 - speakers.filter((s) => !s.isLocal).length)

  // Host polls the call state to surface pending guest requests.
  const { data: callState, mutate: refreshCalls } = useSWR(
    live && roomName ? ["call-state", roomName] : null,
    () => getCallState({ roomName: roomName! }),
    { refreshInterval: 2500 },
  )
  const pending = callState?.pendingRequests ?? []

  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [live])

  async function toggleLive() {
    setError(null)
    if (live) {
      const duration = formatDuration(elapsed)
      const audioBlob = await stopRecording().catch(() => null)
      if (roomName) await endBroadcast({ roomName }).catch(() => {})
      await disconnect()
      setRoomName(null)
      setPanel(null)
      setEndedSession({ title, duration, audioBlob })
      setElapsed(0)
    } else {
      setStarting(true)
      const res = await startBroadcast({ title })
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
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-3 px-3 py-3 sm:px-4">
      {/* Room header: title + host, always visible */}
      <header className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
              currentUser.color,
            )}
          >
            {currentUser.initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{title || "Untitled session"}</p>
            <p className="truncate text-xs text-muted-foreground">{currentUser.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
              live ? "bg-live text-live-foreground" : "bg-secondary text-muted-foreground",
            )}
          >
            <span className={cn("size-1.5 rounded-full", live ? "bg-live-foreground animate-live-pulse" : "bg-muted-foreground")} />
            {live ? formatTime(elapsed) : "Offline"}
          </span>
          <Button onClick={toggleLive} size="sm" variant={live ? "secondary" : "default"} className="gap-1.5" disabled={starting || state.connecting}>
            {starting || state.connecting ? <Loader2 className="size-4 animate-spin" /> : <Radio className="size-4" />}
            {live ? "End" : starting || state.connecting ? "…" : "Go live"}
          </Button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Stage: host + 3 guests, always visible (no scroll) */}
      <div className="rounded-xl border border-border/60 bg-gradient-to-b from-secondary/60 to-card p-3">
        <LiveStage
          host={{ id: currentUser.id, name: currentUser.name, color: currentUser.color }}
          speakers={speakers}
          activeSpeakers={state.activeSpeakers}
          isHost
          onRemoveGuest={dropGuest}
        />
      </div>

      {/* Control bar: mic + tool icons, always visible */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => toggleMic()}
          disabled={!live}
          className={cn(
            "flex size-11 items-center justify-center rounded-full transition-colors disabled:opacity-50",
            micOn ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
          )}
          aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
        >
          {micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
        </button>

        <ToolButton
          icon={<Users className="size-5" />}
          label="People"
          badge={pending.length}
          active={panel === "people"}
          disabled={!live}
          onClick={() => setPanel((p) => (p === "people" ? null : "people"))}
        />
        <ToolButton
          icon={<Music className="size-5" />}
          label="Music"
          active={panel === "music"}
          disabled={!live}
          onClick={() => setPanel((p) => (p === "music" ? null : "music"))}
        />
        <ToolButton
          icon={<ImageIcon className="size-5" />}
          label="Background"
          active={panel === "background"}
          disabled={!live}
          onClick={() => setPanel((p) => (p === "background" ? null : "background"))}
        />
        {live && roomName && <ShareButton roomName={roomName} />}
      </div>

      {/* Chat: the ONLY scrollable region */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="border-b border-border/60 px-4 py-2">
          <h2 className="text-sm font-semibold">Live chat</h2>
        </div>
        <div className="min-h-0 flex-1">
          <LiveChat asHost currentUser={currentUser} roomName={roomName ?? undefined} />
        </div>
      </div>

      {/* Slide-up panels (overlay, don't push layout) */}
      {panel === "people" && (
        <PeoplePanel
          roomName={roomName}
          pending={pending}
          guests={callState?.guests ?? []}
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
      {panel === "background" && roomName && (
        <BackgroundPanel roomName={roomName} onClose={() => setPanel(null)} />
      )}

      {endedSession && <PublishOverlay session={endedSession} onClose={() => setEndedSession(null)} />}
    </div>
  )
}

function ToolButton({
  icon,
  label,
  badge = 0,
  active,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  badge?: number
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "relative flex size-11 items-center justify-center rounded-full transition-colors disabled:opacity-50",
        active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80",
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

function ShareButton({ roomName }: { roomName: string }) {
  const [copied, setCopied] = useState(false)
  const url = typeof window !== "undefined" ? `${window.location.origin}/live/${roomName}` : `/live/${roomName}`
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }
  return (
    <button
      onClick={copy}
      aria-label="Share session link"
      className="flex size-11 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/80"
    >
      {copied ? <Check className="size-5" /> : <Share2 className="size-5" />}
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
    <Sheet title="People" onClose={onClose}>
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
                    <Button size="sm" className="h-8 gap-1" onClick={() => onAccept(r.id)}>
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

        {/* Now playing + scrubber */}
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

            {/* Scrub bar */}
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

            {/* Volume */}
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

        {/* Playlist */}
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

/** Host-controlled chat background: upload an image and choose blur/dim. */
function BackgroundPanel({ roomName, onClose }: { roomName: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [effect, setEffect] = useState<ChatBgEffect>("none")
  const [saving, startSave] = useTransition()

  function apply(nextUrl: string | null, nextEffect: ChatBgEffect) {
    setUrl(nextUrl)
    setEffect(nextEffect)
    startSave(async () => {
      await setChatBackground({ roomName, url: nextUrl, effect: nextEffect })
    })
  }

  return (
    <Sheet title="Chat background" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Upload an image to sit behind the chat for everyone in the room. Blur or dim it so messages stay readable.
        </p>
        <CoverUpload value={url} onChange={(v) => apply(v, effect)} label="Background image" />
        <div className="grid grid-cols-3 gap-2">
          {(["none", "blur", "dim"] as ChatBgEffect[]).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => apply(url, opt)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm capitalize transition-colors",
                effect === opt ? "border-primary bg-primary/10 text-primary" : "border-border/60 hover:bg-secondary",
              )}
            >
              {opt}
            </button>
          ))}
        </div>
        {url && (
          <Button type="button" variant="ghost" className="w-full gap-2 text-destructive" onClick={() => apply(null, "none")}>
            <Trash2 className="size-4" /> Remove background
          </Button>
        )}
        {saving && <p className="text-xs text-muted-foreground">Saving…</p>}
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
  const [tagline, setTagline] = useState("")
  const [category, setCategory] = useState("")
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
      const res = await publishShow({ title, tagline, category, duration: session.duration, description, cover, audioUrl })
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
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" aria-label="Category" />
            <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Tagline (optional)" aria-label="Tagline" />
          </div>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was this session about?" className="min-h-20" aria-label="Description" />
          <CoverUpload value={cover} onChange={setCover} label="Cover image (optional)" />
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
