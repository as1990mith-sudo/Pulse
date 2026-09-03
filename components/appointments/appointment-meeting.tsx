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
import { Mic, MicOff, PhoneOff, Video, VideoOff, SwitchCamera, Loader2 } from "lucide-react"
import { CallButton } from "@/components/call-controls"
import { cn } from "@/lib/utils"
import { LIVE_MIC_CONSTRAINTS, LIVE_VOICE_PRESET } from "@/lib/live-audio-chain"
import { applyAudioRouting, prepareAudioRouting, releaseAudioRouting } from "@/lib/audio-routing"
import { getAppointmentMeetingToken } from "@/app/actions/home-appointments"

/**
 * The native "Join Meeting" surface for an appointment. A ring-less, private
 * LiveKit room keyed to the appointment (`appt-<id>`): both participants open it
 * directly and connect as equals. It inherits its participants, permissions,
 * duration and host identity from the appointment via the server token — an
 * unauthorised user can never obtain a token, so it cannot leak into a public
 * live session. Audio is always on; video is opt-in.
 */
export function AppointmentMeeting({
  appointmentId,
  startWithVideo = false,
  onClose,
}: {
  appointmentId: string
  startWithVideo?: boolean
  onClose: () => void
}) {
  const roomRef = useRef<Room | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)

  const [connected, setConnected] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(startWithVideo)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user")
  const [remoteVideoOn, setRemoteVideoOn] = useState(false)
  const [remotePresent, setRemotePresent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const cleanup = useCallback(() => {
    const room = roomRef.current
    if (room) {
      room.disconnect()
      roomRef.current = null
      releaseAudioRouting()
    }
  }, [])

  const connect = useCallback(async () => {
    if (roomRef.current) return
    try {
      const creds = await getAppointmentMeetingToken(appointmentId)
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: LIVE_MIC_CONSTRAINTS,
        publishDefaults: {
          audioPreset: LIVE_VOICE_PRESET,
          dtx: false,
          red: true,
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
            applyAudioRouting()
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Video) setRemoteVideoOn(false)
          track.detach()
        })
        .on(RoomEvent.ParticipantConnected, () => setRemotePresent(true))
        .on(RoomEvent.ParticipantDisconnected, () => {
          setRemotePresent(false)
          setRemoteVideoOn(false)
        })
        .on(RoomEvent.Disconnected, () => {
          setConnected(false)
        })

      prepareAudioRouting()
      await room.connect(creds.url, creds.token)
      await room.localParticipant.setMicrophoneEnabled(true, LIVE_MIC_CONSTRAINTS)
      if (startWithVideo) {
        await room.localParticipant.setCameraEnabled(true)
      }
      setRemotePresent(room.numParticipants > 0)
      setConnected(true)
      applyAudioRouting()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the meeting.")
    }
  }, [appointmentId, startWithVideo])

  useEffect(() => {
    connect()
    return cleanup
  }, [connect, cleanup])

  // Attach the local camera preview whenever the camera turns on.
  useEffect(() => {
    const room = roomRef.current
    if (!room || !connected) return
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera)
    const track = pub?.track
    if (camOn && track instanceof LocalVideoTrack && localVideoRef.current) {
      track.attach(localVideoRef.current)
    }
  }, [camOn, connected, facingMode])

  // Elapsed timer once connected.
  useEffect(() => {
    if (!connected) return
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [connected])

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
  }, [camOn])

  const switchCamera = useCallback(async () => {
    const room = roomRef.current
    if (!room || !camOn) return
    const next = facingMode === "user" ? "environment" : "user"
    await room.localParticipant.setCameraEnabled(true, { facingMode: next })
    setFacingMode(next)
  }, [camOn, facingMode])

  const leave = useCallback(() => {
    cleanup()
    onClose()
  }, [cleanup, onClose])

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0")
  const ss = String(elapsed % 60).padStart(2, "0")

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-neutral-950 text-white">
      {/* Remote video fills the screen when present; otherwise a calm status. */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={cn("absolute inset-0 h-full w-full object-cover", remoteVideoOn ? "opacity-100" : "opacity-0")}
        />
        <audio ref={remoteAudioRef} autoPlay />

        {!remoteVideoOn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            {error ? (
              <>
                <p className="text-balance text-lg font-medium">{error}</p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-1 rounded-full bg-white/10 px-5 py-2 text-sm ring-1 ring-inset ring-white/15 backdrop-blur-md transition hover:bg-white/20"
                >
                  Close
                </button>
              </>
            ) : !connected ? (
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
                  {remotePresent ? "Waiting for camera…" : "Waiting for the other participant to join…"}
                </p>
              </>
            )}
          </div>
        )}

        {/* Local self-view when the camera is on. */}
        {camOn && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "absolute right-4 top-4 h-[168px] w-[116px] rounded-2xl object-cover shadow-lg ring-1 ring-white/20",
              // Mirror the front (selfie) camera so the self-view reads like a
              // mirror; the back camera stays un-mirrored so scenes/text aren't
              // reversed.
              facingMode === "user" && "-scale-x-100",
            )}
          />
        )}

        {/* Elapsed timer badge. */}
        {connected && (
          <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-xs font-medium tabular-nums text-white/80 backdrop-blur-md">
            {mm}:{ss}
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
          label={micOn ? "Mute" : "Unmute"}
        />
        <CallButton
          icon={camOn ? Video : VideoOff}
          tone={camOn ? "glass" : "muted"}
          onClick={toggleCam}
          ariaLabel={camOn ? "Turn off camera" : "Turn on camera"}
          label={camOn ? "Video" : "Video"}
        />
        {camOn && (
          <CallButton icon={SwitchCamera} tone="glass" onClick={switchCamera} ariaLabel="Switch camera" label="Flip" />
        )}
        <CallButton icon={PhoneOff} tone="danger" size="lg" onClick={leave} ariaLabel="Leave meeting" label="Leave" />
      </div>
    </div>
  )
}
