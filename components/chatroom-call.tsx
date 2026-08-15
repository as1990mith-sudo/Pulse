"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import {
  ParticipantEvent,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client"
import { Mic, MicOff, PhoneOff, Users, Video, VideoOff } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { CallButton } from "@/components/call-controls"
import { cn } from "@/lib/utils"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { getChatroomCallStatus, getChatroomCallToken } from "@/app/actions/chatroom-call"

/**
 * Presence-based group call for a chatroom. Any member can start or join the
 * shared LiveKit room — there is no per-person ringing. While someone is on the
 * call, every other member sees a "Join" banner. Joining opens a full-screen
 * grid with mic/camera controls and one tile per participant.
 */
export function ChatroomCall({
  chatroomId,
  roomTitle,
  startNonce,
}: {
  chatroomId: number
  roomTitle: string
  startNonce: number
}) {
  const roomRef = useRef<Room | null>(null)
  const audioContainerRef = useRef<HTMLDivElement>(null)

  const [joined, setJoined] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])

  // Poll who's currently on the call so members see the join banner.
  const { data: status, mutate: mutateStatus } = useSWR(
    ["chatroom-call", chatroomId],
    () => getChatroomCallStatus({ chatroomId }),
    { refreshInterval: 3000, revalidateOnFocus: true },
  )

  const refreshParticipants = useCallback(() => {
    const room = roomRef.current
    if (!room) return
    setParticipants([room.localParticipant, ...Array.from(room.remoteParticipants.values())])
  }, [])

  const leave = useCallback(() => {
    const room = roomRef.current
    if (room) {
      room.disconnect()
      roomRef.current = null
    }
    setJoined(false)
    setParticipants([])
    setCamOn(false)
    setMicOn(true)
    void mutateStatus()
  }, [mutateStatus])

  const join = useCallback(async () => {
    if (roomRef.current || connecting) return
    setConnecting(true)
    setError(null)
    try {
      const creds = await getChatroomCallToken({ chatroomId })
      if (!creds) {
        setError("Calling is not configured for this app.")
        return
      }
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        // Acoustic echo cancellation on so no participant hears their own voice
        // returned via another caller's speaker/mic. Matches the global policy.
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      roomRef.current = room

      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, _p: RemoteParticipant) => {
          if (track.kind === Track.Kind.Audio && audioContainerRef.current) {
            // Idempotent: detach any element already bound to this remote track
            // before appending a fresh one, so a re-subscribe / reconnect can't
            // leave a second element playing the same voice (duplicate audio).
            track.detach().forEach((prev) => prev.remove())
            const el = track.attach()
            el.autoplay = true
            audioContainerRef.current.appendChild(el)
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => track.detach().forEach((el) => el.remove()))
        .on(RoomEvent.ParticipantConnected, refreshParticipants)
        .on(RoomEvent.ParticipantDisconnected, refreshParticipants)
        .on(RoomEvent.Disconnected, () => leave())

      await room.connect(creds.url, creds.token)
      await room.localParticipant.setMicrophoneEnabled(true)
      setJoined(true)
      setMicOn(true)
      refreshParticipants()
      void mutateStatus()
    } catch (e) {
      roomRef.current = null
      setError(e instanceof Error ? e.message : "Could not join the call.")
    } finally {
      setConnecting(false)
    }
  }, [chatroomId, connecting, leave, refreshParticipants, mutateStatus])

  // Header "Start/Join call" button bumps startNonce.
  const handledNonce = useRef(startNonce)
  useEffect(() => {
    if (startNonce !== handledNonce.current) {
      handledNonce.current = startNonce
      if (!joined) void join()
    }
  }, [startNonce, joined, join])

  useEffect(() => () => {
    roomRef.current?.disconnect()
    roomRef.current = null
  }, [])

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
    setCamOn(next)
    refreshParticipants()
  }

  // Join banner: a call is live and we haven't joined it yet.
  const showBanner = !joined && status?.active && status.participants.length > 0

  return (
    <>
      <div ref={audioContainerRef} className="hidden" aria-hidden="true" />

      {showBanner && (
        <div className="flex items-center gap-3 border-b border-border/60 bg-call-accept/10 px-4 py-2.5 sm:px-6">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-call-accept/20 text-call-accept">
            <Users className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">Voice call in progress</p>
            <p className="truncate text-xs text-muted-foreground">
              {status!.participants.length} {status!.participants.length === 1 ? "person" : "people"} in the call
            </p>
          </div>
          <div className="flex -space-x-2">
            {status!.participants.slice(0, 3).map((p) => (
              <Avatar key={p.userId} className="size-7 border-2 border-background">
                <AvatarFallback className={cn("text-[10px]", p.color)}>{p.initials}</AvatarFallback>
              </Avatar>
            ))}
          </div>
          <Button
            size="sm"
            className="shrink-0 gap-1.5 bg-call-accept text-call-accept-foreground hover:bg-call-accept/90"
            onClick={() => void join()}
            disabled={connecting}
          >
            Join
          </Button>
        </div>
      )}

      {joined && (
        <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-neutral-950 text-white">
          {/* Ambient cinematic background */}
          <div
            aria-hidden="true"
            className="call-ambient pointer-events-none absolute -left-24 -top-24 size-[28rem] rounded-full bg-primary/20 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="call-ambient pointer-events-none absolute -bottom-32 -right-24 size-[26rem] rounded-full bg-call-accept/15 blur-3xl"
            style={{ animationDelay: "-6s" }}
          />

          {/* Header */}
          <div className="relative z-10 flex items-center justify-center px-6 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
            <div className="flex max-w-full items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium text-white/80 ring-1 ring-inset ring-white/15 backdrop-blur-md">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-call-accept opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-call-accept" />
              </span>
              <span className="truncate">{roomTitle}</span>
              <span aria-hidden="true" className="text-white/30">
                ·
              </span>
              <span className="shrink-0">
                {participants.length} {participants.length === 1 ? "person" : "people"}
              </span>
            </div>
          </div>

          {/* Participant grid */}
          <div className="relative z-10 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            <div
              className={cn(
                "mx-auto grid w-full max-w-3xl gap-3",
                participants.length <= 1 ? "max-w-md grid-cols-1" : "grid-cols-2 sm:grid-cols-3",
              )}
            >
              {participants.map((p) => (
                <ParticipantTile key={p.sid || p.identity} participant={p} />
              ))}
            </div>
            {error && (
              <p className="mx-auto mt-4 w-fit rounded-full bg-destructive px-4 py-1.5 text-sm font-medium text-destructive-foreground shadow-lg">
                {error}
              </p>
            )}
          </div>

          {/* Control dock */}
          <div className="relative z-10 flex justify-center px-6 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
            <div className="flex items-end gap-5 rounded-[2.25rem] bg-white/5 px-6 py-5 ring-1 ring-inset ring-white/10 backdrop-blur-2xl">
              <CallButton
                icon={micOn ? Mic : MicOff}
                label={micOn ? "Mute" : "Unmute"}
                tone={micOn ? "glass" : "muted"}
                onClick={toggleMic}
                ariaLabel={micOn ? "Mute microphone" : "Unmute microphone"}
              />
              <CallButton
                icon={camOn ? Video : VideoOff}
                label={camOn ? "Camera" : "Camera off"}
                tone={camOn ? "glass" : "muted"}
                onClick={toggleCam}
                ariaLabel={camOn ? "Turn off camera" : "Turn on camera"}
              />
              <CallButton
                icon={PhoneOff}
                label="Leave"
                tone="danger"
                size="lg"
                onClick={leave}
                ariaLabel="Leave call"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** A single participant's tile: live camera when on, avatar otherwise. */
function ParticipantTile({ participant }: { participant: Participant }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hasVideo, setHasVideo] = useState(false)

  useEffect(() => {
    function sync() {
      const pub = participant.getTrackPublication(Track.Source.Camera)
      const track = pub?.track
      if (track && !pub?.isMuted && videoRef.current) {
        track.attach(videoRef.current)
        setHasVideo(true)
      } else {
        setHasVideo(false)
      }
    }
    sync()
    participant
      .on(ParticipantEvent.TrackSubscribed, sync)
      .on(ParticipantEvent.TrackUnsubscribed, sync)
      .on(ParticipantEvent.TrackMuted, sync)
      .on(ParticipantEvent.TrackUnmuted, sync)
      .on(ParticipantEvent.LocalTrackPublished, sync)
      .on(ParticipantEvent.LocalTrackUnpublished, sync)
    return () => {
      participant
        .off(ParticipantEvent.TrackSubscribed, sync)
        .off(ParticipantEvent.TrackUnsubscribed, sync)
        .off(ParticipantEvent.TrackMuted, sync)
        .off(ParticipantEvent.TrackUnmuted, sync)
        .off(ParticipantEvent.LocalTrackPublished, sync)
        .off(ParticipantEvent.LocalTrackUnpublished, sync)
    }
  }, [participant])

  const name = participant.name || participant.identity
  const initials = getInitials(name)
  const color = getAvatarColor(participant.identity)
  const isLocal = participant.isLocal

  return (
    <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-3xl bg-white/5 ring-1 ring-inset ring-white/10">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        // Mirror only the local self-view so it reads like a mirror; remote
        // participants are shown un-mirrored.
        className={cn("h-full w-full object-cover", isLocal && "-scale-x-100", hasVideo ? "block" : "hidden")}
      />
      {!hasVideo && (
        <Avatar className="size-20 shadow-xl ring-2 ring-white/10">
          <AvatarFallback className={cn("text-2xl font-semibold text-white", color)}>{initials}</AvatarFallback>
        </Avatar>
      )}
      <span className="absolute bottom-2 left-2 max-w-[80%] truncate rounded-lg bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
        {isLocal ? "You" : name}
      </span>
    </div>
  )
}
