"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  Mic,
  MicOff,
  Music,
  Pause,
  Play,
  Radio,
  Share2,
  Upload,
  Users,
  X,
} from "lucide-react"
import type { CurrentUser } from "@/lib/session"
import { publishShow } from "@/app/actions/shows"
import { startBroadcast, endBroadcast } from "@/app/actions/live"
import { useLiveAudio } from "@/lib/use-live-audio"
import { uploadMedia } from "@/lib/upload-media"
import { LiveChat } from "@/components/live-chat"
import { CoverUpload } from "@/components/admin/cover-upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
}

function formatDuration(s: number) {
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${(m % 60).toString().padStart(2, "0")}m`
}

function StudioWaveform({ active }: { active: boolean }) {
  const bars = Array.from({ length: 28 }, (_, i) => i)
  return (
    <div className="flex h-12 items-end justify-center gap-1" aria-hidden="true">
      {bars.map((i) => (
        <span
          key={i}
          className={cn("w-1.5 rounded-full bg-primary", active ? "animate-live-pulse" : "h-1.5 opacity-30")}
          style={
            active
              ? { height: `${20 + ((i * 41) % 80)}%`, animationDelay: `${(i % 7) * 0.1}s`, animationDuration: "0.9s" }
              : undefined
          }
        />
      ))}
    </div>
  )
}

type EndedSession = { title: string; duration: string; audioBlob: Blob | null } | null

export function StudioConsole({ currentUser }: { currentUser: CurrentUser }) {
  const {
    state,
    connect,
    disconnect,
    toggleMic,
    publishMusic,
    setMusicVolume,
    setMusicPlaying,
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

  // Listeners = participants in the room minus the host.
  const viewers = Math.max(0, state.listeners - 1)

  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [live])

  async function toggleLive() {
    setError(null)
    if (live) {
      // Ending the stream: stop recording, stop the broadcast, offer to publish.
      const duration = formatDuration(elapsed)
      const audioBlob = await stopRecording().catch(() => null)
      if (roomName) await endBroadcast({ roomName }).catch(() => {})
      await disconnect()
      setRoomName(null)
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
      // Capture the session so it can be published with playable audio.
      startRecording()
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Stage + controls */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
          <div className="flex items-center gap-4">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold",
                live ? "bg-live text-live-foreground" : "bg-secondary text-muted-foreground",
              )}
            >
              <span className={cn("size-2 rounded-full", live ? "bg-live-foreground animate-live-pulse" : "bg-muted-foreground")} />
              {live ? "On air" : "Offline"}
            </span>
            {live && <span className="font-mono text-sm tabular-nums text-muted-foreground">{formatTime(elapsed)}</span>}
            {live && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="size-4" /> {viewers.toLocaleString()}
              </span>
            )}
          </div>
          <Button onClick={toggleLive} variant={live ? "secondary" : "default"} className="gap-2" disabled={starting || state.connecting}>
            {starting || state.connecting ? <Loader2 className="size-4 animate-spin" /> : <Radio className="size-4" />}
            {live ? "End stream" : starting || state.connecting ? "Connecting…" : "Go live"}
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Audio stage */}
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-secondary to-background">
          <div className="flex flex-col items-center gap-5 px-6 py-10">
            <span
              className={cn(
                "flex size-28 items-center justify-center rounded-full text-3xl font-semibold",
                currentUser.color,
                live && micOn && "ring-4 ring-primary/40",
              )}
            >
              {currentUser.initials}
            </span>
            <StudioWaveform active={live && micOn} />
            <p className="text-sm text-muted-foreground">
              {live ? (micOn ? "Your mic is live" : "Your mic is muted") : "Audio stage — go live to start broadcasting"}
            </p>
          </div>

          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 p-1.5 backdrop-blur">
            <button
              onClick={() => toggleMic()}
              disabled={!live}
              className={cn(
                "flex size-10 items-center justify-center rounded-full transition-colors disabled:opacity-50",
                micOn ? "bg-secondary text-foreground hover:bg-secondary/80" : "bg-primary text-primary-foreground",
              )}
              aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
            >
              {micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
            </button>
          </div>
        </div>

        {/* Publish panel — shown after a stream ends */}
        {endedSession && <PublishPanel session={endedSession} onClose={() => setEndedSession(null)} />}

        {/* Background music */}
        <BackgroundMusicPanel
          live={live}
          onPublish={publishMusic}
          onVolume={setMusicVolume}
          onPlayingChange={setMusicPlaying}
          onStop={stopMusic}
        />

        {/* Show setup */}
        <div className="space-y-2 rounded-xl border border-border/60 bg-card p-4">
          <label htmlFor="show-title" className="text-sm font-medium">
            Stream title
          </label>
          <Input
            id="show-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={live}
            aria-describedby={live ? "title-locked" : undefined}
          />
          {live && (
            <p id="title-locked" className="text-xs text-muted-foreground">
              The title is locked while you&apos;re on air.
            </p>
          )}
          <div className="flex items-center gap-3 pt-1">
            <Avatar className="size-8">
              <AvatarFallback className={currentUser.color}>{currentUser.initials}</AvatarFallback>
            </Avatar>
            <span className="text-sm text-muted-foreground">
              Broadcasting as <span className="font-medium text-foreground">{currentUser.name}</span>
            </span>
          </div>
        </div>

        {/* Shareable session link — visible once live */}
        {live && roomName && <ShareLink roomName={roomName} />}
      </div>

      {/* Live chat */}
      <aside className="lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
        <div className="flex h-[560px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card lg:h-full">
          <div className="border-b border-border/60 px-4 py-3">
            <h2 className="text-sm font-semibold">Live chat</h2>
          </div>
          <div className="min-h-0 flex-1">
            <LiveChat asHost currentUser={currentUser} roomName={roomName ?? undefined} />
          </div>
        </div>
      </aside>
    </div>
  )
}

/** Read-only share box for the live session, with copy-to-clipboard. */
function ShareLink({ roomName }: { roomName: string }) {
  const [copied, setCopied] = useState(false)
  const url = typeof window !== "undefined" ? `${window.location.origin}/live/${roomName}` : `/live/${roomName}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard may be unavailable; the input is still selectable
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2">
        <Share2 className="size-4 text-primary" />
        <h2 className="text-sm font-medium">Share this session</h2>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Send this link so anyone can join and listen in real time.
      </p>
      <div className="flex items-center gap-2">
        <Input value={url} readOnly onFocus={(e) => e.currentTarget.select()} aria-label="Live session link" />
        <Button type="button" variant="secondary" className="shrink-0 gap-1.5" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  )
}

function BackgroundMusicPanel({
  live,
  onPublish,
  onVolume,
  onPlayingChange,
  onStop,
}: {
  live: boolean
  onPublish: (url: string) => Promise<void>
  onVolume: (value: number) => void
  onPlayingChange: (playing: boolean) => void
  onStop: () => Promise<void>
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [track, setTrack] = useState<{ url: string; name: string } | null>(null)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(0.4)
  const [uploading, setUploading] = useState(false)
  const [mixing, setMixing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep the live mix volume in sync with the slider.
  useEffect(() => {
    onVolume(volume)
  }, [volume, onVolume])

  // When the host goes off air, drop the mixed track.
  useEffect(() => {
    if (!live && playing) {
      setPlaying(false)
      void onStop()
    }
  }, [live, playing, onStop])

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    if (!file.type.startsWith("audio/")) {
      setError("Please choose an audio file")
      return
    }
    setUploading(true)
    try {
      const data = await uploadMedia(file, "live-music")
      setTrack({ url: data.url, name: data.name ?? file.name })
      setPlaying(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function togglePlay() {
    if (!track) return
    if (playing) {
      onPlayingChange(false)
      setPlaying(false)
      return
    }
    // First play: publish the track into the live broadcast; later toggles just resume.
    setError(null)
    setMixing(true)
    try {
      await onPublish(track.url)
      onVolume(volume)
      setPlaying(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mix the track into your stream.")
    } finally {
      setMixing(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2">
        <Music className="size-4 text-primary" />
        <h2 className="text-sm font-medium">Background music</h2>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Upload a backing track to play under your live audio — intro music, bed loops, or stings. Listeners hear it
        mixed in with your voice.
      </p>

      <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handlePick} />

      {track ? (
        <div className="space-y-3 rounded-lg border border-border/60 bg-background p-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              disabled={!live || mixing}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              aria-label={playing ? "Pause music" : "Play music"}
            >
              {mixing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : playing ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4 translate-x-0.5" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{track.name}</p>
              <p className="text-xs text-muted-foreground">
                {!live ? "Go live to mix in" : playing ? "Mixed into your live audio" : "Press play to mix in"}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={playing}>
              Replace
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer accent-primary"
              aria-label="Background music volume"
            />
            <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="w-full gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {uploading ? "Uploading…" : "Upload a track"}
        </Button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

function PublishPanel({
  session,
  onClose,
}: {
  session: { title: string; duration: string; audioBlob: Blob | null }
  onClose: () => void
}) {
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
      // Upload the recorded session audio first (best-effort) so the published
      // episode is playable on demand.
      let audioUrl: string | null = null
      if (session.audioBlob) {
        try {
          const ext = session.audioBlob.type.includes("mp4") ? "mp4" : "webm"
          const file = new File([session.audioBlob], `session.${ext}`, { type: session.audioBlob.type })
          const data = await uploadMedia(file, "episodes")
          audioUrl = data.url
        } catch {
          // Continue publishing without audio rather than failing the publish.
        }
      }

      const res = await publishShow({
        title,
        tagline,
        category,
        duration: session.duration,
        description,
        cover,
        audioUrl,
      })
      if (res.ok) {
        setPublished(true)
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  if (published) {
    return (
      <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-5 text-center">
        <CheckCircle2 className="mx-auto size-8 text-primary" />
        <p className="font-semibold">Session published to your catalogue</p>
        <p className="text-sm text-muted-foreground">Your followers and anyone visiting your profile can listen now.</p>
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Upload className="size-5 text-primary" />
          <div>
            <h2 className="font-semibold">Publish this session</h2>
            <p className="text-xs text-muted-foreground">
              Recorded {session.duration}.{" "}
              {session.audioBlob
                ? "The audio is attached so listeners can play it on demand."
                : "No audio was captured — it will publish as a show page."}
            </p>
          </div>
        </div>
        <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0" onClick={onClose} aria-label="Dismiss">
          <X className="size-4" />
        </Button>
      </div>

      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Episode title" aria-label="Episode title" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (e.g. Culture)" aria-label="Category" />
        <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Short tagline (optional)" aria-label="Tagline" />
      </div>
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What was this session about?"
        className="min-h-24"
        aria-label="Description"
      />
      <CoverUpload value={cover} onChange={setCover} label="Cover image (optional)" />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending} className="gap-2">
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Publish to my catalogue
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Not now
        </Button>
      </div>
    </form>
  )
}
