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

/** Reject a promise if it doesn't settle within `ms`, with a friendly message. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

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
    const room = new Room({ adaptiveStream: true, dynacast: true })
    roomRef.current = room

    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, _p: RemoteParticipant) => {
        if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
          const el = remoteVideoRef.current
          track.attach(el)
          el.muted = true
          el.setAttribute("playsinline", "true")
          // Force playback so viewers on mobile don't get a black frame.
          void el.play().catch(() => {})
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

    try {
      // Time-box the socket connection so a hung handshake can't strand the
      // host on a permanent "Going live…" screen.
      await withTimeout(
        room.connect(serverUrl, token),
        20000,
        "Connecting to the live server timed out. Please try again.",
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to the stream.")
      // Tear down the half-open room so a retry can start cleanly.
      room.disconnect()
      roomRef.current = null
      return
    }

    syncParticipants(room)
    // The room is up — mark connected immediately so the UI leaves the loading
    // state. Camera/mic publishing below is best-effort and must NOT block this.
    setConnected(true)

    // Only the host publishes camera + mic; viewers subscribe only.
    if (isHost) {
      try {
        await room.localParticipant.setMicrophoneEnabled(true)
      } catch {
        setMicOn(false)
      }
      try {
        await room.localParticipant.setCameraEnabled(true)
        // The room flipped to "connected" before this resolved, so the self-view
        // attach effect may have run before the track existed — attach now.
        attachLocalVideo(room)
      } catch {
        setCamOn(false)
        setError("We couldn't access your camera. Check your browser's camera permissions, then tap the camera button.")
      }
    }
  }, [token, serverUrl, isHost])

  function attachLocalVideo(room: Room) {
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera)
    const track = pub?.track
    const el = localVideoRef.current
    if (track instanceof LocalVideoTrack && el) {
      track.attach(el)
      // On mobile (esp. Android Chrome) LiveKit's internal play() is frequently
      // rejected, leaving the camera active but the <video> painted black.
      // Force playback with the attributes that satisfy mobile autoplay policy.
      el.muted = true
      el.setAttribute("playsinline", "true")
      void el.play().catch(() => {})
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
