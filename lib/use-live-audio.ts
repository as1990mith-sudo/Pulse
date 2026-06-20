"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  LocalAudioTrack,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from "livekit-client"

export type LiveAudioState = {
  connected: boolean
  connecting: boolean
  micEnabled: boolean
  listeners: number
  speaking: boolean
  error: string | null
  // True when the browser is blocking autoplay of the live audio until the
  // listener performs a gesture (tap). Drives a "tap to enable sound" prompt.
  audioBlocked: boolean
}

/** Pick the best MediaRecorder audio container the browser supports. */
function pickAudioMime(): { mime: string; ext: string } {
  const candidates: { mime: string; ext: string }[] = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4", ext: "mp4" },
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mime)) return c
  }
  return { mime: "", ext: "webm" }
}

/**
 * Wraps a LiveKit Room for audio-only broadcasting.
 * - Hosts (canPublish) capture the mic and publish it.
 * - Listeners subscribe and the audio is piped into a hidden <audio> element.
 */
export function useLiveAudio() {
  const roomRef = useRef<Room | null>(null)
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  // Background-music mixing graph (host side).
  const musicCtxRef = useRef<AudioContext | null>(null)
  const musicGainRef = useRef<GainNode | null>(null)
  const musicElRef = useRef<HTMLAudioElement | null>(null)
  const musicTrackRef = useRef<LocalAudioTrack | null>(null)
  // The MediaStream of the currently-mixed music, so the recorder can mix it in.
  const musicStreamRef = useRef<MediaStream | null>(null)
  // Session recording graph (host side): mic + music mixed into one MediaRecorder.
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordChunksRef = useRef<BlobPart[]>([])
  const recordCtxRef = useRef<AudioContext | null>(null)
  const recordDestRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const recordMimeRef = useRef<string>("")
  const [state, setState] = useState<LiveAudioState>({
    connected: false,
    connecting: false,
    micEnabled: false,
    listeners: 0,
    speaking: false,
    error: null,
    audioBlocked: false,
  })

  const update = useCallback((patch: Partial<LiveAudioState>) => {
    setState((s) => ({ ...s, ...patch }))
  }, [])

  const refreshCounts = useCallback((room: Room) => {
    // Total participants minus the local one = listeners for a host view.
    update({ listeners: room.numParticipants })
  }, [update])

  const connect = useCallback(
    async (opts: { serverUrl: string; token: string; publish: boolean; muted?: boolean }) => {
      if (roomRef.current) return
      update({ connecting: true, error: null })
      try {
        const room = new Room({ adaptiveStream: true, dynacast: true })
        roomRef.current = room

        room
          .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
            if (track.kind === Track.Kind.Audio) {
              const el = track.attach()
              el.autoplay = true
              audioElsRef.current.set(participant.identity, el)
              document.body.appendChild(el)
            }
          })
          .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
            track.detach().forEach((el) => el.remove())
            audioElsRef.current.delete(participant.identity)
          })
          .on(RoomEvent.ParticipantConnected, () => refreshCounts(room))
          .on(RoomEvent.ParticipantDisconnected, () => refreshCounts(room))
          .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            update({ speaking: speakers.length > 0 })
          })
          .on(RoomEvent.Disconnected, () => {
            update({ connected: false, micEnabled: false })
          })
          .on(RoomEvent.AudioPlaybackStatusChanged, () => {
            // Reflect whether the browser is currently allowing audio playback.
            update({ audioBlocked: !room.canPlaybackAudio })
          })

        await room.connect(opts.serverUrl, opts.token)

        if (opts.publish) {
          await room.localParticipant.setMicrophoneEnabled(true)
          update({ micEnabled: true })
        }

        // Listeners: browsers often block autoplay until a user gesture. Try to
        // start playback; if it's blocked, surface a prompt so the listener can
        // tap to enable sound (this was why nothing was audible while live).
        if (!opts.publish) {
          try {
            await room.startAudio()
          } catch {
            // ignore — handled via audioBlocked below
          }
          update({ audioBlocked: !room.canPlaybackAudio })
        }

        refreshCounts(room)
        update({ connected: true, connecting: false })
      } catch (e) {
        roomRef.current = null
        update({
          connecting: false,
          error: e instanceof Error ? e.message : "Could not connect to the live audio.",
        })
      }
    },
    [refreshCounts, update],
  )

  const toggleMic = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !room.localParticipant.isMicrophoneEnabled
    await room.localParticipant.setMicrophoneEnabled(next)
    update({ micEnabled: next })
  }, [update])

  const setListenerMuted = useCallback((muted: boolean) => {
    audioElsRef.current.forEach((el) => {
      el.muted = muted
    })
  }, [])

  /**
   * Called from a user gesture (tap) to unblock audio playback when the browser
   * has suspended it. Resumes LiveKit's audio context and replays attached
   * elements, then clears the audioBlocked flag.
   */
  const startAudioPlayback = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    try {
      await room.startAudio()
    } catch {
      // ignore
    }
    audioElsRef.current.forEach((el) => {
      el.muted = false
      void el.play().catch(() => {})
    })
    update({ audioBlocked: !room.canPlaybackAudio })
  }, [update])

  /**
   * Publishes an audio file as a second track so listeners actually hear the
   * backing music mixed into the broadcast. Routes the <audio> element through
   * a WebAudio gain node (for live volume control) into a MediaStreamTrack.
   */
  const publishMusic = useCallback(async (url: string) => {
    const room = roomRef.current
    if (!room) return

    // Tear down any previous music track first.
    if (musicTrackRef.current) {
      await room.localParticipant.unpublishTrack(musicTrackRef.current)
      musicTrackRef.current.stop()
      musicTrackRef.current = null
    }

    const ctx = musicCtxRef.current ?? new AudioContext()
    musicCtxRef.current = ctx
    if (ctx.state === "suspended") await ctx.resume()

    const el = musicElRef.current ?? new Audio()
    el.crossOrigin = "anonymous"
    el.src = url
    el.loop = true
    musicElRef.current = el

    const source = ctx.createMediaElementSource(el)
    const gain = musicGainRef.current ?? ctx.createGain()
    gain.gain.value = musicGainRef.current?.gain.value ?? 0.4
    musicGainRef.current = gain
    const dest = ctx.createMediaStreamDestination()
    source.connect(gain)
    gain.connect(dest)
    // Also route the music to the host's own speakers so they can monitor it
    // (and hear their volume changes) exactly as it's broadcast/recorded. The
    // gain node sits before this split, so volume affects monitor + broadcast.
    gain.connect(ctx.destination)

    await el.play().catch(() => {})

    const [mediaTrack] = dest.stream.getAudioTracks()
    const localTrack = new LocalAudioTrack(mediaTrack)
    await room.localParticipant.publishTrack(localTrack, { name: "background-music" })
    musicTrackRef.current = localTrack
    musicStreamRef.current = dest.stream

    // If a session recording is in progress, mix this music into it too.
    const recCtx = recordCtxRef.current
    const recDest = recordDestRef.current
    if (recCtx && recDest) {
      try {
        recCtx.createMediaStreamSource(dest.stream).connect(recDest)
      } catch {
        // ignore — music will still play live, just not captured in the recording
      }
    }
  }, [])

  /** Adjusts the live background-music volume (0–1). */
  const setMusicVolume = useCallback((value: number) => {
    if (musicGainRef.current) musicGainRef.current.gain.value = value
  }, [])

  /** Pause/resume the backing track without unpublishing it. */
  const setMusicPlaying = useCallback((playing: boolean) => {
    const el = musicElRef.current
    if (!el) return
    if (playing) void el.play().catch(() => {})
    else el.pause()
  }, [])

  /** Stops and unpublishes the backing track entirely. */
  const stopMusic = useCallback(async () => {
    const room = roomRef.current
    if (musicTrackRef.current && room) {
      await room.localParticipant.unpublishTrack(musicTrackRef.current)
      musicTrackRef.current.stop()
      musicTrackRef.current = null
    }
    if (musicElRef.current) {
      musicElRef.current.pause()
    }
  }, [])

  /**
   * Starts recording the broadcast (host mic + any background music) into a
   * single audio file using a WebAudio mixing bus and MediaRecorder. Safe to
   * call right after going live; music added later is wired in automatically.
   */
  const startRecording = useCallback(() => {
    const room = roomRef.current
    if (!room || recorderRef.current) return
    if (typeof MediaRecorder === "undefined") return

    try {
      const ctx = new AudioContext()
      const dest = ctx.createMediaStreamDestination()
      recordCtxRef.current = ctx
      recordDestRef.current = dest

      // Mic: tap the host's published microphone track.
      const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone)
      const micTrack = micPub?.audioTrack?.mediaStreamTrack
      if (micTrack) {
        ctx.createMediaStreamSource(new MediaStream([micTrack])).connect(dest)
      }

      // Any music already mixing gets folded in too.
      if (musicStreamRef.current) {
        ctx.createMediaStreamSource(musicStreamRef.current).connect(dest)
      }

      const { mime } = pickAudioMime()
      recordMimeRef.current = mime || "audio/webm"
      const chunks: BlobPart[] = []
      const recorder = mime
        ? new MediaRecorder(dest.stream, { mimeType: mime })
        : new MediaRecorder(dest.stream)
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      recorder.start(1000)
      recorderRef.current = recorder
      recordChunksRef.current = chunks
    } catch {
      // Recording is best-effort; a failure here must not break the broadcast.
      recorderRef.current = null
    }
  }, [])

  /** Stops the session recording and resolves with the captured audio Blob. */
  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    const recorder = recorderRef.current
    if (!recorder) return null

    const done = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
    })
    try {
      recorder.stop()
    } catch {
      // already stopped
    }
    await done

    const blob = new Blob(recordChunksRef.current, { type: recordMimeRef.current || "audio/webm" })
    recorderRef.current = null
    recordChunksRef.current = []
    await recordCtxRef.current?.close().catch(() => {})
    recordCtxRef.current = null
    recordDestRef.current = null
    return blob.size > 0 ? blob : null
  }, [])

  const disconnect = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    if (musicTrackRef.current) {
      musicTrackRef.current.stop()
      musicTrackRef.current = null
    }
    if (musicElRef.current) musicElRef.current.pause()
    musicStreamRef.current = null
    await room.disconnect()
    audioElsRef.current.forEach((el) => el.remove())
    audioElsRef.current.clear()
    roomRef.current = null
    update({ connected: false, connecting: false, micEnabled: false, listeners: 0, speaking: false })
  }, [update])

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      const room = roomRef.current
      if (room) void room.disconnect()
      audioElsRef.current.forEach((el) => el.remove())
      audioElsRef.current.clear()
      roomRef.current = null
    }
  }, [])

  return {
    state,
    connect,
    disconnect,
    toggleMic,
    setListenerMuted,
    startAudioPlayback,
    publishMusic,
    setMusicVolume,
    setMusicPlaying,
    stopMusic,
    startRecording,
    stopRecording,
  }
}
