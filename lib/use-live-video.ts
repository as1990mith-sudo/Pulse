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

/**
 * Shared LiveKit plumbing for video live streams, modeled on the proven 1:1 DM
 * call flow. Handles connecting to a room, publishing the host's camera + mic,
 * subscribing to the host's video as a viewer, and the host controls
 * (mute, camera on/off, flip camera). Self-view/remote attachment is done via
 * effects so the <video> elements are mounted before we attach tracks.
 */
export function useLiveVideo({
  token,
  serverUrl,
  isHost,
}: {
  token: string | null
  serverUrl: string | null
  isHost: boolean
}) {
  const roomRef = useRef<Room | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)

  const [connected, setConnected] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user")
  const [remoteVideoOn, setRemoteVideoOn] = useState(false)
  const [participants, setParticipants] = useState(0)
  const [error, setError] = useState<string | null>(null)

  function syncParticipants(room: Room) {
    // Total people connected = remote participants + self.
    setParticipants(room.remoteParticipants.size + 1)
  }

  const cleanup = useCallback(() => {
    const room = roomRef.current
    if (room) {
      room.disconnect()
      roomRef.current = null
    }
  }, [])

  const connect = useCallback(async () => {
    if (roomRef.current || !token || !serverUrl) return
    try {
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
        .on(RoomEvent.ParticipantConnected, () => syncParticipants(room))
        .on(RoomEvent.ParticipantDisconnected, () => syncParticipants(room))
        .on(RoomEvent.Disconnected, () => setConnected(false))

      await room.connect(serverUrl, token)
      syncParticipants(room)

      // Only the host publishes camera + mic; viewers subscribe only.
      if (isHost) {
        await room.localParticipant.setMicrophoneEnabled(true)
        await room.localParticipant.setCameraEnabled(true)
      }
      setConnected(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to the stream.")
    }
  }, [token, serverUrl, isHost])

  function attachLocalVideo(room: Room) {
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera)
    const track = pub?.track
    if (track instanceof LocalVideoTrack && localVideoRef.current) {
      track.attach(localVideoRef.current)
    }
  }

  // Connect on mount once we have credentials; tear down on unmount.
  useEffect(() => {
    if (token && serverUrl) void connect()
    return () => cleanup()
  }, [token, serverUrl, connect, cleanup])

  // (Re)attach the host's camera to the self-view whenever it becomes visible.
  useEffect(() => {
    if (!isHost || !camOn || !connected) return
    const room = roomRef.current
    if (room) attachLocalVideo(room)
  }, [isHost, camOn, connected])

  const toggleMic = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !micOn
    await room.localParticipant.setMicrophoneEnabled(next)
    setMicOn(next)
  }, [micOn])

  const toggleCam = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !camOn
    await room.localParticipant.setCameraEnabled(next)
    setCamOn(next)
  }, [camOn])

  const flipCamera = useCallback(async () => {
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
  }, [facingMode])

  return {
    localVideoRef,
    remoteVideoRef,
    remoteAudioRef,
    connected,
    micOn,
    camOn,
    facingMode,
    remoteVideoOn,
    participants,
    error,
    toggleMic,
    toggleCam,
    flipCamera,
    disconnect: cleanup,
  }
}
