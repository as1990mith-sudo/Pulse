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
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { startRingtone } from "@/lib/ringtone"
import { ackCall, acceptCall, endCall, getCallToken, type DmCallView } from "@/app/actions/dm-call"

type Peer = {
  name: string
  initials: string
  color: string
  image: string | null
}

/**
 * Full-screen 1:1 call surface for DMs. Handles three states:
 *  - incoming  : callee sees accept/decline for a ringing call
 *  - outgoing   : caller sees "ringing…" with cancel
 *  - active     : both connect to LiveKit, audio always + optional video
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
      const room = new Room({ adaptiveStream: true, dynacast: true })
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
        await room.localParticipant.setCameraEnabled(true)
        attachLocalVideo(room)
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
    if (next) attachLocalVideo(room)
    setCamOn(next)
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Remote media layer */}
      <audio ref={remoteAudioRef} autoPlay className="hidden" />
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {showVideo && (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={cn("h-full w-full object-cover", remoteVideoOn ? "block" : "hidden")}
          />
        )}

        {/* Avatar shown until/unless remote video is live */}
        {(!showVideo || !remoteVideoOn) && (
          <div className="flex flex-col items-center gap-4 text-center">
            <Avatar className="size-28">
              {peer.image && <AvatarImage src={peer.image || "/placeholder.svg"} alt={peer.name} />}
              <AvatarFallback className={cn("text-3xl text-white", peer.color)}>{peer.initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-xl font-semibold">{peer.name}</p>
              <p className="text-sm text-muted-foreground">
                {phase === "prompt"
                  ? `Incoming ${call.mode} call…`
                  : isLive
                    ? // Connected: show the live, ticking call duration.
                      formatDuration(elapsed)
                    : call.isCaller
                      ? // Caller: "Calling" until the callee's device rings, then "Ringing".
                        call.calleeAck
                        ? "Ringing…"
                        : "Calling…"
                      : "Connecting…"}
              </p>
            </div>
          </div>
        )}

        {/* Local video preview (picture-in-picture) */}
        {showVideo && camOn && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            // Mirror the local self-view so it reads like a mirror to the user.
            className="absolute bottom-4 right-4 h-40 w-28 -scale-x-100 rounded-xl border border-border object-cover shadow-lg"
          />
        )}

        {error && (
          <p className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-destructive px-4 py-1.5 text-sm text-destructive-foreground">
            {error}
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 border-t border-border bg-card px-6 py-6">
        {phase === "prompt" ? (
          <div className="flex w-full max-w-sm items-center justify-center gap-10">
            {/* Decline (red) */}
            <div className="flex flex-col items-center gap-2">
              <Button
                size="icon"
                className="size-16 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => handleEnd(true)}
                aria-label="Decline call"
              >
                <PhoneOff className="size-7" />
              </Button>
              <span className="text-sm font-medium text-muted-foreground">Decline</span>
            </div>
            {/* Answer (green) */}
            <div className="flex flex-col items-center gap-2">
              <Button
                size="icon"
                className="size-16 rounded-full bg-call-accept text-call-accept-foreground hover:bg-call-accept/90"
                onClick={handleAccept}
                aria-label="Answer call"
              >
                <Phone className="size-7" />
              </Button>
              <span className="text-sm font-medium text-muted-foreground">Answer</span>
            </div>
          </div>
        ) : (
          <>
            <Button
              size="icon"
              variant={micOn ? "secondary" : "destructive"}
              className="size-12 rounded-full"
              onClick={toggleMic}
              disabled={!connected}
              aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
            >
              {micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
            </Button>
            {showVideo && (
              <Button
                size="icon"
                variant={camOn ? "secondary" : "destructive"}
                className="size-12 rounded-full"
                onClick={toggleCam}
                disabled={!connected}
                aria-label={camOn ? "Turn off camera" : "Turn on camera"}
              >
                {camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
              </Button>
            )}
            <Button
              size="icon"
              variant="destructive"
              className="size-12 rounded-full"
              onClick={() => handleEnd(false)}
              aria-label="End call"
            >
              <PhoneOff className="size-5" />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
