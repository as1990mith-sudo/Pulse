"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import {
  Check,
  Loader2,
  Mic,
  MicOff,
  Music,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Square,
  UserPlus,
  Users,
  Video,
  VideoOff,
  Volume2,
  X,
} from "lucide-react"
import type { CurrentUser } from "@/lib/session"
import {
  startBroadcast,
  endBroadcast,
  joinBroadcast,
  getCallState,
  respondToCallRequest,
  removeFromStage,
  heartbeatBroadcast,
  type LiveStreamView,
} from "@/app/actions/live"
import { useLiveVideo } from "@/lib/use-live-video"
import { uploadMedia } from "@/lib/upload-media"
import { ReactionLayer } from "@/components/live-reactions"
import { LiveChat } from "@/components/live-chat"
import { BackExitMenu } from "@/components/live-back-menu"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { cn } from "@/lib/utils"

function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m)
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`
}

/** Circular glass control button for the broadcaster dock. */
function GlassButton({
  label,
  onClick,
  disabled,
  active = true,
  tone = "glass",
  size = "md",
  children,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  tone?: "glass" | "danger" | "muted"
  size?: "md" | "lg"
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
        "flex items-center justify-center rounded-full ring-1 ring-inset transition-all active:scale-95 disabled:opacity-40",
        size === "lg" ? "size-14" : "size-12",
        tone === "danger"
          ? "bg-destructive text-destructive-foreground ring-white/20 hover:opacity-90"
          : tone === "muted"
            ? "bg-white/90 text-neutral-900 ring-white/40"
            : "bg-white/10 text-white ring-white/15 backdrop-blur-md hover:bg-white/20",
      )}
    >
      {children}
    </button>
  )
}

/** A single guest call-in tile (accepted guest's camera) or an empty slot. */
function GuestSlot({
  peer,
  registerEl,
  onRemove,
}: {
  peer?: { identity: string; name: string; image: string | null; hasVideo: boolean }
  registerEl: (identity: string, el: HTMLVideoElement | null) => void
  onRemove?: (identity: string) => void
}) {
  if (!peer) {
    return (
      <div className="relative flex h-full flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] text-white/40">
        <UserPlus className="size-5" />
        <span className="text-[11px] font-medium">Open call-in slot</span>
      </div>
    )
  }
  return (
    <div className="relative h-full flex-1 overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-inset ring-white/10">
      <video
        ref={(el) => registerEl(peer.identity, el)}
        autoPlay
        playsInline
        muted
        className={cn(
          "h-full w-full object-cover transition-opacity duration-300",
          peer.hasVideo ? "opacity-100" : "opacity-0",
        )}
      />
      {!peer.hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              "flex size-12 items-center justify-center rounded-full text-sm font-semibold text-white",
              getAvatarColor(peer.identity),
            )}
          >
            {getInitials(peer.name)}
          </span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
        <span className="truncate text-[11px] font-semibold text-white">{peer.name}</span>
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(peer.identity)}
            aria-label={`Remove ${peer.name}`}
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-black/50 text-white/90 transition-colors hover:bg-destructive"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Immersive video broadcast studio. The host's camera fills the top half; two
 * call-in slots fill the next quarter (accepted guests' cameras), and the live
 * chatroom fills the bottom quarter. The host can flip to the back camera,
 * mix in uploaded background music, accept guest call-ins, and minimise or end
 * the session from the back menu.
 */
export function VideoStudioConsole({
  currentUser,
  resumeStream,
  onMinimize,
  onExit,
  onMeta,
}: {
  currentUser: CurrentUser
  resumeStream?: LiveStreamView | null
  onMinimize?: () => void
  onExit?: () => void
  onMeta?: (m: { title: string; cover: string | null; live: boolean; subtitle?: string }) => void
}) {
  const [title, setTitle] = useState(resumeStream?.title ?? `${currentUser.name} — live`)
  const [roomName, setRoomName] = useState<string | null>(resumeStream?.roomName ?? null)
  const [creds, setCreds] = useState<{ token: string; serverUrl: string } | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const startedAtRef = useRef<number | null>(null)

  // Music state
  const [musicPanelOpen, setMusicPanelOpen] = useState(false)
  const [musicName, setMusicName] = useState<string | null>(null)
  const [musicPlaying, setMusicPlayingState] = useState(false)
  const [musicVolume, setMusicVolumeState] = useState(0.4)
  const [musicUploading, setMusicUploading] = useState(false)
  const [musicError, setMusicError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const live = Boolean(roomName && creds)

  const {
    localVideoRef,
    connected,
    micOn,
    camOn,
    localVideoReady,
    participants,
    peers,
    error: rtcError,
    registerPeerVideoEl,
    toggleMic,
    toggleCam,
    flipCamera,
    publishMusic,
    setMusicVolume,
    setMusicPlaying,
    stopMusic,
    disconnect,
  } = useLiveVideo({
    token: creds?.token ?? null,
    serverUrl: creds?.serverUrl ?? null,
    isHost: true,
    hostId: currentUser.id,
  })

  // Resume an existing live video the host owns (reopened after minimising).
  const resumedRef = useRef(false)
  useEffect(() => {
    if (!resumeStream || resumedRef.current) return
    resumedRef.current = true
    void (async () => {
      const res = await joinBroadcast({ roomName: resumeStream.roomName }).catch(() => null)
      if (!res || !res.ok) {
        setRoomName(null)
        setError("This live session has already ended.")
        return
      }
      const startedMs = new Date(resumeStream.startedAt).getTime()
      startedAtRef.current = startedMs
      setElapsed(Math.max(0, Math.floor((Date.now() - startedMs) / 1000)))
      setCreds({ token: res.token, serverUrl: res.serverUrl })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeStream])

  // Local-only camera preview before going live, so the host can frame the shot.
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const previewStreamRef = useRef<MediaStream | null>(null)
  useEffect(() => {
    if (live) return
    let cancelled = false
    async function startPreview() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        previewStreamRef.current = stream
        const el = previewVideoRef.current
        if (el) {
          el.srcObject = stream
          el.muted = true
          el.setAttribute("playsinline", "true")
          void el.play().catch(() => {})
        }
      } catch {
        setError("We need camera access to start a video live. Check your browser permissions.")
      }
    }
    void startPreview()
    return () => {
      cancelled = true
      previewStreamRef.current?.getTracks().forEach((t) => t.stop())
      previewStreamRef.current = null
    }
  }, [live])

  // Live duration clock.
  useEffect(() => {
    if (!connected) return
    if (startedAtRef.current == null) startedAtRef.current = Date.now()
    const iv = setInterval(() => {
      if (startedAtRef.current != null) setElapsed((Date.now() - startedAtRef.current) / 1000)
    }, 1000)
    return () => clearInterval(iv)
  }, [connected])

  // Heartbeat: while the video room exists, ping the server every 20s so the
  // stream's lastSeenAt stays fresh and the stale-stream sweep (60s) never
  // auto-ends a session the host didn't end himself. Because the video session
  // is mounted at the app level, this keeps running even while minimised — the
  // host can only lose the session by explicitly ending it. We intentionally do
  // NOT force-disconnect the host on a transient `ended` response; the heartbeat
  // re-marks the stream live, so the host is never silently signed out.
  useEffect(() => {
    if (!live || !roomName) return
    let cancelled = false
    const ping = () => {
      if (cancelled) return
      void heartbeatBroadcast({ roomName }).catch(() => null)
    }
    ping()
    const t = setInterval(ping, 20000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [live, roomName])

  // Keep the app-level mini-player's "now playing" info in sync.
  useEffect(() => {
    onMeta?.({ title, cover: null, live, subtitle: live ? "You're live · video" : "Setting up" })
  }, [title, live, onMeta])

  // Host polls the call-in queue to surface pending guest requests + guests.
  const { data: callState, mutate: refreshCalls } = useSWR(
    live && roomName ? ["video-call-state", roomName] : null,
    () => getCallState({ roomName: roomName! }),
    { refreshInterval: 2500 },
  )
  const pending = callState?.pendingRequests ?? []

  async function goLive() {
    setError(null)
    setStarting(true)
    try {
      const res = await startBroadcast({ title: title.trim() || `${currentUser.name} — live`, mode: "video" })
      if (!res.ok) {
        setError(res.error)
        return
      }
      previewStreamRef.current?.getTracks().forEach((t) => t.stop())
      previewStreamRef.current = null
      setRoomName(res.roomName)
      setCreds({ token: res.token, serverUrl: res.serverUrl })
      startedAtRef.current = null
      setElapsed(0)
    } catch {
      setError("Something went wrong starting your live. Please try again.")
    } finally {
      setStarting(false)
    }
  }

  async function endLive() {
    if (roomName) await endBroadcast({ roomName }).catch(() => {})
    disconnect()
    onExit?.()
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

  // ── Music controls ──────────────────────────────────────────────────────
  async function onPickMusic(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setMusicError(null)
    setMusicUploading(true)
    try {
      const { url } = await uploadMedia(file, "live-music")
      await publishMusic(url)
      setMusicVolume(musicVolume)
      setMusicName(file.name.replace(/\.[^.]+$/, ""))
      setMusicPlayingState(true)
    } catch {
      setMusicError("Could not add that track. Try a different audio file.")
    } finally {
      setMusicUploading(false)
    }
  }
  function toggleMusicPlay() {
    if (!musicName) return
    const next = !musicPlaying
    setMusicPlaying(next)
    setMusicPlayingState(next)
  }
  function changeMusicVolume(value: number) {
    setMusicVolumeState(value)
    setMusicVolume(value)
  }
  async function stopMusicTrack() {
    await stopMusic()
    setMusicName(null)
    setMusicPlayingState(false)
  }

  const viewers = Math.max(0, participants - 1 - peers.length)
  // Guests are remote publishers (the host publishes locally, not remotely).
  const guests = peers.slice(0, 2)

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-neutral-950 text-white [isolation:isolate]">
      {/* ── Host camera (1.75/4 of the screen) ────────────────────────────── */}
      <div className="relative flex-[1.75] min-h-0 overflow-hidden">
        {/* Full-bleed camera — live publisher feed (mirrored self-view) */}
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "absolute inset-0 z-0 h-full w-full -scale-x-100 object-cover transition-opacity duration-500",
            live && camOn && localVideoReady ? "opacity-100" : "opacity-0",
          )}
        />
        {/* Pre-live preview camera */}
        {!live && (
          <video
            ref={previewVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 z-0 h-full w-full -scale-x-100 object-cover"
          />
        )}

        {/* Camera-off / connecting wash */}
        {live && (!camOn || !connected || !localVideoReady) && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-neutral-950 px-6">
            {!connected ? (
              rtcError ? (
                <div className="flex max-w-sm flex-col items-center gap-3 text-center text-white/80">
                  <VideoOff className="size-8 text-destructive" />
                  <p className="text-sm font-medium text-pretty">{rtcError}</p>
                  <button
                    type="button"
                    onClick={endLive}
                    className="mt-1 rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/20"
                  >
                    Go back
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-white/70">
                  <Loader2 className="size-7 animate-spin" />
                  <p className="text-sm font-medium">Going live…</p>
                </div>
              )
            ) : !camOn ? (
              <div className="flex flex-col items-center gap-2 text-white/60">
                <VideoOff className="size-8" />
                <p className="text-sm font-medium">Camera off</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-white/70">
                <Loader2 className="size-7 animate-spin" />
                <p className="text-sm font-medium">Starting camera…</p>
              </div>
            )}
          </div>
        )}

        {/* Legibility scrims */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/55"
        />

        {/* Floating reactions + gifts */}
        {live && <ReactionLayer roomName={connected ? roomName! : undefined} />}

        {/* Top bar: back menu + LIVE/viewers/timer */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
          <div className="flex items-center gap-2">
            <BackExitMenu
              showMenu={live}
              exitLabel="End"
              onExit={live ? endLive : (onExit ?? (() => {}))}
              onMinimize={onMinimize ?? (() => {})}
            />
            {live ? (
              <span className="flex items-center gap-1.5 rounded-full bg-live px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-live-foreground shadow-lg">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-live-foreground/70" />
                  <span className="relative inline-flex size-2 rounded-full bg-live-foreground" />
                </span>
                Live
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 ring-1 ring-inset ring-white/15 backdrop-blur-md">
                <Video className="size-3.5" /> Video studio
              </span>
            )}
            {live && (
              <span className="flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1.5 text-xs font-medium text-white/90 ring-1 ring-inset ring-white/10 backdrop-blur-md">
                <Users className="size-3.5" /> {viewers.toLocaleString()}
              </span>
            )}
            {live && (
              <span className="rounded-full bg-black/35 px-3 py-1.5 font-mono text-xs tabular-nums text-white/90 ring-1 ring-inset ring-white/10 backdrop-blur-md">
                {formatElapsed(elapsed)}
              </span>
            )}
          </div>
        </div>

        {/* Pending call-in requests (host) */}
        {live && pending.length > 0 && (
          <div className="absolute left-4 right-4 top-[calc(env(safe-area-inset-top)+4rem)] z-20 flex flex-col gap-2">
            {pending.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 rounded-2xl bg-black/55 p-2 ring-1 ring-inset ring-white/10 backdrop-blur-md"
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white",
                    r.color,
                  )}
                >
                  {r.initials}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  <span className="font-semibold">{r.userName}</span> wants to join
                </span>
                <button
                  type="button"
                  onClick={() => void acceptCall(r.id)}
                  aria-label={`Accept ${r.userName}`}
                  className="flex size-8 items-center justify-center rounded-full bg-live text-live-foreground transition-opacity hover:opacity-90"
                >
                  <Check className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void declineCall(r.id)}
                  aria-label={`Decline ${r.userName}`}
                  className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/20"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pre-live setup card */}
        {!live && (
          <div className="absolute inset-0 z-20 flex items-end justify-center px-5 pb-6">
            <div className="w-full max-w-md space-y-4 rounded-3xl bg-black/40 p-5 ring-1 ring-inset ring-white/10 backdrop-blur-2xl">
              <div className="space-y-1.5">
                <label htmlFor="live-title" className="text-xs font-semibold uppercase tracking-wider text-white/60">
                  Stream title
                </label>
                <input
                  id="live-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  placeholder="What's your live about?"
                  className="w-full rounded-2xl bg-white/10 px-4 py-3 text-base font-medium text-white ring-1 ring-inset ring-white/15 placeholder:text-white/40 focus:outline-none focus:ring-primary"
                />
              </div>
              {error && <p className="text-sm font-medium text-destructive">{error}</p>}
              <button
                type="button"
                onClick={goLive}
                disabled={starting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-live px-6 py-3.5 text-base font-semibold text-live-foreground transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
              >
                {starting ? <Loader2 className="size-5 animate-spin" /> : <Radio className="size-5" />}
                {starting ? "Starting…" : "Go live"}
              </button>
              <p className="text-center text-xs text-white/50">
                Viewers can comment, react, send gifts, and request to join your call-in slots.
              </p>
            </div>
          </div>
        )}

        {/* Control dock — overlaid at the bottom of the camera region. Sits
            above the camera-off / connecting wash (z-30) so the camera and mic
            controls stay tappable even when the camera is turned off. */}
        {live && (
          <div className="absolute inset-x-0 bottom-0 z-40 flex items-center justify-center gap-3 p-3">
            <GlassButton label="Flip camera" onClick={() => void flipCamera()} disabled={!connected || !camOn}>
              <RefreshCw className="size-5" />
            </GlassButton>
            <GlassButton
              label={micOn ? "Mute microphone" : "Unmute microphone"}
              onClick={() => void toggleMic()}
              disabled={!connected}
              tone={micOn ? "glass" : "muted"}
              active={micOn}
            >
              {micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
            </GlassButton>
            <GlassButton
              label={camOn ? "Turn off camera" : "Turn on camera"}
              onClick={() => void toggleCam()}
              disabled={!connected}
              tone={camOn ? "glass" : "muted"}
              active={camOn}
            >
              {camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
            </GlassButton>
            <GlassButton
              label="Background music"
              onClick={() => setMusicPanelOpen((o) => !o)}
              active={Boolean(musicName)}
              tone={musicName ? "muted" : "glass"}
            >
              <Music className="size-5" />
            </GlassButton>
            <GlassButton label="End broadcast" onClick={endLive} tone="danger" size="lg">
              <Radio className="size-6" />
            </GlassButton>
          </div>
        )}

        {/* Music panel */}
        {live && musicPanelOpen && (
          <div className="absolute bottom-20 left-1/2 z-30 w-72 -translate-x-1/2 rounded-2xl border border-white/10 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Background music</p>
              <button
                type="button"
                onClick={() => setMusicPanelOpen(false)}
                aria-label="Close music panel"
                className="text-white/50 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="audio/*" onChange={onPickMusic} className="hidden" />
            {!musicName ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={musicUploading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/20 disabled:opacity-60"
              >
                {musicUploading ? <Loader2 className="size-4 animate-spin" /> : <Music className="size-4" />}
                {musicUploading ? "Uploading…" : "Upload a track"}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleMusicPlay}
                    aria-label={musicPlaying ? "Pause music" : "Play music"}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  >
                    {musicPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{musicName}</span>
                  <button
                    type="button"
                    onClick={stopMusicTrack}
                    aria-label="Stop music"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-inset ring-white/15 hover:bg-white/20"
                  >
                    <Square className="size-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Volume2 className="size-4 shrink-0 text-white/60" />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={musicVolume}
                    onChange={(e) => changeMusicVolume(Number(e.target.value))}
                    aria-label="Music volume"
                    className="h-1.5 w-full cursor-pointer accent-primary"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={musicUploading}
                  className="w-full rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white/80 ring-1 ring-inset ring-white/15 hover:bg-white/20 disabled:opacity-60"
                >
                  {musicUploading ? "Uploading…" : "Replace track"}
                </button>
              </div>
            )}
            {musicError && <p className="mt-2 text-xs text-destructive">{musicError}</p>}
          </div>
        )}
      </div>

      {/* ── Two guest call-in slots (0.75/4 of the screen) ─────────────────── */}
      <div className="flex flex-[0.75] min-h-0 gap-2 border-t border-white/10 bg-neutral-950 p-2">
        <GuestSlot peer={guests[0]} registerEl={registerPeerVideoEl} onRemove={live ? dropGuest : undefined} />
        <GuestSlot peer={guests[1]} registerEl={registerPeerVideoEl} onRemove={live ? dropGuest : undefined} />
      </div>

      {/* ── Live chatroom (remaining 1.5/4 of the screen) ──────────────────── */}
      <div className="flex-[1.5] min-h-0 border-t border-white/10 bg-neutral-950">
        <LiveChat asHost currentUser={currentUser} roomName={live ? roomName! : undefined} immersive />
      </div>

      {rtcError && live && (
        <p className="absolute bottom-2 left-1/2 z-40 -translate-x-1/2 rounded-full bg-destructive px-4 py-1.5 text-sm font-medium text-destructive-foreground shadow-lg">
          {rtcError}
        </p>
      )}
    </div>
  )
}
