"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  LocalAudioTrack,
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

function parseImage(metadata: string | undefined): string | null {
  if (!metadata) return null
  try {
    return (JSON.parse(metadata) as { image?: string | null }).image ?? null
  } catch {
    return null
  }
}

/**
 * Best-effort detection of an Android/iOS in-app WebView (e.g. an app wrapped as
 * an APK). These containers only expose the camera/mic to web content if the
 * native shell is configured to grant it (Android: WebChromeClient
 * .onPermissionRequest + CAMERA/RECORD_AUDIO manifest permissions). When that
 * isn't wired up, getUserMedia fails even though the same site works in Chrome.
 */
function isInAppWebView(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent || ""
  // Android System WebView ("; wv") or common wrappers (Median/GoNative, Capacitor, Cordova).
  return /; wv\)|Median|GoNative|Capacitor|Cordova/i.test(ua)
}

/**
 * Turn a getUserMedia / LiveKit device error into a precise, human message.
 * Distinguishing the cases avoids showing a misleading "check your permissions"
 * note in a browser where permission was already granted (it might just be a
 * transient timeout or the camera being used by another app).
 */
function describeMediaError(err: unknown): string {
  const name = err instanceof Error ? err.name : ""
  const message = err instanceof Error ? err.message : ""

  if (name === "NotAllowedError" || name === "SecurityError" || /permission|denied/i.test(message)) {
    if (isInAppWebView()) {
      return "Camera/microphone access is blocked by the app. The app needs camera and microphone permission enabled — open this stream in your phone's browser, or update the app to allow camera access."
    }
    return "Camera access was blocked. Allow camera and microphone for this site in your browser settings, then tap the camera button to try again."
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device. Connect a camera, then tap the camera button to try again."
  }
  if (name === "NotReadableError") {
    return "Your camera is being used by another app. Close it, then tap the camera button to try again."
  }
  if (/timed out/i.test(message)) {
    return "Starting your camera took too long. Tap the camera button to try again."
  }
  return "We couldn't start your camera. Tap the camera button to try again."
}

/** A remote participant publishing into the room (the host or an accepted guest). */
export type RemotePeer = {
  identity: string
  name: string
  image: string | null
  isHost: boolean
  hasVideo: boolean
}

/**
 * Shared LiveKit plumbing for video live streams. Handles connecting to a room,
 * publishing the host's (or an accepted guest's) camera + mic, subscribing to
 * every other publisher's video into per-tile <video> elements, mixing in
 * uploaded background music, and the broadcaster controls (mute, camera on/off,
 * flip to the back camera). Guests are auto-promoted to publishers the moment
 * the host accepts their call-in (LiveKit pushes a permission update).
 */
export function useLiveVideo({
  token,
  serverUrl,
  isHost,
  hostId = null,
}: {
  token: string | null
  serverUrl: string | null
  isHost: boolean
  // Identity of the room host, so remote participants can be split into the
  // headline host tile vs. the guest call-in tiles.
  hostId?: string | null
}) {
  const roomRef = useRef<Room | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  // Per-participant <video> elements registered by the UI for the guest tiles
  // (and, for viewers, the headline host tile).
  const remoteVideoEls = useRef<Map<string, HTMLVideoElement>>(new Map())
  // Remote audio elements appended to <body> so playback survives re-renders.
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map())

  // Background-music mixing graph (host side).
  const musicCtxRef = useRef<AudioContext | null>(null)
  const musicGainRef = useRef<GainNode | null>(null)
  const musicBassRef = useRef<BiquadFilterNode | null>(null)
  const musicElRef = useRef<HTMLAudioElement | null>(null)
  const musicTrackRef = useRef<LocalAudioTrack | null>(null)
  const musicSourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const musicLoopRef = useRef(false)
  const musicEndedRef = useRef<(() => void) | null>(null)

  const [connected, setConnected] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [localVideoReady, setLocalVideoReady] = useState(false)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user")
  const [participants, setParticipants] = useState(0)
  const [peers, setPeers] = useState<RemotePeer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [audioBlocked, setAudioBlocked] = useState(false)
  // Whether the local participant currently has publish permission. For a guest
  // this flips true the moment the host accepts their call-in request.
  const [canPublish, setCanPublish] = useState(isHost)
  const [musicPosition, setMusicPosition] = useState(0)
  const [musicDuration, setMusicDuration] = useState(0)

  const hostIdRef = useRef(hostId)
  hostIdRef.current = hostId

  function syncParticipants(room: Room) {
    setParticipants(room.remoteParticipants.size + 1)
  }

  // Recomputes the roster of remote publishers and whether each has live video.
  const refreshPeers = useCallback((room: Room) => {
    const out: RemotePeer[] = []
    room.remoteParticipants.forEach((p) => {
      const pubs = Array.from(p.trackPublications.values())
      const hasVideo = pubs.some(
        (pub) => pub.kind === Track.Kind.Video && pub.isSubscribed && Boolean(pub.track),
      )
      // Only surface participants who can publish (host + accepted guests) so
      // plain viewers don't show up as empty tiles.
      const canPub = p.permissions?.canPublish ?? false
      if (canPub || hasVideo) {
        out.push({
          identity: p.identity,
          name: p.name || "Guest",
          image: parseImage(p.metadata),
          isHost: hostIdRef.current != null && p.identity === hostIdRef.current,
          hasVideo,
        })
      }
    })
    // Host first, then guests in join order.
    out.sort((a, b) => Number(b.isHost) - Number(a.isHost))
    setPeers(out)
  }, [])

  function attachLocalVideo(room: Room): boolean {
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera)
    const track = pub?.track
    const el = localVideoRef.current
    if (track && el) {
      track.attach(el)
      el.muted = true
      el.setAttribute("playsinline", "true")
      void el.play().catch(() => {})
      setLocalVideoReady(true)
      return true
    }
    return false
  }

  // Attaches a specific remote participant's video to its registered tile.
  const attachPeerVideo = useCallback((identity: string): boolean => {
    const room = roomRef.current
    if (!room) return false
    const p = room.remoteParticipants.get(identity)
    const el = remoteVideoEls.current.get(identity)
    if (!p || !el) return false
    let attached = false
    p.trackPublications.forEach((pub) => {
      if (pub.kind === Track.Kind.Video && pub.track) {
        pub.track.attach(el)
        el.muted = true
        el.setAttribute("playsinline", "true")
        void el.play().catch(() => {})
        attached = true
      }
    })
    return attached
  }, [])

  // The UI calls this from a ref callback to (de)register a tile's <video>.
  const registerPeerVideoEl = useCallback(
    (identity: string, el: HTMLVideoElement | null) => {
      if (el) {
        remoteVideoEls.current.set(identity, el)
        attachPeerVideo(identity)
      } else {
        remoteVideoEls.current.delete(identity)
      }
    },
    [attachPeerVideo],
  )

  function attachRemoteAudio(track: RemoteTrack, participant: RemoteParticipant) {
    const el = track.attach()
    el.autoplay = true
    audioElsRef.current.set(participant.identity + ":" + track.sid, el)
    document.body.appendChild(el)
  }

  const cleanup = useCallback(() => {
    const room = roomRef.current
    if (room) {
      room.disconnect()
      roomRef.current = null
    }
    if (musicTrackRef.current) {
      try {
        musicTrackRef.current.stop()
      } catch {
        /* already stopped */
      }
      musicTrackRef.current = null
    }
    if (musicElRef.current) musicElRef.current.pause()
    audioElsRef.current.forEach((el) => el.remove())
    audioElsRef.current.clear()
  }, [])

  const connect = useCallback(async () => {
    if (roomRef.current || !token || !serverUrl) return
    const room = new Room({ adaptiveStream: true, dynacast: true })
    roomRef.current = room

    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant) => {
        if (track.kind === Track.Kind.Video) {
          attachPeerVideo(p.identity)
          refreshPeers(room)
        }
        if (track.kind === Track.Kind.Audio) {
          attachRemoteAudio(track, p)
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, p: RemoteParticipant) => {
        track.detach().forEach((el) => el.remove())
        audioElsRef.current.delete(p.identity + ":" + track.sid)
        if (track.kind === Track.Kind.Video) refreshPeers(room)
      })
      // Attach the local camera the instant LiveKit confirms it's published.
      .on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
        if (pub.source === Track.Source.Camera) {
          setCamOn(true)
          attachLocalVideo(room)
        }
      })
      .on(RoomEvent.ParticipantConnected, () => {
        syncParticipants(room)
        refreshPeers(room)
      })
      .on(RoomEvent.ParticipantDisconnected, () => {
        syncParticipants(room)
        refreshPeers(room)
      })
      .on(RoomEvent.TrackPublished, () => refreshPeers(room))
      .on(RoomEvent.TrackUnpublished, () => refreshPeers(room))
      // Host accepted/dropped this client as a guest: publish or unpublish.
      .on(RoomEvent.ParticipantPermissionsChanged, async () => {
        const canPub = room.localParticipant.permissions?.canPublish ?? false
        setCanPublish(canPub)
        if (canPub && !isHost) {
          try {
            await room.localParticipant.setMicrophoneEnabled(true)
            setMicOn(true)
            await room.localParticipant.setCameraEnabled(true, { facingMode: "user" })
            setCamOn(true)
            attachLocalVideo(room)
          } catch {
            /* device permission denied — UI still reflects canPublish */
          }
        }
        if (!canPub && !isHost) {
          setLocalVideoReady(false)
          await room.localParticipant.setCameraEnabled(false).catch(() => {})
          await room.localParticipant.setMicrophoneEnabled(false).catch(() => {})
          setCamOn(false)
          setMicOn(false)
        }
        refreshPeers(room)
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!room.canPlaybackAudio))
      .on(RoomEvent.Disconnected, () => setConnected(false))

    try {
      await withTimeout(
        room.connect(serverUrl, token),
        20000,
        "Connecting to the live server timed out. Please try again.",
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to the stream.")
      room.disconnect()
      roomRef.current = null
      return
    }

    syncParticipants(room)
    setConnected(true)
    setCanPublish(room.localParticipant.permissions?.canPublish ?? isHost)

    // Attach any tracks that were already published before we connected.
    room.remoteParticipants.forEach((p) => {
      attachPeerVideo(p.identity)
      p.trackPublications.forEach((pub) => {
        if (pub.kind === Track.Kind.Audio && pub.track) attachRemoteAudio(pub.track, p)
      })
    })
    refreshPeers(room)

    // Make sure remote audio can actually play (mobile autoplay policies).
    try {
      await room.startAudio()
    } catch {
      /* handled via audioBlocked */
    }
    setAudioBlocked(!room.canPlaybackAudio)

    // Only the host publishes immediately; guests publish on acceptance above.
    if (isHost) {
      try {
        await room.localParticipant.setMicrophoneEnabled(true)
      } catch {
        setMicOn(false)
      }
      let cameraOk = false
      let lastErr: unknown = null
      for (let attempt = 0; attempt < 2 && !cameraOk; attempt++) {
        try {
          await withTimeout(room.localParticipant.setCameraEnabled(true), 12000, "Camera start timed out.")
          cameraOk = true
        } catch (e) {
          lastErr = e
          if (attempt === 0) await new Promise((r) => setTimeout(r, 600))
        }
      }
      if (cameraOk) {
        attachLocalVideo(room)
      } else {
        setCamOn(false)
        setError(describeMediaError(lastErr))
      }
    }
  }, [token, serverUrl, isHost, attachPeerVideo, refreshPeers])

  // Connect on mount once we have credentials; tear down on unmount.
  useEffect(() => {
    if (token && serverUrl) void connect()
    return () => cleanup()
  }, [token, serverUrl, connect, cleanup])

  // (Re)attach the local camera to the self-view whenever it becomes visible.
  useEffect(() => {
    if (!camOn || !connected) return
    const room = roomRef.current
    if (room) attachLocalVideo(room)
  }, [camOn, connected])

  // Safety net: keep retrying the self-view attach for a few seconds while the
  // camera is on but the track hasn't started painting yet.
  useEffect(() => {
    if (!connected || !camOn || localVideoReady) return
    const room = roomRef.current
    if (!room) return
    let tries = 0
    const id = setInterval(() => {
      tries += 1
      if (attachLocalVideo(room) || tries >= 24) clearInterval(id)
    }, 250)
    return () => clearInterval(id)
  }, [connected, camOn, localVideoReady])

  const toggleMic = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !micOn
    await room.localParticipant.setMicrophoneEnabled(next)
    setMicOn(next)
  }, [micOn])

  const clearError = useCallback(() => setError(null), [])

  const toggleCam = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !camOn
    if (!next) {
      setLocalVideoReady(false)
      await room.localParticipant.setCameraEnabled(false).catch(() => {})
      setCamOn(false)
      return
    }
    // Turning the camera on (also used as the "retry" after a permission error).
    setError(null)
    try {
      await withTimeout(room.localParticipant.setCameraEnabled(true), 12000, "Camera start timed out.")
      setCamOn(true)
      attachLocalVideo(room)
    } catch (e) {
      setCamOn(false)
      setError(describeMediaError(e))
    }
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

  const startAudioPlayback = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    try {
      await room.startAudio()
    } catch {
      /* ignore */
    }
    audioElsRef.current.forEach((el) => void el.play().catch(() => {}))
    setAudioBlocked(!room.canPlaybackAudio)
  }, [])

  /**
   * Publishes an uploaded audio file as a second track so everyone in the room
   * hears the backing music mixed into the broadcast. Routes the <audio> element
   * through a WebAudio gain + low-shelf graph into a published MediaStreamTrack.
   */
  const publishMusic = useCallback(async (url: string) => {
    const room = roomRef.current
    if (!room) return

    const ctx = musicCtxRef.current ?? new AudioContext()
    musicCtxRef.current = ctx
    if (ctx.state === "suspended") await ctx.resume()

    let el = musicElRef.current
    if (!el) {
      el = new Audio()
      el.crossOrigin = "anonymous"
      musicElRef.current = el
      el.onloadedmetadata = () => {
        setMusicDuration(el!.duration || 0)
        setMusicPosition(0)
      }
      el.ontimeupdate = () => setMusicPosition(el!.currentTime)
      el.onended = () => {
        if (!musicLoopRef.current) musicEndedRef.current?.()
      }
    }

    if (!musicSourceRef.current) {
      const source = ctx.createMediaElementSource(el)
      const gain = ctx.createGain()
      gain.gain.value = 0.4
      const bass = ctx.createBiquadFilter()
      bass.type = "lowshelf"
      bass.frequency.value = 220
      bass.gain.value = 7
      source.connect(gain)
      gain.connect(bass)
      bass.connect(ctx.destination)
      musicSourceRef.current = source
      musicGainRef.current = gain
      musicBassRef.current = bass
    }

    el.loop = musicLoopRef.current
    el.src = url
    el.currentTime = 0
    setMusicPosition(0)
    await el.play().catch(() => {})

    if (!musicTrackRef.current) {
      const bass = musicBassRef.current!
      const dest = ctx.createMediaStreamDestination()
      bass.connect(dest)
      const [mediaTrack] = dest.stream.getAudioTracks()
      const localTrack = new LocalAudioTrack(mediaTrack)
      await room.localParticipant.publishTrack(localTrack, { name: "background-music" })
      musicTrackRef.current = localTrack
    }
  }, [])

  const setMusicVolume = useCallback((value: number) => {
    if (musicGainRef.current) musicGainRef.current.gain.value = value
  }, [])

  const setMusicPlaying = useCallback((playing: boolean) => {
    const el = musicElRef.current
    if (!el) return
    if (playing) void el.play().catch(() => {})
    else el.pause()
  }, [])

  const seekMusic = useCallback((seconds: number) => {
    const el = musicElRef.current
    if (!el) return
    el.currentTime = Math.max(0, Math.min(seconds, el.duration || seconds))
    setMusicPosition(el.currentTime)
  }, [])

  const setMusicLoop = useCallback((loop: boolean) => {
    musicLoopRef.current = loop
    if (musicElRef.current) musicElRef.current.loop = loop
  }, [])

  const setMusicEndedHandler = useCallback((fn: (() => void) | null) => {
    musicEndedRef.current = fn
  }, [])

  const stopMusic = useCallback(async () => {
    const room = roomRef.current
    if (musicTrackRef.current && room) {
      await room.localParticipant.unpublishTrack(musicTrackRef.current)
      musicTrackRef.current.stop()
      musicTrackRef.current = null
    }
    if (musicElRef.current) musicElRef.current.pause()
  }, [])

  return {
    localVideoRef,
    connected,
    micOn,
    camOn,
    facingMode,
    localVideoReady,
    canPublish,
    participants,
    peers,
    error,
    clearError,
    audioBlocked,
    musicPosition,
    musicDuration,
    registerPeerVideoEl,
    toggleMic,
    toggleCam,
    flipCamera,
    startAudioPlayback,
    publishMusic,
    setMusicVolume,
    setMusicPlaying,
    seekMusic,
    setMusicLoop,
    setMusicEndedHandler,
    stopMusic,
    disconnect: cleanup,
  }
}
