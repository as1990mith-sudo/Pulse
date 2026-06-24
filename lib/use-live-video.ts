"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
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
  // True once the host's own camera track is attached + painting to the
  // self-view, so the UI can show a "starting camera" state instead of black.
  const [localVideoReady, setLocalVideoReady] = useState(false)
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
      // Attach the host's own camera the instant LiveKit confirms it's published.
      // This is the reliable signal that the local video track exists — relying
      // only on the post-`setCameraEnabled` attach can race and leave the
      // self-view painted black if the publish resolves on a later tick.
      // NOTE: we key off the publication *source/kind* rather than
      // `instanceof LocalVideoTrack`. The instanceof guard silently fails when
      // more than one copy of livekit-client is loaded (the track is a real
      // video track but a different class identity), which previously left the
      // host stuck on the "Starting camera…" wash — a black screen.
      .on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
        if (pub.source === Track.Source.Camera) {
          setCamOn(true)
          attachLocalVideo(room)
        }
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

    // Viewers: attach any host track that was already published before we
    // connected. New tracks still arrive via TrackSubscribed above.
    if (!isHost) attachRemoteTracks(room)

    // Only the host publishes camera + mic; viewers subscribe only.
    if (isHost) {
      try {
        await room.localParticipant.setMicrophoneEnabled(true)
      } catch {
        setMicOn(false)
      }

      // Enable the camera with one retry. Going live happens right after the
      // local preview's getUserMedia tracks are stopped, and on mobile the
      // camera hardware can still be releasing — the first acquire then fails
      // (NotReadableError) or hangs, which is what left the host on a black
      // screen. A short backoff lets the device free up before we retry.
      let cameraOk = false
      for (let attempt = 0; attempt < 2 && !cameraOk; attempt++) {
        try {
          await withTimeout(
            room.localParticipant.setCameraEnabled(true),
            12000,
            "Camera start timed out.",
          )
          cameraOk = true
        } catch {
          if (attempt === 0) await new Promise((r) => setTimeout(r, 600))
        }
      }

      if (cameraOk) {
        // The room flipped to "connected" before this resolved, so the self-view
        // attach effect may have run before the track existed — attach now.
        // (The LocalTrackPublished handler also covers this.)
        attachLocalVideo(room)
      } else {
        setCamOn(false)
        setError("We couldn't access your camera. Check your browser's camera permissions, then tap the camera button.")
      }
    }
  }, [token, serverUrl, isHost])

  // Attaches the host's remote video/audio to the viewer's elements. Used both
  // from the TrackSubscribed event and as a sweep over already-published tracks
  // (in case a track was live before our handler ran), so a viewer never gets
  // stranded on the "Connecting to the live…" wash with a black frame.
  function attachRemoteTracks(room: Room): boolean {
    let attachedVideo = false
    room.remoteParticipants.forEach((p) => {
      p.trackPublications.forEach((pub) => {
        const track = pub.track
        if (!track) return
        if (pub.kind === Track.Kind.Video && remoteVideoRef.current) {
          const el = remoteVideoRef.current
          track.attach(el)
          el.muted = true
          el.setAttribute("playsinline", "true")
          void el.play().catch(() => {})
          setRemoteVideoOn(true)
          attachedVideo = true
        }
        if (pub.kind === Track.Kind.Audio && remoteAudioRef.current) {
          track.attach(remoteAudioRef.current)
        }
      })
    })
    return attachedVideo
  }

  function attachLocalVideo(room: Room): boolean {
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera)
    const track = pub?.track
    const el = localVideoRef.current
    if (track && el) {
      track.attach(el)
      // On mobile (esp. Android Chrome) LiveKit's internal play() is frequently
      // rejected, leaving the camera active but the <video> painted black.
      // Force playback with the attributes that satisfy mobile autoplay policy.
      el.muted = true
      el.setAttribute("playsinline", "true")
      void el.play().catch(() => {})
      setLocalVideoReady(true)
      return true
    }
    return false
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

  // Safety net: while the host is connected with the camera on but the self-view
  // hasn't started painting yet, keep retrying the attach for a few seconds. The
  // camera track can publish a tick after `connected`/`camOn` flip (or the
  // <video> ref can mount a frame late), and without this poll the host would be
  // stranded on the dark "Starting camera…" wash — i.e. a black screen.
  useEffect(() => {
    if (!isHost || !connected || !camOn || localVideoReady) return
    const room = roomRef.current
    if (!room) return
    let tries = 0
    const id = setInterval(() => {
      tries += 1
      if (attachLocalVideo(room) || tries >= 24) clearInterval(id)
    }, 250)
    return () => clearInterval(id)
  }, [isHost, connected, camOn, localVideoReady])

  // Viewer safety net: while connected but the host's video hasn't painted yet,
  // keep sweeping for an available remote track. Covers the case where the
  // TrackSubscribed event fired before the <video> ref was ready, which would
  // otherwise leave the viewer on a black "Connecting…" frame.
  useEffect(() => {
    if (isHost || !connected || remoteVideoOn) return
    const room = roomRef.current
    if (!room) return
    let tries = 0
    const id = setInterval(() => {
      tries += 1
      if (attachRemoteTracks(room) || tries >= 24) clearInterval(id)
    }, 250)
    return () => clearInterval(id)
  }, [isHost, connected, remoteVideoOn])

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
    if (!next) setLocalVideoReady(false)
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
    localVideoReady,
    remoteVideoOn,
    participants,
    error,
    toggleMic,
    toggleCam,
    flipCamera,
    disconnect: cleanup,
  }
}
