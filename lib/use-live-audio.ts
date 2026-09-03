"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ensureCtxRunning } from "@/lib/audio-context"
import {
  routeRemoteAudioToSpeaker,
  applyRemoteAudioMuted,
  releaseRemoteAudioRoute,
  resumeSpeakerPlayout,
} from "@/lib/android-speaker-route"
import { applyAudioRouting, prepareAudioRouting, releaseAudioRouting } from "@/lib/audio-routing"
import {
  AudioPresets,
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
import {
  buildMusicChain,
  DUCK_FACTOR,
  LIVE_MIC_CONSTRAINTS,
  LIVE_VOICE_PRESET,
  rampGain,
} from "@/lib/live-audio-chain"

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
  // Clear default level (0.8). With mic echo cancellation on, the host's own
  // loudspeaker output is treated as echo and suppressed, so a low base made
  // background music sound muffled to the host.
  const musicBaseVolumeRef = useRef(0.8)
  // Low-shelf EQ that lifts the low end so the broadcast music has more bass.
  // Final node of the shared studio chain (post limiter). Every destination —
  // host monitor, published track and recording mixer — taps this same node so
  // all three hear the identical processed signal.
  const musicChainOutRef = useRef<AudioNode | null>(null)
  const musicElRef = useRef<HTMLAudioElement | null>(null)
  // Whether the user WANTS music playing. Distinguishes a deliberate pause from
  // an OS interruption, so recovery only restarts a track that should be running.
  const musicPlayingRef = useRef(false)
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
  // Remote participants' audio folded into the recording, keyed by identity, so
  // conversation recordings capture every speaker (not just the host mic). Kept
  // in sync as people join/leave while recording.
  const recordRemoteSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map())
  // Sound-effects bus (host side): a single published track through which
  // synthesized chimes are mixed into the broadcast (and recording).
  const fxCtxRef = useRef<AudioContext | null>(null)
  const fxGainRef = useRef<GainNode | null>(null)
  const fxTrackRef = useRef<LocalAudioTrack | null>(null)
  // Distinguishes a user-initiated disconnect (End / leave) from an unexpected
  // drop, and a callback fired only on the latter so the host can auto-recover.
  const intentionalDisconnectRef = useRef(false)
  const onDisconnectedRef = useRef<(() => void) | null>(null)
  // Tracks the last known publish permission so the permissions handler can tell
  // a genuine grant (cannot-publish → can-publish, i.e. an accepted call-in)
  // apart from a redundant permissions event. LiveKit re-emits
  // ParticipantPermissionsChanged when the roster changes (someone joins), and
  // without this guard we'd re-enable the mic every time — silently unmuting
  // anyone who had deliberately muted themselves.
  const prevCanPublishRef = useRef(false)
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
    musicPlayingRef.current = false
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
    audioElsRef.current.forEach((el) => {
      releaseRemoteAudioRoute(el)
      el.remove()
    })
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
        const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      // Studio-grade microphone capture. The browser's voice-call DSP
      // (auto-gain, noise gate, echo canceller) is what makes phone mics sound
      // thin and "pumpy" — it's tuned for compressing speech on a call, not for
      // a clean broadcast. Turning it off preserves the full dynamic range and
      // tone, at a full 48 kHz.
      //
      // The mic is captured MONO (channelCount: 1). A microphone is a single-
      // capsule mono source; asking a mono mic for a 2-channel capture makes
      // some devices place the voice in only the LEFT channel (right silent),
      // which the stereo encoder then relays faithfully — so listeners hear the
      // speaker in one ear only. Mono capture is rendered to both ears equally.
      // Echo cancellation, noise suppression and auto gain are ENABLED so a
      // speaker's own voice never returns to them when other participants are
      // unmuted on loudspeakers. The browser's acoustic echo canceller strips
      // the speaker-bleed at capture, which is what prevents the self-feedback
      // loop without muting anyone or requiring headphones. Genuine background
      // music rides a SEPARATE dedicated track, so mic DSP never touches it.
      audioCaptureDefaults: LIVE_MIC_CONSTRAINTS,
      publishDefaults: {
        // Shared high-fidelity voice preset (128 kbps MONO) — the same one the
        // video Lives use, so no Live type sounds thinner than another.
        audioPreset: LIVE_VOICE_PRESET,
        // DTX chops the stream during "silence" (adds swirl/dropouts on music
        // and room tone); RED adds packet-loss resilience. Studio audio wants
        // DTX off and RED on.
        dtx: false,
        red: true,
      },
    })
        roomRef.current = room

        room
          .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
            if (track.kind === Track.Kind.Audio) {
              // Idempotent attach: fires only for REMOTE tracks (local mic is
              // never routed back to our own speaker). `track.attach()` mints a
              // fresh element each call, so on a re-subscribe / reconnect / track
              // renegotiation the previous element for this speaker would linger
              // in the DOM still playing — a duplicate/echoing voice. Detach any
              // existing elements for this track and remove the prior per-speaker
              // element first, so one speaker == one live playback element.
              track.detach().forEach((prev) => prev.remove())
              const stale = audioElsRef.current.get(participant.identity)
              if (stale) {
                releaseRemoteAudioRoute(stale)
                stale.remove()
              }
              const el = track.attach()
              el.autoplay = true
              audioElsRef.current.set(participant.identity, el)
              document.body.appendChild(el)
              // On Android, reroute playback through the loudspeaker (no-op
              // elsewhere). Then honour the listener's current mute preference —
              // via the graph when routed, or the element otherwise.
              routeRemoteAudioToSpeaker(el)
              applyRemoteAudioMuted(el, listenerMutedRef.current)

              // If a recording is in progress, fold this speaker in so late
              // joiners are captured too.
              const recCtx = recordCtxRef.current
              const recDest = recordDestRef.current
              const remoteTrack = track.mediaStreamTrack
              if (recCtx && recDest && remoteTrack && !recordRemoteSourcesRef.current.has(participant.identity)) {
                try {
                  const src = recCtx.createMediaStreamSource(new MediaStream([remoteTrack]))
                  src.connect(recDest)
                  recordRemoteSourcesRef.current.set(participant.identity, src)
                } catch {
                  /* best-effort */
                }
              }
            }
          })
          .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
            const routed = audioElsRef.current.get(participant.identity)
            if (routed) releaseRemoteAudioRoute(routed)
            track.detach().forEach((el) => el.remove())
            audioElsRef.current.delete(participant.identity)
            // Drop this speaker from the recording bus when they leave/unpublish.
            const src = recordRemoteSourcesRef.current.get(participant.identity)
            if (src) {
              try {
                src.disconnect()
              } catch {
                /* already torn down */
              }
              recordRemoteSourcesRef.current.delete(participant.identity)
            }
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
            const justGranted = canPub && !prevCanPublishRef.current
            prevCanPublishRef.current = canPub
            update({ canPublish: canPub })
            // Only auto-open the mic on a real grant (call-in accepted). We must
            // NOT re-enable just because canPub is still true and the mic is off,
            // since that off state is often a deliberate self-mute — doing so
            // unmuted people whenever another participant joined.
            if (justGranted && !room.localParticipant.isMicrophoneEnabled) {
              try {
                await room.localParticipant.setMicrophoneEnabled(true)
                update({ micEnabled: true })
                // A listener accepted onto the panel opens a mic for the first
                // time here, which is the same moment iOS can drop the whole
                // room into the earpiece. Re-assert the loudspeaker route, or
                // being called up would make everyone else go quiet.
                applyAudioRouting()
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
            prevCanPublishRef.current = false
            cleanupRoomMedia()
            roomRef.current = null
            update({ connected: false, reconnecting: false, micEnabled: false, listeners: 0, speaking: false })
            if (!intentional) onDisconnectedRef.current?.()
          })
          .on(RoomEvent.AudioPlaybackStatusChanged, () => {
            // Reflect whether the browser is currently allowing audio playback.
            update({ audioBlocked: !room.canPlaybackAudio })
          })

        // Neutralise the audio session before any mic is opened, so the
        // post-capture assignment below reads as a real change to iOS. See
        // lib/audio-routing.ts for why the order matters.
        prepareAudioRouting()

        await room.connect(opts.serverUrl, opts.token)

        // Seed the publish-permission baseline so the permissions handler only
        // treats a later cannot-publish → can-publish change as a fresh grant.
        prevCanPublishRef.current = room.localParticipant.permissions?.canPublish ?? opts.publish

        if (opts.publish) {
          await room.localParticipant.setMicrophoneEnabled(true)
          update({ micEnabled: true })
        }

        // Now that a mic may have forced iOS into a recording session (which
        // defaults to the earpiece), push the route back out to the loudspeaker.
        // A connected Bluetooth/wired/hearing device still wins over this.
        applyAudioRouting()

        // Browsers often block autoplay until a user gesture. Try to start
        // playback; if it's blocked, surface a prompt so the user can tap to
        // enable sound (this was why nothing was audible while live).
        //
        // This runs for EVERY role, publishers included. It used to be gated
        // behind `!opts.publish`, on the assumption that a host who tapped
        // "Go live" had already satisfied the autoplay policy. But the gesture
        // that unblocks an AudioContext does not unblock the <audio> elements
        // LiveKit mints for remote speakers — those are separate elements
        // created after the gesture. So a host could be heard by everyone while
        // hearing none of their guests, and because `audioBlocked` was also
        // left unset for publishers, they never even got the "tap to enable
        // sound" prompt that would have fixed it.
        try {
          await room.startAudio()
        } catch {
          // ignore — handled via audioBlocked below
        }
        update({ audioBlocked: !room.canPlaybackAudio })

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
    // Reopening the mic can bounce iOS back to the earpiece; re-assert the
    // loudspeaker each time it goes on. (Bluetooth/wired headsets still win.)
    if (next) applyAudioRouting()
    update({ micEnabled: next })
  }, [update])

  const setListenerMuted = useCallback((muted: boolean) => {
    listenerMutedRef.current = muted
    audioElsRef.current.forEach((el) => {
      applyRemoteAudioMuted(el, muted)
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
    // A user gesture is exactly what a suspended Android playout context needs.
    resumeSpeakerPlayout()
    audioElsRef.current.forEach((el) => {
      // Unblocking playback must not override an explicit listener mute.
      applyRemoteAudioMuted(el, listenerMutedRef.current)
      void el.play().catch(() => {})
    })
    // This tap is a user gesture, which is exactly what a suspended or
    // OS-interrupted AudioContext needs to restart. Recover local monitoring
    // (own background music, soundboard) here too, so one tap fixes everything
    // the user can't hear rather than only the remote voices.
    if (musicCtxRef.current) await ensureCtxRunning(musicCtxRef.current)
    if (fxCtxRef.current) await ensureCtxRunning(fxCtxRef.current)
    // The element feeding the music graph can also be paused by an interruption.
    const musicEl = musicElRef.current
    if (musicEl && musicPlayingRef.current && musicEl.paused) void musicEl.play().catch(() => {})
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
    await ensureCtxRunning(ctx)

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
      // Shared studio chain (high-pass → warmth → harshness dip → gain →
      // compressor → limiter), identical to every other Live type. This
      // replaced a local +7 dB low shelf with no peak protection, which is what
      // made Audio/Podcast Live boomier and harsher than Video Live.
      const chain = buildMusicChain(ctx, source, musicBaseVolumeRef.current)
      // Route the music to the host's own speakers so they can monitor it (and
      // hear volume changes) exactly as it's broadcast/recorded.
      chain.output.connect(ctx.destination)
      musicSourceRef.current = source
      musicGainRef.current = chain.gain
      musicChainOutRef.current = chain.output
    }

    // Swap to the requested track and (re)start playback, honoring the loop flag.
    el.loop = musicLoopRef.current
    el.src = url
    el.currentTime = 0
    update({ musicPosition: 0 })
    musicPlayingRef.current = true
    await el.play().catch(() => {})

    // Publish the music to LiveKit once. Later track swaps keep flowing through
    // this same published stream, so listeners hear the change seamlessly.
    if (!musicTrackRef.current) {
      const chainOut = musicChainOutRef.current!
      const dest = ctx.createMediaStreamDestination()
      chainOut.connect(dest)
      const [mediaTrack] = dest.stream.getAudioTracks()
      const localTrack = new LocalAudioTrack(mediaTrack)
      // Background music IS a real stereo source, so opt this track into
      // full-stereo, highest-quality publishing. The room-wide defaults are now
      // mono (tuned for the voice mic), so stereo is requested here per-track to
      // preserve the music's stereo image for every listener.
      await room.localParticipant.publishTrack(localTrack, {
        name: "background-music",
        audioPreset: AudioPresets.musicHighQualityStereo,
        forceStereo: true,
        dtx: false,
        red: true,
      })
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
    rampGain(musicCtxRef.current, musicGainRef.current, target, ms)
  }, [])

  /**
   * Ducks (or restores) the background music around live speech. When `ducked`
   * is true the gain fades to DUCK_FACTOR of the host's base volume; otherwise
   * it fades back up to the full base. Fades are smooth (no sudden jumps), and
   * the factor is shared so ducking feels identical in every Live type.
   */
  const duckMusic = useCallback(
    (ducked: boolean, ms = 320) => {
      const base = musicBaseVolumeRef.current
      rampMusicVolume(ducked ? base * DUCK_FACTOR : base, ms)
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
    musicPlayingRef.current = playing
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
    musicPlayingRef.current = false
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
    await ensureCtxRunning(ctx)

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

      // Fold in every remote speaker already in the room so conversation
      // recordings capture all voices, not just the host's mic. Late joiners
      // are added by the TrackSubscribed handler while recording continues.
      room.remoteParticipants.forEach((p) => {
        const remoteTrack = p.getTrackPublication(Track.Source.Microphone)?.audioTrack?.mediaStreamTrack
        if (remoteTrack) {
          try {
            const src = ctx.createMediaStreamSource(new MediaStream([remoteTrack]))
            src.connect(dest)
            recordRemoteSourcesRef.current.set(p.identity, src)
          } catch {
            /* best-effort per participant */
          }
        }
      })

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
    recordRemoteSourcesRef.current.forEach((src) => {
      try {
        src.disconnect()
      } catch {
        /* already torn down */
      }
    })
    recordRemoteSourcesRef.current.clear()
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
    // Hand the audio session back. Left in the mic-oriented recording profile,
    // everything played after leaving a live — a feed video, a background
    // track — stays muffled and quiet until the tab is reloaded.
    releaseAudioRouting()
    update({ connected: false, connecting: false, reconnecting: false, micEnabled: false, listeners: 0, speaking: false })
  }, [cleanupRoomMedia, update])

  // Recover audio when the tab comes back to the foreground.
  //
  // Backgrounding a tab (switching apps, locking the screen, taking a call) is
  // the most common way the audio session gets interrupted mid-broadcast. On
  // return, contexts can still be suspended/interrupted and the remote speaker
  // elements paused — leaving someone live but deaf, with no obvious way back
  // short of rejoining. Re-asserting playback here makes that self-healing.
  useEffect(() => {
    const recover = () => {
      if (document.visibilityState !== "visible") return
      const room = roomRef.current
      if (!room) return
      void room.startAudio().catch(() => {})
      resumeSpeakerPlayout()
      audioElsRef.current.forEach((el) => {
        applyRemoteAudioMuted(el, listenerMutedRef.current)
        if (el.paused) void el.play().catch(() => {})
      })
      if (musicCtxRef.current) void ensureCtxRunning(musicCtxRef.current)
      if (fxCtxRef.current) void ensureCtxRunning(fxCtxRef.current)
      const musicEl = musicElRef.current
      if (musicEl && musicPlayingRef.current && musicEl.paused) void musicEl.play().catch(() => {})
      update({ audioBlocked: !room.canPlaybackAudio })
    }
    document.addEventListener("visibilitychange", recover)
    return () => document.removeEventListener("visibilitychange", recover)
  }, [update])

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      intentionalDisconnectRef.current = true
      onDisconnectedRef.current = null
      const room = roomRef.current
    if (room) void room.disconnect()
    audioElsRef.current.forEach((el) => {
      releaseRemoteAudioRoute(el)
      el.remove()
    })
    audioElsRef.current.clear()
    roomRef.current = null
      // Navigating away is the common way to leave a live, and it bypasses
      // disconnect() entirely — so the session has to be released here too or
      // the muffled-playback aftermath survives the exit.
      releaseAudioRouting()
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
