"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  PhoneCall,
  Radio,
  Upload,
  Users,
  X,
} from "lucide-react"
import { callInQueue } from "@/lib/data"
import type { CurrentUser } from "@/lib/session"
import { goLive, publishShow } from "@/app/actions/shows"
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

type EndedSession = { title: string; duration: string } | null

export function StudioConsole({ currentUser }: { currentUser: CurrentUser }) {
  const [live, setLive] = useState(false)
  const [camOn, setCamOn] = useState(true)
  const [micOn, setMicOn] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [viewers, setViewers] = useState(0)
  const [title, setTitle] = useState(`${currentUser.name} — live session`)
  const [queue, setQueue] = useState(callInQueue)
  const [onAir, setOnAir] = useState<string | null>(null)
  const [endedSession, setEndedSession] = useState<EndedSession>(null)

  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [live])

  useEffect(() => {
    if (!live) {
      setViewers(0)
      return
    }
    const t = setInterval(() => {
      setViewers((v) => Math.max(0, v + Math.floor(Math.random() * 9) - 2))
    }, 1800)
    setViewers(128)
    return () => clearInterval(t)
  }, [live])

  function toggleLive() {
    if (live) {
      // Ending the stream: offer to publish the recorded session.
      setEndedSession({ title, duration: formatDuration(elapsed) })
      setLive(false)
      setElapsed(0)
      setOnAir(null)
    } else {
      setLive(true)
      setEndedSession(null)
      // Notify followers that this host just went live (fire and forget).
      goLive({ title }).catch(() => {})
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
          <Button onClick={toggleLive} variant={live ? "secondary" : "default"} className="gap-2">
            <Radio className="size-4" />
            {live ? "End stream" : "Go live"}
          </Button>
        </div>

        {/* Camera preview */}
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-border/60 bg-black">
          {camOn ? (
            <div className="flex size-full items-center justify-center bg-gradient-to-b from-secondary to-background">
              <span className={cn("flex size-24 items-center justify-center rounded-full text-3xl font-semibold", currentUser.color)}>
                {currentUser.initials}
              </span>
            </div>
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <CameraOff className="size-10" />
              <p className="text-sm">Camera is off</p>
            </div>
          )}

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
              onClick={() => setMicOn((m) => !m)}
              className={cn(
                "flex size-10 items-center justify-center rounded-full transition-colors",
                micOn ? "bg-secondary text-foreground hover:bg-secondary/80" : "bg-primary text-primary-foreground",
              )}
              aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
            >
              {micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
            </button>
            <button
              onClick={() => setCamOn((c) => !c)}
              className={cn(
                "flex size-10 items-center justify-center rounded-full transition-colors",
                camOn ? "bg-secondary text-foreground hover:bg-secondary/80" : "bg-primary text-primary-foreground",
              )}
              aria-label={camOn ? "Turn camera off" : "Turn camera on"}
            >
              {camOn ? <Camera className="size-5" /> : <CameraOff className="size-5" />}
            </button>
            <button
              className="flex size-10 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/80"
              aria-label="Share screen"
            >
              <MonitorUp className="size-5" />
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
            <LiveChat asHost />
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
        <p className="text-sm text-muted-foreground">Your followers and anyone visiting your profile can watch it now.</p>
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
