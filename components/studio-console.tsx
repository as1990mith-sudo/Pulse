"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  Loader2,
  Mic,
  MicOff,
  Music,
  Pause,
  PhoneCall,
  Play,
  Radio,
  Upload,
  Users,
  X,
} from "lucide-react"
import { callInQueue } from "@/lib/data"
import type { CurrentUser } from "@/lib/session"
import { publishShow } from "@/app/actions/shows"
import { startBroadcast, endBroadcast } from "@/app/actions/live"
import { useLiveAudio } from "@/lib/use-live-audio"
import { LiveChat } from "@/components/live-chat"
import { CoverUpload } from "@/components/admin/cover-upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

type EndedSession = { title: string; duration: string } | null

export function StudioConsole({ currentUser }: { currentUser: CurrentUser }) {
  const { state, connect, disconnect, toggleMic } = useLiveAudio()
  const live = state.connected
  const micOn = state.micEnabled
  const [elapsed, setElapsed] = useState(0)
  const [title, setTitle] = useState(`${currentUser.name} — live session`)
  const [queue, setQueue] = useState(callInQueue)
  const [onAir, setOnAir] = useState<string | null>(null)
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
      // Ending the stream: stop the broadcast and offer to publish the session.
      const duration = formatDuration(elapsed)
      if (roomName) await endBroadcast({ roomName }).catch(() => {})
      await disconnect()
      setRoomName(null)
      setEndedSession({ title, duration })
      setElapsed(0)
      setOnAir(null)
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
    }
  }

  function bringOnAir(id: string) {
    setOnAir(id)
    setQueue((q) => q.filter((c) => c.id !== id))
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

          {onAir && (
            <div className="absolute right-4 top-4 w-40 overflow-hidden rounded-lg border border-primary/60 bg-card shadow-lg">
              <div className="flex items-center justify-between bg-primary/15 px-2 py-1">
                <span className="text-xs font-semibold text-primary">Caller on air</span>
                <button onClick={() => setOnAir(null)} aria-label="Remove caller">
                  <X className="size-3 text-primary" />
                </button>
              </div>
              <div className="flex items-center justify-center bg-secondary py-6">
                <Mic className="size-6 text-foreground" />
              </div>
            </div>
          )}

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
        {endedSession && (
          <PublishPanel
            session={endedSession}
            onClose={() => setEndedSession(null)}
          />
        )}

        {/* Background music */}
        <BackgroundMusicPanel live={live} />

        {/* Show setup */}
        <div className="space-y-2 rounded-xl border border-border/60 bg-card p-4">
          <label htmlFor="show-title" className="text-sm font-medium">
            Stream title
          </label>
          <Input id="show-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex items-center gap-3 pt-1">
            <Avatar className="size-8">
              <AvatarFallback className={currentUser.color}>{currentUser.initials}</AvatarFallback>
            </Avatar>
            <span className="text-sm text-muted-foreground">
              Broadcasting as <span className="font-medium text-foreground">{currentUser.name}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Chat + call-ins */}
      <aside className="lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
        <Tabs defaultValue="chat" className="flex h-[560px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card lg:h-full">
          <TabsList className="m-3 grid grid-cols-2">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="callins" className="gap-1.5">
              Call-ins
              {queue.length > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {queue.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="m-0 min-h-0 flex-1">
            <LiveChat asHost currentUser={currentUser} roomName={roomName ?? undefined} />
          </TabsContent>

          <TabsContent value="callins" className="m-0 min-h-0 flex-1 overflow-y-auto p-3">
            {queue.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <PhoneCall className="size-8" />
                <p className="text-sm">No one in the queue right now.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {queue.map((c) => (
                  <div key={c.id} className="rounded-xl border border-border/60 bg-background p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">{c.name}</p>
                      <span className="font-mono text-xs text-muted-foreground">{c.waiting}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground leading-relaxed">{c.topic}</p>
                    <div className="mt-2.5 flex items-center gap-2">
                      <Button size="sm" className="h-8 gap-1.5" onClick={() => bringOnAir(c.id)} disabled={!live}>
                        <Mic className="size-3.5" /> Bring on air
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-muted-foreground"
                        onClick={() => setQueue((q) => q.filter((x) => x.id !== c.id))}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ))}
                {!live && (
                  <p className="px-1 pt-1 text-xs text-muted-foreground">Go live to bring callers on air.</p>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </aside>
    </div>
  )
}

function BackgroundMusicPanel({ live }: { live: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [track, setTrack] = useState<{ url: string; name: string } | null>(null)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(0.4)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume, track])

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/upload-audio", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Upload failed")
      setTrack({ url: data.url, name: data.name ?? file.name })
      setPlaying(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function togglePlay() {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
      setPlaying(false)
    } else {
      el.play().catch(() => {})
      setPlaying(true)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2">
        <Music className="size-4 text-primary" />
        <h2 className="text-sm font-medium">Background music</h2>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Upload a backing track to play under your live audio — intro music, bed loops, or stings.
      </p>

      <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handlePick} />

      {track ? (
        <div className="space-y-3 rounded-lg border border-border/60 bg-background p-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90"
              aria-label={playing ? "Pause music" : "Play music"}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-0.5" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{track.name}</p>
              <p className="text-xs text-muted-foreground">{live ? "Mixed into your live audio" : "Go live to mix in"}</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
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
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio ref={audioRef} src={track.url} loop onEnded={() => setPlaying(false)} />
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
  session: { title: string; duration: string }
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
      const res = await publishShow({
        title,
        tagline,
        category,
        duration: session.duration,
        description,
        cover,
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
            <p className="text-xs text-muted-foreground">Recorded {session.duration}. Save it to your profile catalogue.</p>
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
