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
  const [state, setState] = useState<LiveAudioState>({
    connected: false,
    connecting: false,
    micEnabled: false,
    listeners: 0,
    speaking: false,
    error: null,
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

        await room.connect(opts.serverUrl, opts.token)

        if (opts.publish) {
          await room.localParticipant.setMicrophoneEnabled(true)
          update({ micEnabled: true })
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

    await el.play().catch(() => {})

    const [mediaTrack] = dest.stream.getAudioTracks()
    const localTrack = new LocalAudioTrack(mediaTrack)
    await room.localParticipant.publishTrack(localTrack, { name: "background-music" })
    musicTrackRef.current = localTrack
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

  const disconnect = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    if (musicTrackRef.current) {
      musicTrackRef.current.stop()
      musicTrackRef.current = null
    }
    if (musicElRef.current) musicElRef.current.pause()
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
    publishMusic,
    setMusicVolume,
    setMusicPlaying,
    stopMusic,
  }
}
