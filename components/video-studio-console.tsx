"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  Mic,
  MicOff,
  Radio,
  RefreshCw,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react"
import type { CurrentUser } from "@/lib/session"
import { startBroadcast, endBroadcast } from "@/app/actions/live"
import { useLiveVideo } from "@/lib/use-live-video"
import { ReactionLayer } from "@/components/live-reactions"
import { VideoCommentStream, VideoCommentComposer } from "@/components/live-video-comments"
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
        size === "lg" ? "size-16" : "size-14",
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

/**
 * Immersive, full-bleed video broadcast studio (TikTok Live style). The host's
 * camera fills the screen; glassy overlays carry the LIVE chip, viewer count,
 * timer, live comments, floating reactions/gifts, and the control dock.
 *
 * Before going live the host sees a mirrored camera preview and a title field;
 * tapping "Go live" creates a video stream and starts publishing.
 */
export function VideoStudioConsole({ currentUser }: { currentUser: CurrentUser }) {
  const router = useRouter()
  const [title, setTitle] = useState(`${currentUser.name} — live`)
  const [roomName, setRoomName] = useState<string | null>(null)
  const [creds, setCreds] = useState<{ token: string; serverUrl: string } | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const startedAtRef = useRef<number | null>(null)

  const live = Boolean(roomName && creds)

  const {
    localVideoRef,
    remoteAudioRef,
    connected,
    micOn,
    camOn,
    participants,
    error: rtcError,
    toggleMic,
    toggleCam,
    flipCamera,
    disconnect,
  } = useLiveVideo({
    token: creds?.token ?? null,
    serverUrl: creds?.serverUrl ?? null,
    isHost: true,
  })

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
        if (previewVideoRef.current) previewVideoRef.current.srcObject = stream
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

  async function goLive() {
    setError(null)
    setStarting(true)
    // Release the preview camera so LiveKit can claim the device.
    previewStreamRef.current?.getTracks().forEach((t) => t.stop())
    previewStreamRef.current = null
    try {
      const res = await startBroadcast({ title: title.trim() || `${currentUser.name} — live`, mode: "video" })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setRoomName(res.roomName)
      setCreds({ token: res.token, serverUrl: res.serverUrl })
      startedAtRef.current = null
      setElapsed(0)
    } catch {
      // A thrown server action (auth/network) must not strand the button on
      // a permanent "Starting…" spinner.
      setError("Something went wrong starting your live. Please try again.")
    } finally {
      setStarting(false)
    }
  }

  async function endLive() {
    if (roomName) await endBroadcast({ roomName }).catch(() => {})
    disconnect()
    router.push("/live")
  }

  const viewers = Math.max(0, participants - 1)

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-neutral-950 text-white">
      {/* Host audio is published, not subscribed; element kept for parity. */}
      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      {/* Full-bleed camera — live publisher feed (mirrored self-view) */}
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className={cn(
          "absolute inset-0 h-full w-full -scale-x-100 object-cover transition-opacity duration-500",
          live && camOn ? "opacity-100" : "opacity-0",
        )}
      />
      {/* Pre-live preview camera */}
      {!live && (
        <video
          ref={previewVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
        />
      )}

      {/* Camera-off / connecting wash */}
      {live && (!camOn || !connected) && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-neutral-950 px-6">
          {!connected ? (
            rtcError ? (
              // Connection failed/timed out — never leave the host on a black spinner.
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
                <button
                  type="button"
                  onClick={endLive}
                  className="mt-1 text-xs font-medium text-white/50 underline-offset-4 transition-colors hover:text-white/80 hover:underline"
                >
                  Cancel
                </button>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center gap-2 text-white/60">
              <VideoOff className="size-8" />
              <p className="text-sm font-medium">Camera off</p>
              {rtcError && <p className="max-w-xs text-center text-xs text-white/45 text-pretty">{rtcError}</p>}
            </div>
          )}
        </div>
      )}

      {/* Legibility scrims */}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />

      {/* Floating reactions + gifts */}
      {live && <ReactionLayer roomName={connected ? roomName! : undefined} />}

      {/* ── Top bar: LIVE + viewers + close ─────────────────────────────── */}
      <div className="relative z-20 flex items-start justify-between p-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="flex items-center gap-2">
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

        <button
          type="button"
          onClick={live ? endLive : () => router.push("/live")}
          aria-label={live ? "End broadcast" : "Close studio"}
          className="flex size-10 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-colors hover:bg-black/50"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* ── Pre-live setup card ─────────────────────────────────────────── */}
      {!live && (
        <div className="relative z-20 flex flex-1 items-end justify-center px-5 pb-8">
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
              Your followers get notified. Viewers can comment, react, and send gifts in real time.
            </p>
          </div>
        </div>
      )}

      {/* ── Live overlay: comments + composer + dock ────────────────────── */}
      {live && (
        <>
          {/* Comment stream floats bottom-left, above the composer */}
          <div className="pointer-events-none absolute bottom-36 left-4 right-4 z-20 flex justify-start">
            <VideoCommentStream roomName={roomName!} />
          </div>

          {/* Bottom controls: composer + glass dock */}
          <div className="relative z-20 mt-auto flex flex-col gap-4 p-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
            <VideoCommentComposer roomName={roomName!} asHost className="max-w-md" />

            <div className="flex items-center justify-center gap-4">
              <GlassButton
                label="Flip camera"
                onClick={() => void flipCamera()}
                disabled={!connected || !camOn}
              >
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
              <GlassButton label="End broadcast" onClick={endLive} tone="danger" size="lg">
                <Radio className="size-6" />
              </GlassButton>
            </div>
          </div>

          {rtcError && (
            <p className="absolute bottom-2 left-1/2 z-30 -translate-x-1/2 rounded-full bg-destructive px-4 py-1.5 text-sm font-medium text-destructive-foreground shadow-lg">
              {rtcError}
            </p>
          )}
        </>
      )}
    </div>
  )
}
