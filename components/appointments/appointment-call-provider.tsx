"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import {
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client"
import { Loader2, Maximize2, Mic, MicOff, PhoneOff, SwitchCamera, Video, VideoOff, X } from "lucide-react"
import { CallButton } from "@/components/call-controls"
import { AppointmentAudioStage } from "@/components/appointments/appointment-audio-stage"
import { cn } from "@/lib/utils"
import { LIVE_MIC_CONSTRAINTS, LIVE_VOICE_PRESET } from "@/lib/live-audio-chain"
import { applyAudioRouting, prepareAudioRouting, releaseAudioRouting } from "@/lib/audio-routing"
import { getAppointmentMeetingToken } from "@/app/actions/home-appointments"
import { getGuestMeetingToken } from "@/app/actions/public-appointments"

/* -------------------------------------------------------------------------- */
/* Types + context                                                            */
/* -------------------------------------------------------------------------- */

type Creds = { url: string; token: string; roomName: string }

export type StartCallOptions = {
  /** Authenticated member/host path. */
  appointmentId?: string
  /** Public guest path (tokenised, no account). */
  manageToken?: string
  title: string
  counterpartName: string
  selfName?: string
  startWithVideo?: boolean
}

type CallContextValue = {
  startCall: (opts: StartCallOptions) => void
  endCall: () => void
  activeKey: string | null
}

const CallContext = createContext<CallContextValue | null>(null)

export function useAppointmentCall() {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error("useAppointmentCall must be used within AppointmentCallProvider")
  return ctx
}

const STORAGE_KEY = "frequency:activeAppointmentCall"

type PersistedCall = Omit<StartCallOptions, "startWithVideo">

/* -------------------------------------------------------------------------- */
/* Provider                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Owns the single LiveKit `Room` for an appointment call ABOVE the router, so it
 * survives navigation (route changes never unmount it). A page refresh is
 * unavoidable in a browser, so we warn via `beforeunload` while connected and
 * re-join the same room on next mount from a `sessionStorage` marker. Renders
 * the full-screen call or an in-app draggable PiP window depending on `minimized`
 * — deliberately NOT OS Picture-in-Picture, which can't offer reliable
 * close-vs-expand controls.
 */
export function AppointmentCallProvider({ children }: { children: React.ReactNode }) {
  const roomRef = useRef<Room | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const remoteVideoTrackRef = useRef<RemoteTrack | null>(null)
  const localVideoTrackRef = useRef<LocalVideoTrack | null>(null)

  const [session, setSession] = useState<StartCallOptions | null>(null)
  const [minimized, setMinimized] = useState(false)
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(false)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user")
  const [remoteVideoOn, setRemoteVideoOn] = useState(false)
  const [remotePresent, setRemotePresent] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [localSpeaking, setLocalSpeaking] = useState(false)
  const [remoteSpeaking, setRemoteSpeaking] = useState(false)

  const activeKey = session ? (session.appointmentId || session.manageToken || null) : null

  const teardown = useCallback(() => {
    const room = roomRef.current
    if (room) {
      room.disconnect()
      roomRef.current = null
      releaseAudioRouting()
    }
    remoteVideoTrackRef.current = null
    localVideoTrackRef.current = null
    setConnected(false)
    setReconnecting(false)
    setRemoteVideoOn(false)
    setRemotePresent(false)
    setElapsed(0)
    setLocalSpeaking(false)
    setRemoteSpeaking(false)
  }, [])

  const connect = useCallback(
    async (opts: StartCallOptions) => {
      if (roomRef.current) return
      setError(null)
      const startVideo = opts.startWithVideo ?? true
      setCamOn(startVideo)
      setMicOn(true)
      try {
        const creds: Creds = opts.manageToken
          ? await getGuestMeetingToken(opts.manageToken)
          : await getAppointmentMeetingToken(opts.appointmentId as string)

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: LIVE_MIC_CONSTRAINTS,
          publishDefaults: { audioPreset: LIVE_VOICE_PRESET, dtx: false, red: true },
        })
        roomRef.current = room

        room
          .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, _p: RemoteParticipant) => {
            if (track.kind === Track.Kind.Video) {
              remoteVideoTrackRef.current = track
              attachRemoteVideo()
              setRemoteVideoOn(true)
            }
            if (track.kind === Track.Kind.Audio && remoteAudioRef.current) {
              track.attach(remoteAudioRef.current)
              applyAudioRouting()
            }
          })
          .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
            if (track.kind === Track.Kind.Video) {
              remoteVideoTrackRef.current = null
              setRemoteVideoOn(false)
            }
            track.detach()
          })
          .on(RoomEvent.ParticipantConnected, () => setRemotePresent(true))
          .on(RoomEvent.ParticipantDisconnected, () => {
            setRemotePresent(false)
            setRemoteVideoOn(false)
            remoteVideoTrackRef.current = null
          })
          .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
            const localId = room.localParticipant.identity
            setLocalSpeaking(speakers.some((s) => s.identity === localId))
            setRemoteSpeaking(speakers.some((s) => s.identity !== localId))
          })
          .on(RoomEvent.Reconnecting, () => setReconnecting(true))
          .on(RoomEvent.Reconnected, () => setReconnecting(false))
          .on(RoomEvent.Disconnected, () => setConnected(false))

        prepareAudioRouting()
        await room.connect(creds.url, creds.token)
        await room.localParticipant.setMicrophoneEnabled(true, LIVE_MIC_CONSTRAINTS)
        if (startVideo) await room.localParticipant.setCameraEnabled(true)
        setRemotePresent(room.numParticipants > 0)
        setConnected(true)
        applyAudioRouting()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not join the meeting.")
      }
    },
    // attachRemoteVideo is stable (defined below via useCallback with no deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const startCall = useCallback(
    (opts: StartCallOptions) => {
      // Switching calls: tear the old one down first.
      if (roomRef.current) teardown()
      setSession(opts)
      setMinimized(false)
      const persisted: PersistedCall = {
        appointmentId: opts.appointmentId,
        manageToken: opts.manageToken,
        title: opts.title,
        counterpartName: opts.counterpartName,
        selfName: opts.selfName,
      }
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
      } catch {
        /* storage unavailable — refresh-rejoin simply won't apply */
      }
      void connect(opts)
    },
    [connect, teardown],
  )

  const endCall = useCallback(() => {
    teardown()
    setSession(null)
    setMinimized(false)
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [teardown])

  /* Re-attach the remote video to whichever view is currently mounted. */
  const attachRemoteVideo = useCallback(() => {
    const track = remoteVideoTrackRef.current
    if (!track) return
    const el = document.getElementById("appt-remote-video") as HTMLVideoElement | null
    if (el) track.attach(el)
  }, [])

  /* Re-attach the local self-view camera to the mounted view. */
  const attachLocalVideo = useCallback(() => {
    const room = roomRef.current
    if (!room) return
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera)
    const track = pub?.track
    if (track instanceof LocalVideoTrack) {
      localVideoTrackRef.current = track
      const el = document.getElementById("appt-local-video") as HTMLVideoElement | null
      if (el) track.attach(el)
    }
  }, [])

  // Whenever the view (full ↔ pip) or camera/remote video state changes, the
  // <video> nodes remount, so reattach the live tracks to the current elements.
  useEffect(() => {
    attachRemoteVideo()
    attachLocalVideo()
  }, [minimized, remoteVideoOn, camOn, connected, attachRemoteVideo, attachLocalVideo])

  // Elapsed timer.
  useEffect(() => {
    if (!connected) return
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [connected])

  // Warn before a refresh/close while a call is live, then rejoin on next mount.
  useEffect(() => {
    if (!session) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [session])

  // On first mount, auto-rejoin a call that survived a refresh.
  useEffect(() => {
    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(STORAGE_KEY)
    } catch {
      raw = null
    }
    if (!raw) return
    try {
      const p = JSON.parse(raw) as PersistedCall
      // Rejoin with camera off by default after a refresh — the user opts back in.
      startCall({ ...p, startWithVideo: false })
    } catch {
      try {
        sessionStorage.removeItem(STORAGE_KEY)
      } catch {
        /* ignore */
      }
    }
    // Run exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleMic = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !micOn
    await room.localParticipant.setMicrophoneEnabled(next, LIVE_MIC_CONSTRAINTS)
    setMicOn(next)
  }, [micOn])

  const toggleCam = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !camOn
    await room.localParticipant.setCameraEnabled(next)
    setCamOn(next)
    if (next) setTimeout(attachLocalVideo, 0)
  }, [camOn, attachLocalVideo])

  const switchCamera = useCallback(async () => {
    const room = roomRef.current
    if (!room || !camOn) return
    const next = facingMode === "user" ? "environment" : "user"
    await room.localParticipant.setCameraEnabled(true, { facingMode: next })
    setFacingMode(next)
    setTimeout(attachLocalVideo, 0)
  }, [camOn, facingMode, attachLocalVideo])

  const showVideo = camOn || remoteVideoOn
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0")
  const ss = String(elapsed % 60).padStart(2, "0")
  const elapsedLabel = connected ? `${mm}:${ss}` : reconnecting ? "Reconnecting…" : "Connecting…"

  const controls = {
    micOn,
    camOn,
    facingMode,
    toggleMic,
    toggleCam,
    switchCamera,
    endCall,
    connected,
    reconnecting,
    error,
    showVideo,
    remoteVideoOn,
    remotePresent,
    elapsedLabel,
    localSpeaking,
    remoteSpeaking,
    session,
  }

  return (
    <CallContext.Provider value={{ startCall, endCall, activeKey }}>
      {children}

      {/* One persistent audio sink, owned by the provider so remote audio never
          detaches when the view switches between full and PiP. */}
      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      {session && !minimized && <FullCall {...controls} onMinimize={() => setMinimized(true)} />}
      {session && minimized && <PipCall {...controls} onExpand={() => setMinimized(false)} />}
    </CallContext.Provider>
  )
}

/* -------------------------------------------------------------------------- */
/* Full-screen call                                                           */
/* -------------------------------------------------------------------------- */

type ViewProps = {
  micOn: boolean
  camOn: boolean
  facingMode: "user" | "environment"
  toggleMic: () => void
  toggleCam: () => void
  switchCamera: () => void
  endCall: () => void
  connected: boolean
  reconnecting: boolean
  error: string | null
  showVideo: boolean
  remoteVideoOn: boolean
  remotePresent: boolean
  elapsedLabel: string
  localSpeaking: boolean
  remoteSpeaking: boolean
  session: StartCallOptions | null
}

function FullCall(props: ViewProps & { onMinimize: () => void }) {
  const {
    micOn,
    camOn,
    facingMode,
    toggleMic,
    toggleCam,
    switchCamera,
    endCall,
    connected,
    reconnecting,
    error,
    showVideo,
    remoteVideoOn,
    remotePresent,
    elapsedLabel,
    localSpeaking,
    remoteSpeaking,
    session,
    onMinimize,
  } = props

  const selfName = session?.selfName ?? "You"
  const counterpartName = session?.counterpartName ?? "Guest"

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-neutral-950 text-white">
      <div className="relative flex-1 overflow-hidden">
        {/* Remote video (kept mounted; opacity toggles so the track element is
            stable for re-attach). */}
        <video
          id="appt-remote-video"
          autoPlay
          playsInline
          className={cn("absolute inset-0 h-full w-full object-cover", remoteVideoOn ? "opacity-100" : "opacity-0")}
        />

        {/* Audio-only premium stage when no camera is on anywhere. */}
        {!showVideo && (
          <div className="absolute inset-0">
            {error ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-balance text-lg font-medium">{error}</p>
                <button
                  type="button"
                  onClick={endCall}
                  className="mt-1 rounded-full bg-white/10 px-5 py-2 text-sm ring-1 ring-inset ring-white/15 backdrop-blur-md transition hover:bg-white/20"
                >
                  Close
                </button>
              </div>
            ) : (
              <AppointmentAudioStage
                selfName={selfName}
                counterpartName={counterpartName}
                selfSpeaking={localSpeaking && micOn}
                counterpartSpeaking={remoteSpeaking}
                counterpartPresent={remotePresent}
                elapsedLabel={elapsedLabel}
              />
            )}
          </div>
        )}

        {/* Self-view when the camera is on. */}
        {camOn && (
          <video
            id="appt-local-video"
            autoPlay
            playsInline
            muted
            className={cn(
              "absolute right-4 top-4 h-[168px] w-[116px] rounded-2xl object-cover shadow-lg ring-1 ring-white/20",
              facingMode === "user" && "-scale-x-100",
            )}
          />
        )}

        {/* Top row: minimize + timer/status. */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={onMinimize}
            aria-label="Minimize call"
            className="flex size-9 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-md transition hover:bg-black/60"
          >
            <Maximize2 className="size-4 rotate-180" />
          </button>
          <div className="rounded-full bg-black/40 px-3 py-1 text-xs font-medium tabular-nums text-white/85 backdrop-blur-md">
            {reconnecting ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" />
                Reconnecting…
              </span>
            ) : connected ? (
              elapsedLabel
            ) : (
              "Connecting…"
            )}
          </div>
          <span className="size-9" />
        </div>

        {/* Waiting / connecting hint over video mode. */}
        {showVideo && !remoteVideoOn && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            {!connected ? (
              <>
                <Loader2 className="size-8 animate-spin text-white/70" />
                <p className="text-sm text-white/70">Connecting to your meeting…</p>
              </>
            ) : (
              <>
                <div className="flex size-16 items-center justify-center rounded-full bg-white/10 ring-1 ring-inset ring-white/15">
                  <Video className="size-7 text-white/70" />
                </div>
                <p className="text-sm text-white/70">
                  {remotePresent ? "Waiting for camera…" : `Waiting for ${counterpartName} to join…`}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Control dock. */}
      <div className="flex items-center justify-center gap-5 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
        <CallButton
          icon={micOn ? Mic : MicOff}
          tone={micOn ? "glass" : "muted"}
          onClick={toggleMic}
          ariaLabel={micOn ? "Mute microphone" : "Unmute microphone"}
        />
        <CallButton
          icon={camOn ? Video : VideoOff}
          tone={camOn ? "glass" : "muted"}
          onClick={toggleCam}
          ariaLabel={camOn ? "Turn off camera" : "Turn on camera"}
        />
        {camOn && (
          <CallButton icon={SwitchCamera} tone="glass" onClick={switchCamera} ariaLabel="Switch camera" />
        )}
        <CallButton icon={PhoneOff} tone="danger" size="lg" onClick={endCall} ariaLabel="Leave meeting" />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Minimized PiP window                                                       */
/* -------------------------------------------------------------------------- */

function PipCall(props: ViewProps & { onExpand: () => void }) {
  const {
    micOn,
    toggleMic,
    endCall,
    showVideo,
    remoteVideoOn,
    remotePresent,
    elapsedLabel,
    localSpeaking,
    remoteSpeaking,
    session,
    onExpand,
  } = props

  const counterpartName = session?.counterpartName ?? "Guest"
  const selfName = session?.selfName ?? "You"

  // Draggable position (persisted for the session so it doesn't jump around).
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 16, y: 96 })
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    d.moved = true
    const w = 150
    const h = 210
    const x = Math.min(Math.max(8, e.clientX - d.dx), window.innerWidth - w - 8)
    const y = Math.min(Math.max(8, e.clientY - d.dy), window.innerHeight - h - 8)
    setPos({ x, y })
  }
  const onPointerUp = () => {
    const moved = dragRef.current?.moved
    dragRef.current = null
    if (!moved) onExpand()
  }

  return (
    <div
      className="fixed z-[55] w-[150px] overflow-hidden rounded-2xl border border-white/15 bg-neutral-950 text-white shadow-2xl shadow-black/60"
      style={{ left: pos.x, top: pos.y, touchAction: "none" }}
    >
      <div
        className="relative aspect-[5/7] cursor-pointer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <video
          id="appt-remote-video"
          autoPlay
          playsInline
          className={cn("absolute inset-0 h-full w-full object-cover", remoteVideoOn ? "opacity-100" : "opacity-0")}
        />
        {!showVideo && (
          <AppointmentAudioStage
            selfName={selfName}
            counterpartName={counterpartName}
            selfSpeaking={localSpeaking && micOn}
            counterpartSpeaking={remoteSpeaking}
            counterpartPresent={remotePresent}
            elapsedLabel={elapsedLabel}
            compact
          />
        )}
        {/* Expand affordance. */}
        <span className="pointer-events-none absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/45 backdrop-blur-md">
          <Maximize2 className="size-3" />
        </span>
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] font-medium tabular-nums backdrop-blur-md">
          {elapsedLabel}
        </span>
      </div>

      {/* Quick controls. */}
      <div className="flex items-center justify-center gap-4 bg-black/60 py-2">
        <button
          type="button"
          onClick={toggleMic}
          aria-label={micOn ? "Mute" : "Unmute"}
          className={cn(
            "flex size-8 items-center justify-center rounded-full transition",
            micOn ? "bg-white/10 text-white hover:bg-white/20" : "bg-white text-neutral-900",
          )}
        >
          {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
        </button>
        <button
          type="button"
          onClick={endCall}
          aria-label="Leave meeting"
          className="flex size-8 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition hover:brightness-110"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
