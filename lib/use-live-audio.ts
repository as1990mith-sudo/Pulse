"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  type LocalAudioTrack,
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

  const disconnect = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
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

  return { state, connect, disconnect, toggleMic, setListenerMuted, publishTrackRef: useRef<LocalAudioTrack | null>(null) }
}
