"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from "livekit-client"
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff, SwitchCamera } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { CallButton } from "@/components/call-controls"
import { cn } from "@/lib/utils"
import { startRingtone } from "@/lib/ringtone"
import { ackCall, acceptCall, endCall, getCallToken, type DmCallView } from "@/app/actions/dm-call"

type Peer = {
  name: string
  initials: string
  color: string
  image: string | null
}

// Floating self-view dimensions (WhatsApp-style picture-in-picture).
const PIP_W = 116
const PIP_H = 168

/**
 * Full-screen 1:1 call surface for DMs, modeled on WhatsApp calls:
 *  - incoming  : callee sees accept/decline for a ringing call
 *  - outgoing  : caller sees "ringing…" with cancel
 *  - active    : both connect to LiveKit, audio always + optional video
 *
 * During a live video call the remote feed fills the screen, the controls float
 * over it and auto-hide (tap to reveal), and the local self-view is a draggable
 * tile that snaps to the nearest corner so it never blocks a face.
 */
export function DmCall({
  call,
  peer,
  onClosed,
}: {
  call: DmCallView
  peer: Peer
  onClosed: () => void
}) {
  const roomRef = useRef<Room | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)

  const [connected, setConnected] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(call.mode === "video")
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user")
  const [remoteVideoOn, setRemoteVideoOn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Seconds elapsed since the call actually connected (callee accepted).
  const [elapsed, setElapsed] = useState(0)

  // The call is truly "live" only once the callee has accepted (status flips to
  // "active") AND this client is connected to the LiveKit room. The caller
  // joins LiveKit immediately while ringing, so we must NOT treat that as
  // connected — otherwise the caller would see "Connected" before pickup.
  const isLive = call.status === "active" && connected

  // For the callee, an unanswered ringing call shows the accept prompt. The
  // caller goes straight to the "ringing" connecting state.
  const [phase, setPhase] = useState<"prompt" | "connecting" | "active">(
    call.isCaller ? "connecting" : call.status === "active" ? "connecting" : "prompt",
  )

  const cleanup = useCallback(() => {
    const room = roomRef.current
    if (room) {
      room.disconnect()
      roomRef.current = null
    }
  }, [])

  const connect = useCallback(async () => {
    if (roomRef.current) return
    try {
      const creds = await getCallToken({ callId: call.id })
      if (!creds) {
        setError("Calling is not configured.")
        return
      }
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        // Enable acoustic echo cancellation (plus noise suppression / auto gain)
        // so a participant on loudspeaker never hears their own voice returned
        // through the other caller's mic. Matches the global live-audio policy.
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      roomRef.current = room

      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, _p: RemoteParticipant) => {
          if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
            track.attach(remoteVideoRef.current)
            setRemoteVideoOn(true)
          }
          if (track.kind === Track.Kind.Audio && remoteAudioRef.current) {
            track.attach(remoteAudioRef.current)
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach()
          if (track.kind === Track.Kind.Video) setRemoteVideoOn(false)
        })
        .on(RoomEvent.Disconnected, () => setConnected(false))

      await room.connect(creds.url, creds.token)
      await room.localParticipant.setMicrophoneEnabled(true)
      if (call.mode === "video") {
        await room.localParticipant.setCameraEnabled(true, { facingMode: "user" })
        // Self-view attachment is handled by the effect that watches `camOn`
        // and `connected`, ensuring the <video> element is mounted first.
      }
      setConnected(true)
      setPhase("active")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join the call.")
    }
  }, [call.id, call.mode])

  function attachLocalVideo(room: Room) {
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera)
    const track = pub?.track
    if (track instanceof LocalVideoTrack && localVideoRef.current) {
      track.attach(localVideoRef.current)
    }
  }

  // The caller connects immediately (room exists from ringing); the callee
  // connects after accepting. When the signaling status flips to active for the
  // caller, that's the cue the callee picked up.
  useEffect(() => {
    if (call.isCaller && phase === "connecting") void connect()
  }, [call.isCaller, phase, connect])

  // Caller: when the peer accepts (status -> active), we are already connected;
  // nothing more to do. When the call ends/declines remotely, close.
  useEffect(() => {
    if (call.status === "ended" || call.status === "declined" || call.status === "missed") {
      cleanup()
      onClosed()
    }
  }, [call.status, cleanup, onClosed])

  useEffect(() => () => cleanup(), [cleanup])

  // Attach (or re-attach) the local camera track to the self-view whenever the
  // preview becomes visible — on connect and every time the camera is toggled
  // back on. This runs after React has mounted the <video> element, so the ref
  // is guaranteed to exist (fixes the self-view going blank after toggling).
  useEffect(() => {
    if (call.mode !== "video" || !camOn || !connected) return
    const room = roomRef.current
    if (room) attachLocalVideo(room)
  }, [call.mode, camOn, connected, facingMode])

  // Once the call goes live (callee accepted + connected), start ticking the
  // call duration. Resets if the call ever drops back out of the live state.
  useEffect(() => {
    if (!isLive) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [isLive])

  // Callee: as soon as the ringing call appears on this device, acknowledge it
  // so the caller's UI can switch from "Calling" to "Ringing".
  useEffect(() => {
    if (!call.isCaller && call.status === "ringing" && !call.calleeAck) {
      void ackCall({ callId: call.id })
    }
  }, [call.isCaller, call.status, call.calleeAck, call.id])

  // Ringtone: the callee hears the incoming warble while the prompt is up; the
  // caller hears a ringback tone while waiting for an answer. Both stop once the
  // call connects, is answered, or ends.
  useEffect(() => {
    const ringingForCaller = call.isCaller && call.status === "ringing"
    const ringingForCallee = !call.isCaller && phase === "prompt" && call.status === "ringing"
    if (!ringingForCaller && !ringingForCallee) return

    const stop = startRingtone(call.isCaller ? "ringback" : "incoming")
    return stop
  }, [call.isCaller, call.status, phase])

  async function handleAccept() {
    setPhase("connecting")
    try {
      await acceptCall({ callId: call.id })
      await connect()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not accept the call.")
    }
  }

  async function handleEnd(declined = false) {
    cleanup()
    try {
      await endCall({ callId: call.id, declined })
    } finally {
      onClosed()
    }
  }

  async function toggleMic() {
    const room = roomRef.current
    if (!room) return
    const next = !micOn
    await room.localParticipant.setMicrophoneEnabled(next)
    setMicOn(next)
  }

  async function toggleCam() {
    const room = roomRef.current
    if (!room) return
    const next = !camOn
    await room.localParticipant.setCameraEnabled(next)
    // Don't attach here: the local <video> element is only mounted once
    // `camOn` flips to true and React re-renders. Attaching is handled by the
    // effect below, which runs after the element exists in the DOM.
    setCamOn(next)
  }

  // Flip between the front (user) and back (environment) cameras, like the
  // WhatsApp flip-camera button. Re-attaches the self-view to the new track.
  async function flipCamera() {
    const room = roomRef.current
    if (!room) return
    const next = facingMode === "user" ? "environment" : "user"
    try {
      await room.localParticipant.setCameraEnabled(true, { facingMode: next })
      setFacingMode(next)
      setCamOn(true)
      attachLocalVideo(room)
    } catch {
      /* device may not have a second camera — ignore */
    }
  }

  const showVideo = call.mode === "video"

  function formatDuration(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = totalSeconds % 60
    const mm = String(m).padStart(2, "0")
    const ss = String(s).padStart(2, "0")
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
  }

  // The full-bleed remote camera fills the screen only once it's actually live.
  const remoteFilling = showVideo && remoteVideoOn
  // Show the breathing rings/spinner state while the call hasn't connected yet.
  const ringing = !isLive

  // ── Auto-hiding controls (only while the remote video fills the screen) ──
  const [controlsShown, setControlsShown] = useState(true)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    if (remoteFilling && phase !== "prompt") {
      hideTimer.current = setTimeout(() => setControlsShown(false), 4500)
    }
  }, [remoteFilling, phase])

  useEffect(() => {
    if (controlsShown) scheduleHide()
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [controlsShown, scheduleHide])

  // Reveal controls again whenever we drop out of the full-bleed video state.
  useEffect(() => {
    if (!remoteFilling) setControlsShown(true)
  }, [remoteFilling])

  // Controls are always visible unless we're in immersive full-bleed video and
  // they've been auto/tap hidden.
  const controlsVisible = !remoteFilling || phase === "prompt" || controlsShown

  function toggleControls() {
    if (!remoteFilling || phase === "prompt") return
    setControlsShown((s) => !s)
  }

  // ── Draggable, corner-snapping self-view (floatable caller tab) ──────────
  const pipRef = useRef<HTMLDivElement>(null)
  const [pipPos, setPipPos] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ active: boolean; dx: number; dy: number; moved: boolean }>({
    active: false,
    dx: 0,
    dy: 0,
    moved: false,
  })

  const snapCorner = useCallback((x: number, y: number) => {
    if (typeof window === "undefined") return { x, y }
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 16
    const topMin = 76 // clear the status pill
    const bottomMax = Math.max(topMin, vh - PIP_H - 132) // clear the control dock
    const leftX = margin
    const rightX = Math.max(margin, vw - PIP_W - margin)
    const cx = x + PIP_W / 2
    const cy = y + PIP_H / 2
    return {
      x: cx < vw / 2 ? leftX : rightX,
      y: cy < vh / 2 ? topMin : bottomMax,
    }
  }, [])

  // Park the self-view in the bottom-right corner once video starts.
  useEffect(() => {
    if (showVideo && pipPos === null && typeof window !== "undefined") {
      setPipPos(snapCorner(window.innerWidth, window.innerHeight))
    }
  }, [showVideo, pipPos, snapCorner])

  // Keep the self-view on-screen across orientation / viewport changes.
  useEffect(() => {
    if (!showVideo) return
    const onResize = () => setPipPos((p) => (p ? snapCorner(p.x, p.y) : p))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [showVideo, snapCorner])

  function onPipPointerDown(e: React.PointerEvent) {
    const el = pipRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragRef.current = { active: true, dx: e.clientX - rect.left, dy: e.clientY - rect.top, moved: false }
    setDragging(true)
    el.setPointerCapture(e.pointerId)
  }

  function onPipPointerMove(e: React.PointerEvent) {
    if (!dragRef.current.active) return
    dragRef.current.moved = true
    setPipPos({ x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy })
  }

  function onPipPointerUp(e: React.PointerEvent) {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    setDragging(false)
    pipRef.current?.releasePointerCapture(e.pointerId)
    setPipPos((p) => (p ? snapCorner(p.x, p.y) : p))
  }

  const statusText =
    phase === "prompt"
      ? `Incoming ${call.mode} call`
      : isLive
        ? formatDuration(elapsed)
        : call.isCaller
          ? call.calleeAck
            ? "Ringing…"
            : "Calling…"
          : "Connecting…"

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-neutral-950 text-white">
      {/* Remote audio is always present but hidden. */}
      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      {/* ── Cinematic background ─────────────────────────────────────────── */}
      {/* Blurred peer avatar wash (voice calls / before remote video). */}
      {peer.image && !remoteFilling && (
        <div
          aria-hidden="true"
          className="call-ambient absolute inset-0 scale-125 bg-cover bg-center opacity-30 blur-3xl"
          style={{ backgroundImage: `url(${peer.image})` }}
        />
      )}
      {!remoteFilling && (
        <>
          <div
            aria-hidden="true"
            className="call-ambient pointer-events-none absolute -left-24 -top-24 size-[28rem] rounded-full bg-primary/25 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="call-ambient pointer-events-none absolute -bottom-32 -right-24 size-[26rem] rounded-full bg-call-accept/20 blur-3xl"
            style={{ animationDelay: "-6s" }}
          />
        </>
      )}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70" />

      {/* Full-bleed remote camera — tapping it toggles the floating controls. */}
      {showVideo && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          onClick={toggleControls}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
            remoteFilling ? "opacity-100" : "opacity-0",
          )}
        />
      )}

      {/* Scrim that fades the top/bottom for control legibility over video. */}
      {remoteFilling && (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60 transition-opacity duration-300",
            controlsVisible ? "opacity-100" : "opacity-0",
          )}
        />
      )}

      {/* ── Top status bar (+ flip camera) ───────────────────────────────── */}
      <div
        className={cn(
          "relative z-20 flex items-center justify-center px-6 pt-[calc(env(safe-area-inset-top)+1.25rem)] transition-all duration-300",
          controlsVisible ? "opacity-100" : "pointer-events-none -translate-y-2 opacity-0",
        )}
      >
        <div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium text-white/80 ring-1 ring-inset ring-white/15 backdrop-blur-md">
          <span className="relative flex size-2">
            <span
              className={cn(
                "absolute inline-flex size-full rounded-full opacity-75",
                isLive ? "bg-call-accept" : "bg-primary",
                ringing && "animate-ping",
              )}
            />
            <span className={cn("relative inline-flex size-2 rounded-full", isLive ? "bg-call-accept" : "bg-primary")} />
          </span>
          {showVideo ? "Video call" : "Voice call"}
          <span aria-hidden="true" className="text-white/30">
            ·
          </span>
          End-to-end encrypted
        </div>

        {/* Flip-camera button floats top-right and never covers a face. */}
        {showVideo && camOn && connected && (
          <button
            type="button"
            onClick={flipCamera}
            aria-label="Flip camera"
            className="absolute right-5 top-[calc(env(safe-area-inset-top)+1.05rem)] flex size-11 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-all duration-200 hover:bg-white/20 active:scale-95"
          >
            <SwitchCamera className="size-5" />
          </button>
        )}
      </div>

      {/* ── Stage ────────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        {/* When the remote camera fills the screen we float a compact caption
            instead of the big centered avatar. */}
        {!remoteFilling && (
          <div className="flex flex-col items-center gap-6">
            <div className="relative flex items-center justify-center">
              {ringing && (
                <>
                  <span className="call-ring absolute size-44 rounded-full bg-white/10" />
                  <span
                    className="call-ring absolute size-44 rounded-full bg-white/10"
                    style={{ animationDelay: "-1.2s" }}
                  />
                </>
              )}
              <Avatar className={cn("size-40 shadow-2xl ring-4 ring-white/15", ringing && "call-breathe")}>
                {peer.image && <AvatarImage src={peer.image || "/placeholder.svg"} alt={peer.name} />}
                <AvatarFallback className={cn("text-5xl font-semibold text-white", peer.color)}>
                  {peer.initials}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="space-y-2">
              <h1 className="text-pretty text-3xl font-semibold tracking-tight">{peer.name}</h1>
              <p className={cn("text-base font-medium tabular-nums", isLive ? "text-call-accept" : "text-white/60")}>
                {statusText}
              </p>
            </div>
          </div>
        )}

        {/* Caption pill over full-bleed remote video (fades with controls). */}
        {remoteFilling && (
          <div
            className={cn(
              "absolute left-1/2 top-[calc(env(safe-area-inset-top)+4.5rem)] -translate-x-1/2 rounded-2xl bg-black/40 px-4 py-2 text-center backdrop-blur-md transition-opacity duration-300",
              controlsVisible ? "opacity-100" : "opacity-0",
            )}
          >
            <p className="font-semibold">{peer.name}</p>
            <p className="text-sm tabular-nums text-white/70">{statusText}</p>
          </div>
        )}

        {error && (
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-destructive px-4 py-1.5 text-sm font-medium text-destructive-foreground shadow-lg">
            {error}
          </p>
        )}
      </div>

      {/* ── Floating, draggable self-view (the caller's tab) ─────────────── */}
      {showVideo && camOn && (
        <div
          ref={pipRef}
          onPointerDown={onPipPointerDown}
          onPointerMove={onPipPointerMove}
          onPointerUp={onPipPointerUp}
          onPointerCancel={onPipPointerUp}
          style={
            pipPos
              ? { left: pipPos.x, top: pipPos.y, width: PIP_W, height: PIP_H }
              : { right: 16, bottom: 112, width: PIP_W, height: PIP_H }
          }
          className={cn(
            "absolute z-30 touch-none overflow-hidden rounded-3xl bg-neutral-900 shadow-2xl ring-2 ring-white/20",
            dragging ? "cursor-grabbing scale-105" : "cursor-grab transition-all duration-300 ease-out",
          )}
        >
          <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
          {/* Subtle grabber affordance so users know the tile is movable. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1.5 h-1 w-8 -translate-x-1/2 rounded-full bg-white/40"
          />
        </div>
      )}

      {/* ── Control dock ─────────────────────────────────────────────────── */}
      <div
        className={cn(
          "relative z-20 flex justify-center px-6 pb-[calc(env(safe-area-inset-bottom)+2rem)] transition-all duration-300",
          controlsVisible ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0",
        )}
      >
        {phase === "prompt" ? (
          <div className="flex w-full max-w-xs items-end justify-between">
            <CallButton
              icon={PhoneOff}
              label="Decline"
              tone="danger"
              size="lg"
              onClick={() => handleEnd(true)}
              ariaLabel="Decline call"
            />
            <div className="call-breathe">
              <CallButton
                icon={Phone}
                label="Answer"
                tone="accept"
                size="lg"
                onClick={handleAccept}
                ariaLabel="Answer call"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-5 rounded-[2.25rem] bg-white/5 px-6 py-5 ring-1 ring-inset ring-white/10 backdrop-blur-2xl">
            <CallButton
              icon={micOn ? Mic : MicOff}
              label={micOn ? "Mute" : "Unmute"}
              tone={micOn ? "glass" : "muted"}
              onClick={toggleMic}
              disabled={!connected}
              ariaLabel={micOn ? "Mute microphone" : "Unmute microphone"}
            />
            {showVideo && (
              <CallButton
                icon={camOn ? Video : VideoOff}
                label={camOn ? "Camera" : "Camera off"}
                tone={camOn ? "glass" : "muted"}
                onClick={toggleCam}
                disabled={!connected}
                ariaLabel={camOn ? "Turn off camera" : "Turn on camera"}
              />
            )}
            {showVideo && (
              <CallButton
                icon={SwitchCamera}
                label="Flip"
                tone="glass"
                onClick={flipCamera}
                disabled={!connected || !camOn}
                ariaLabel="Flip camera"
              />
            )}
            <CallButton
              icon={PhoneOff}
              label="End"
              tone="danger"
              size="lg"
              onClick={() => handleEnd(false)}
              ariaLabel="End call"
            />
          </div>
        )}
      </div>
    </div>
  )
}
