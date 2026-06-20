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
      const room = new Room({ adaptiveStream: true, dynacast: true })
      roomRef.current = room

      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, _p: RemoteParticipant) => {
          if (track.kind === Track.Kind.Audio && audioContainerRef.current) {
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
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <p className="truncate font-semibold">{roomTitle}</p>
              <p className="text-xs text-muted-foreground">
                {participants.length} {participants.length === 1 ? "person" : "people"} on the call
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3">
              {participants.map((p) => (
                <ParticipantTile key={p.sid || p.identity} participant={p} />
              ))}
            </div>
            {error && (
              <p className="mx-auto mt-4 w-fit rounded-full bg-destructive px-4 py-1.5 text-sm text-destructive-foreground">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-center gap-4 border-t border-border bg-card px-6 py-6">
            <Button
              size="icon"
              variant={micOn ? "secondary" : "destructive"}
              className="size-12 rounded-full"
              onClick={toggleMic}
              aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
            >
              {micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
            </Button>
            <Button
              size="icon"
              variant={camOn ? "secondary" : "destructive"}
              className="size-12 rounded-full"
              onClick={toggleCam}
              aria-label={camOn ? "Turn off camera" : "Turn on camera"}
            >
              {camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
            </Button>
            <Button
              size="icon"
              variant="destructive"
              className="size-12 rounded-full"
              onClick={leave}
              aria-label="Leave call"
            >
              <PhoneOff className="size-5" />
            </Button>
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
    <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-card">
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
        <Avatar className="size-16">
          <AvatarFallback className={cn("text-xl text-white", color)}>{initials}</AvatarFallback>
        </Avatar>
      )}
      <span className="absolute bottom-2 left-2 max-w-[80%] truncate rounded-md bg-background/70 px-2 py-0.5 text-xs font-medium backdrop-blur">
        {isLocal ? "You" : name}
      </span>
    </div>
  )
}
