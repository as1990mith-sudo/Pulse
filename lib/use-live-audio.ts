"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ConnectionQuality,
  LocalAudioTrack,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from "livekit-client"

// Normalised connection quality surfaced to the UI for the signal dots.
export type ConnQuality = "excellent" | "good" | "poor" | "unknown"

function normalizeQuality(q: ConnectionQuality | undefined): ConnQuality {
  switch (q) {
    case ConnectionQuality.Excellent:
      return "excellent"
    case ConnectionQuality.Good:
      return "good"
    case ConnectionQuality.Poor:
      return "poor"
    default:
      return "unknown"
  }
}

export type LiveParticipant = {
  identity: string
  name: string
  isLocal: boolean
  isSpeaking: boolean
  // Whether the participant currently has an unmuted, live microphone track.
  // Drives the mic on/off indicator on Conversation participant cards.
  micOn: boolean
  // Profile image URL (from participant metadata) for real stage avatars.
  image: string | null
  // Real-time connection quality from LiveKit (drives the signal indicator).
  quality: ConnQuality
  }

export type LiveAudioState = {
  connected: boolean
  connecting: boolean
  // True while LiveKit is transparently re-establishing a dropped connection.
  reconnecting: boolean
  micEnabled: boolean
  listeners: number
  speaking: boolean
  error: string | null
  // True when the browser is blocking autoplay of the live audio until the
  // listener performs a gesture (tap). Drives a "tap to enable sound" prompt.
  audioBlocked: boolean
  // Whether the local participant currently has publish permission. Flips to
  // true when the host accepts a call-in request (LiveKit pushes a permission
  // update), at which point the mic is enabled automatically.
  canPublish: boolean
  // Identities of participants currently speaking (drives the talking ring on
  // host/guest avatars). Includes the local participant when they speak.
  activeSpeakers: string[]
  // Live background-music playback position + length (seconds) for the scrubber.
  musicPosition: number
  musicDuration: number
  // Local participant's real-time connection quality.
  connectionQuality: ConnQuality
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

export type SoundEffectName = "applause" | "drumroll" | "chime" | "airhorn" | "ding" | "riser"

/** All available sound effects with the emoji + label shown in the soundboard. */
export const SOUND_EFFECTS: { name: SoundEffectName; label: string; emoji: string }[] = [
  { name: "applause", label: "Applause", emoji: "👏" },
  { name: "drumroll", label: "Drumroll", emoji: "🥁" },
  { name: "chime", label: "Chime", emoji: "🔔" },
  { name: "ding", label: "Ding", emoji: "✨" },
  { name: "airhorn", label: "Air horn", emoji: "📢" },
  { name: "riser", label: "Riser", emoji: "🚀" },
]

/** Builds a short white-noise buffer used for applause / drumroll textures. */
function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

/** Synthesizes a sound effect entirely with the Web Audio API (no assets). */
function synthesizeEffect(ctx: AudioContext, out: GainNode, name: SoundEffectName) {
  const now = ctx.currentTime
  const tone = (freq: number, start: number, dur: number, type: OscillatorType = "sine", peak = 0.5) => {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, now + start)
    g.gain.setValueAtTime(0.0001, now + start)
    g.gain.exponentialRampToValueAtTime(peak, now + start + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur)
    osc.connect(g).connect(out)
    osc.start(now + start)
    osc.stop(now + start + dur + 0.05)
  }
  const noise = (start: number, dur: number, freq: number, q: number, peak = 0.5) => {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer(ctx, dur + 0.1)
    const filter = ctx.createBiquadFilter()
    filter.type = "bandpass"
    filter.frequency.value = freq
    filter.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, now + start)
    g.gain.exponentialRampToValueAtTime(peak, now + start + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur)
    src.connect(filter).connect(g).connect(out)
    src.start(now + start)
    src.stop(now + start + dur + 0.05)
  }

  switch (name) {
    case "applause":
      // Layered noise bursts to imitate a crowd clapping.
      for (let i = 0; i < 26; i++) noise(Math.random() * 1.4, 0.06, 1800 + Math.random() * 1400, 1, 0.25)
      noise(0, 1.6, 1200, 0.6, 0.18)
      break
    case "drumroll":
      for (let i = 0; i < 28; i++) noise(i * 0.05, 0.05, 220, 6, 0.4)
      noise(1.45, 0.4, 180, 3, 0.6)
      break
    case "chime":
      ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.12, 0.9, "sine", 0.4))
      break
    case "ding":
      tone(1318.5, 0, 0.7, "sine", 0.5)
      tone(1975.5, 0, 0.6, "sine", 0.2)
      break
    case "airhorn":
      ;[0, 0.28, 0.56].forEach((s) => {
        tone(233, s, 0.22, "sawtooth", 0.35)
        tone(466, s, 0.22, "square", 0.18)
      })
      break
    case "riser": {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = "sawtooth"
      osc.frequency.setValueAtTime(120, now)
      osc.frequency.exponentialRampToValueAtTime(1600, now + 1.2)
      g.gain.setValueAtTime(0.0001, now)
      g.gain.exponentialRampToValueAtTime(0.35, now + 1.0)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.4)
      osc.connect(g).connect(out)
      osc.start(now)
      osc.stop(now + 1.45)
      break
    }
  }
}

/**
 * Wraps a LiveKit Room for audio-only broadcasting.
 * - Hosts (canPublish) capture the mic and publish it.
 * - Listeners subscribe and the audio is piped into a hidden <audio> element.
 */
export function useLiveAudio() {
  const roomRef = useRef<Room | null>(null)
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  // Listener's mute preference. Kept in a ref so it survives re-subscriptions:
  // any audio element attached *after* the listener mutes must start muted too,
  // otherwise newly-joined speakers/music would suddenly become audible.
  const listenerMutedRef = useRef(false)
  // Background-music mixing graph (host side).
  const musicCtxRef = useRef<AudioContext | null>(null)
  const musicGainRef = useRef<GainNode | null>(null)
  // The host's intended (non-ducked) music volume. Ducking ramps the live gain
  // down toward a fraction of this while someone speaks, then back up to it.
  const musicBaseVolumeRef = useRef(0.4)
  // Low-shelf EQ that lifts the low end so the broadcast music has more bass.
  const musicBassRef = useRef<BiquadFilterNode | null>(null)
  const musicElRef = useRef<HTMLAudioElement | null>(null)
  const musicTrackRef = useRef<LocalAudioTrack | null>(null)
  // Whether the current track should loop, and a callback fired when a
  // (non-looping) track finishes — used by the console to auto-advance the
  // playlist. Held in refs so the persistent audio element's handlers always
  // see the latest value without re-binding.
  const musicLoopRef = useRef(false)
  const musicEndedRef = useRef<(() => void) | null>(null)
  // The single MediaElementSourceNode for the music element. A media element can
  // only ever be wired to ONE source node, so we create it once and reuse it for
  // every track — recreating it is what previously threw and stopped playback.
  const musicSourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  // The MediaStream of the currently-mixed music, so the recorder can mix it in.
  const musicStreamRef = useRef<MediaStream | null>(null)
  // Session recording graph (host side): mic + music mixed into one MediaRecorder.
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordChunksRef = useRef<BlobPart[]>([])
  const recordCtxRef = useRef<AudioContext | null>(null)
  const recordDestRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const recordMimeRef = useRef<string>("")
  // Sound-effects bus (host side): a single published track through which
  // synthesized chimes are mixed into the broadcast (and recording).
  const fxCtxRef = useRef<AudioContext | null>(null)
  const fxGainRef = useRef<GainNode | null>(null)
  const fxTrackRef = useRef<LocalAudioTrack | null>(null)
  // Distinguishes a user-initiated disconnect (End / leave) from an unexpected
  // drop, and a callback fired only on the latter so the host can auto-recover.
  const intentionalDisconnectRef = useRef(false)
  const onDisconnectedRef = useRef<(() => void) | null>(null)
  const [state, setState] = useState<LiveAudioState>({
    connected: false,
    connecting: false,
    reconnecting: false,
    micEnabled: false,
    listeners: 0,
    speaking: false,
    error: null,
    audioBlocked: false,
    canPublish: false,
    activeSpeakers: [],
    musicPosition: 0,
    musicDuration: 0,
    connectionQuality: "unknown",
  })

  // Roster of participants who can publish (host + guests), surfaced to the UI
  // for the stage avatars. Listeners are not included here (only their count).
  const [speakers, setSpeakers] = useState<LiveParticipant[]>([])

  const update = useCallback((patch: Partial<LiveAudioState>) => {
    setState((s) => ({ ...s, ...patch }))
  }, [])

  const refreshCounts = useCallback((room: Room) => {
    // Total participants minus the local one = listeners for a host view.
    update({ listeners: room.numParticipants })
  }, [update])

  // Recomputes the publisher roster (host + accepted guests) from current room
  // state. A participant is a "speaker" slot if they have publish permission.
  const refreshSpeakers = useCallback((room: Room) => {
    const out: LiveParticipant[] = []
    const consider = (p: Participant, isLocal: boolean) => {
      const canPub = p.permissions?.canPublish ?? false
      if (canPub) {
        let image: string | null = null
        if (p.metadata) {
          try {
            image = (JSON.parse(p.metadata) as { image?: string | null }).image ?? null
          } catch {
            image = null
          }
        }
        // Mic is "on" when a microphone track is published and not muted.
        const micPub = p.getTrackPublication(Track.Source.Microphone)
        const micOn = !!micPub && !micPub.isMuted
        out.push({
          identity: p.identity,
          name: p.name || "Guest",
          isLocal,
          isSpeaking: p.isSpeaking,
          micOn,
          image,
          quality: normalizeQuality(p.connectionQuality),
        })
      }
    }
    consider(room.localParticipant, true)
    room.remoteParticipants.forEach((p) => consider(p, false))
    setSpeakers(out)
  }, [])

  // Tears down all room-bound media (subscribed audio elements + locally
  // published music/effects tracks) so the graph can be cleanly rebuilt on a
  // fresh connection. Leaves the persistent music element/context intact.
  const cleanupRoomMedia = useCallback(() => {
    if (musicTrackRef.current) {
      try {
        musicTrackRef.current.stop()
      } catch {
        // already stopped
      }
      musicTrackRef.current = null
    }
    if (musicElRef.current) musicElRef.current.pause()
    musicStreamRef.current = null
    if (fxTrackRef.current) {
      try {
        fxTrackRef.current.stop()
      } catch {
        // already stopped
      }
      fxTrackRef.current = null
    }
    fxGainRef.current = null
    void fxCtxRef.current?.close().catch(() => {})
    fxCtxRef.current = null
    audioElsRef.current.forEach((el) => el.remove())
    audioElsRef.current.clear()
  }, [])

  const connect = useCallback(
    async (opts: {
      serverUrl: string
      token: string
      publish: boolean
      muted?: boolean
      // Fired when the connection drops unexpectedly (not via disconnect()).
      onDisconnected?: () => void
    }) => {
      if (roomRef.current) return
      onDisconnectedRef.current = opts.onDisconnected ?? null
      intentionalDisconnectRef.current = false
      update({ connecting: true, error: null, reconnecting: false })
      try {
        const room = new Room({ adaptiveStream: true, dynacast: true })
        roomRef.current = room

        room
          .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
            if (track.kind === Track.Kind.Audio) {
              const el = track.attach()
              el.autoplay = true
              // Honour the listener's current mute preference for late joiners.
              el.muted = listenerMutedRef.current
              audioElsRef.current.set(participant.identity, el)
              document.body.appendChild(el)
            }
          })
          .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
            track.detach().forEach((el) => el.remove())
            audioElsRef.current.delete(participant.identity)
          })
          .on(RoomEvent.ParticipantConnected, () => {
            refreshCounts(room)
            refreshSpeakers(room)
          })
          .on(RoomEvent.ParticipantDisconnected, () => {
            refreshCounts(room)
            refreshSpeakers(room)
          })
          .on(RoomEvent.ActiveSpeakersChanged, (active) => {
            update({ speaking: active.length > 0, activeSpeakers: active.map((p) => p.identity) })
            refreshSpeakers(room)
          })
          // Fired when the host grants/revokes this client's publish permission
          // (the guest call-in accept/decline). When granted, enable the mic so
          // the guest immediately goes live without any extra tap.
          .on(RoomEvent.ParticipantPermissionsChanged, async () => {
            const canPub = room.localParticipant.permissions?.canPublish ?? false
            update({ canPublish: canPub })
            if (canPub && !room.localParticipant.isMicrophoneEnabled) {
              try {
                await room.localParticipant.setMicrophoneEnabled(true)
                update({ micEnabled: true })
              } catch {
                // mic permission denied — UI still reflects canPublish
              }
            }
            if (!canPub && room.localParticipant.isMicrophoneEnabled) {
              await room.localParticipant.setMicrophoneEnabled(false).catch(() => {})
              update({ micEnabled: false })
            }
            refreshSpeakers(room)
          })
          .on(RoomEvent.TrackPublished, () => refreshSpeakers(room))
          .on(RoomEvent.TrackUnpublished, () => refreshSpeakers(room))
          // Keep the per-participant mic indicator in sync when anyone mutes /
          // unmutes (including the local participant).
          .on(RoomEvent.TrackMuted, () => refreshSpeakers(room))
          .on(RoomEvent.TrackUnmuted, () => refreshSpeakers(room))
          .on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
            // Surface the local participant's quality, and refresh the roster so
            // each speaker tile shows its own up-to-date signal indicator.
            if (participant.identity === room.localParticipant.identity) {
              update({ connectionQuality: normalizeQuality(quality) })
            }
            refreshSpeakers(room)
          })
          // Transient network drops: LiveKit re-establishes automatically.
          .on(RoomEvent.Reconnecting, () => update({ reconnecting: true }))
          .on(RoomEvent.Reconnected, () => {
            update({ reconnecting: false, connected: true })
            refreshCounts(room)
            refreshSpeakers(room)
          })
          // Hard disconnect (gave up reconnecting, server/token issue, etc.).
          // Fully tear the room down so a fresh connect() can succeed, and — if
          // the drop wasn't user-initiated — signal the host to auto-recover.
          .on(RoomEvent.Disconnected, () => {
            const intentional = intentionalDisconnectRef.current
            intentionalDisconnectRef.current = false
            cleanupRoomMedia()
            roomRef.current = null
            update({ connected: false, reconnecting: false, micEnabled: false, listeners: 0, speaking: false })
            if (!intentional) onDisconnectedRef.current?.()
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
        refreshSpeakers(room)
        update({
          connected: true,
          connecting: false,
          canPublish: room.localParticipant.permissions?.canPublish ?? opts.publish,
        })
      } catch (e) {
        roomRef.current = null
        update({
          connecting: false,
          error: e instanceof Error ? e.message : "Could not connect to the live audio.",
        })
      }
    },
    [refreshCounts, refreshSpeakers, update],
  )

  const toggleMic = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !room.localParticipant.isMicrophoneEnabled
    await room.localParticipant.setMicrophoneEnabled(next)
    update({ micEnabled: next })
  }, [update])

  const setListenerMuted = useCallback((muted: boolean) => {
    listenerMutedRef.current = muted
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
      // Unblocking playback must not override an explicit listener mute.
      el.muted = listenerMutedRef.current
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

    const ctx = musicCtxRef.current ?? new AudioContext()
    musicCtxRef.current = ctx
    if (ctx.state === "suspended") await ctx.resume()

    // Build the audio element + graph exactly once, then reuse it for every
    // track. Switching tracks is just a src swap through the persistent graph,
    // so the previous track stops cleanly and no second source node is created.
    let el = musicElRef.current
    if (!el) {
      el = new Audio()
      el.crossOrigin = "anonymous"
      musicElRef.current = el
      // Report duration + position so the host can scrub the track.
      el.onloadedmetadata = () => update({ musicDuration: el!.duration || 0, musicPosition: 0 })
      el.ontimeupdate = () => update({ musicPosition: el!.currentTime })
      // When a non-looping track finishes, notify the console so it can advance
      // to the next track in the playlist.
      el.onended = () => {
        if (!musicLoopRef.current) musicEndedRef.current?.()
      }
    }

    if (!musicSourceRef.current) {
      const source = ctx.createMediaElementSource(el)
      const gain = ctx.createGain()
      gain.gain.value = musicBaseVolumeRef.current
      // Low-shelf filter boosts everything below ~220Hz for a warmer, bassier
      // sound. Sits after the volume gain so the whole chain (monitor + the
      // published/recorded stream) is fed the same bass-enhanced signal.
      const bass = ctx.createBiquadFilter()
      bass.type = "lowshelf"
      bass.frequency.value = 220
      bass.gain.value = 7
      source.connect(gain)
      gain.connect(bass)
      // Route the music to the host's own speakers so they can monitor it (and
      // hear volume changes) exactly as it's broadcast/recorded.
      bass.connect(ctx.destination)
      musicSourceRef.current = source
      musicGainRef.current = gain
      musicBassRef.current = bass
    }

    // Swap to the requested track and (re)start playback, honoring the loop flag.
    el.loop = musicLoopRef.current
    el.src = url
    el.currentTime = 0
    update({ musicPosition: 0 })
    await el.play().catch(() => {})

    // Publish the music to LiveKit once. Later track swaps keep flowing through
    // this same published stream, so listeners hear the change seamlessly.
    if (!musicTrackRef.current) {
      const bass = musicBassRef.current!
      const dest = ctx.createMediaStreamDestination()
      bass.connect(dest)
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
    }
  }, [update])

  /** Adjusts the live background-music volume (0–1). Records it as the new base. */
  const setMusicVolume = useCallback((value: number) => {
    musicBaseVolumeRef.current = value
    const gain = musicGainRef.current
    if (gain) {
      const ctx = musicCtxRef.current
      if (ctx) {
        // Small smoothing ramp so slider drags don't zipper.
        gain.gain.cancelScheduledValues(ctx.currentTime)
        gain.gain.setTargetAtTime(value, ctx.currentTime, 0.05)
      } else {
        gain.gain.value = value
      }
    }
  }, [])

  /**
   * Smoothly ramps the live music gain toward `target` over `ms` without
   * changing the host's chosen base volume. Used for speech ducking: ramp down
   * to a fraction while someone speaks, then back up to the base afterward.
   */
  const rampMusicVolume = useCallback((target: number, ms: number) => {
    const gain = musicGainRef.current
    const ctx = musicCtxRef.current
    if (!gain) return
    if (ctx) {
      const now = ctx.currentTime
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(Math.max(0.0001, target), now + Math.max(0.01, ms / 1000))
    } else {
      gain.gain.value = target
    }
  }, [])

  /**
   * Ducks (or restores) the background music around live speech. When `ducked`
   * is true the gain fades to 18% of the host's base volume; otherwise it fades
   * back up to the full base. Fades are smooth (no sudden jumps).
   */
  const duckMusic = useCallback(
    (ducked: boolean, ms = 320) => {
      const base = musicBaseVolumeRef.current
      rampMusicVolume(ducked ? base * 0.18 : base, ms)
    },
    [rampMusicVolume],
  )

  /** The host's current intended (non-ducked) music volume. */
  const getMusicBaseVolume = useCallback(() => musicBaseVolumeRef.current, [])

  /**
   * Switches the backing track with a smooth crossfade: fade the current track
   * down, swap the source (via publishMusic, which reuses the same published
   * stream), then fade back up to the host's base volume. No abrupt cut.
   */
  const crossfadeMusic = useCallback(
    async (url: string, ms = 700) => {
      const half = Math.max(120, ms / 2)
      // Fade out the current track (only if something is already playing).
      if (musicElRef.current && musicGainRef.current) {
        rampMusicVolume(0.0001, half)
        await new Promise((r) => setTimeout(r, half))
      }
      await publishMusic(url)
      // Fade back up to the host's chosen volume.
      rampMusicVolume(musicBaseVolumeRef.current, half)
    },
    [publishMusic, rampMusicVolume],
  )

  /** Pause/resume the backing track without unpublishing it. */
  const setMusicPlaying = useCallback((playing: boolean) => {
    const el = musicElRef.current
    if (!el) return
    if (playing) void el.play().catch(() => {})
    else el.pause()
  }, [])

  /** Jump the backing track to an absolute position (seconds) — the scrubber. */
  const seekMusic = useCallback((seconds: number) => {
    const el = musicElRef.current
    if (!el) return
    el.currentTime = Math.max(0, Math.min(seconds, el.duration || seconds))
    update({ musicPosition: el.currentTime })
  }, [update])

  /** Toggle whether the current/next backing track loops. Applies immediately. */
  const setMusicLoop = useCallback((loop: boolean) => {
    musicLoopRef.current = loop
    if (musicElRef.current) musicElRef.current.loop = loop
  }, [])

  /**
   * Register a callback fired when a non-looping track finishes, so the console
   * can auto-advance to the next track in the playlist.
   */
  const setMusicEndedHandler = useCallback((fn: (() => void) | null) => {
    musicEndedRef.current = fn
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
   * Plays a short synthesized sound effect (no external assets) and mixes it
   * into the broadcast so every listener hears it — just like background music.
   * Lazily publishes a dedicated "sound-effects" track on first use.
   */
  const playEffect = useCallback(async (name: SoundEffectName) => {
    const room = roomRef.current
    if (!room) return

    const ctx = fxCtxRef.current ?? new AudioContext()
    fxCtxRef.current = ctx
    if (ctx.state === "suspended") await ctx.resume()

    // Master FX gain → host speakers (monitor) + a published track for listeners.
    let gain = fxGainRef.current
    if (!gain) {
      gain = ctx.createGain()
      gain.gain.value = 0.8
      gain.connect(ctx.destination)
      fxGainRef.current = gain

      const dest = ctx.createMediaStreamDestination()
      gain.connect(dest)
      const [mediaTrack] = dest.stream.getAudioTracks()
      const localTrack = new LocalAudioTrack(mediaTrack)
      try {
        await room.localParticipant.publishTrack(localTrack, { name: "sound-effects" })
        fxTrackRef.current = localTrack
        // Fold effects into any in-progress recording too.
        const recCtx = recordCtxRef.current
        const recDest = recordDestRef.current
        if (recCtx && recDest) {
          try {
            recCtx.createMediaStreamSource(dest.stream).connect(recDest)
          } catch {
            // best-effort
          }
        }
      } catch {
        // If publishing fails the host still hears the monitor output.
      }
    }

    synthesizeEffect(ctx, gain, name)
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
    // Mark intentional so the Disconnected handler doesn't trigger recovery.
    intentionalDisconnectRef.current = true
    onDisconnectedRef.current = null
    cleanupRoomMedia()
    await room.disconnect()
    roomRef.current = null
    update({ connected: false, connecting: false, reconnecting: false, micEnabled: false, listeners: 0, speaking: false })
  }, [cleanupRoomMedia, update])

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      intentionalDisconnectRef.current = true
      onDisconnectedRef.current = null
      const room = roomRef.current
      if (room) void room.disconnect()
      audioElsRef.current.forEach((el) => el.remove())
      audioElsRef.current.clear()
      roomRef.current = null
    }
  }, [])

  return {
    state,
    speakers,
    connect,
    disconnect,
    toggleMic,
    setListenerMuted,
    startAudioPlayback,
    publishMusic,
    crossfadeMusic,
    setMusicVolume,
    rampMusicVolume,
    duckMusic,
    getMusicBaseVolume,
    setMusicPlaying,
    seekMusic,
    setMusicLoop,
    setMusicEndedHandler,
    stopMusic,
    playEffect,
    startRecording,
    stopRecording,
  }
}
