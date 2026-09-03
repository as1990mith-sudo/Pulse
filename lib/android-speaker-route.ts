/**
 * Forces remote-participant audio to the LOUDSPEAKER on Android.
 *
 * The problem: unlike iOS (see lib/audio-routing.ts, which uses the WebKit Audio
 * Session API), Android Chromium exposes no web API to choose the output device.
 * While a local mic track is live, Chromium classifies WebRTC `<audio>` playback
 * as a voice call and routes it to the EARPIECE (the small speaker you hold to
 * your ear). For a broadcast/podcast/meeting host that's wrong — they want the
 * loudspeaker.
 *
 * The only reliable web-level lever: play the remote audio through the Web Audio
 * graph (AudioContext → destination) instead of the media element's own output.
 * AudioContext output is treated as MEDIA playback, which Android sends to the
 * loudspeaker even with the mic open. The catch is a long-standing Chromium
 * quirk (crbug.com/933677): a MediaStreamAudioSourceNode built from a remote
 * WebRTC stream produces silence UNLESS that same stream is also attached to a
 * live media element. So we keep LiveKit's `<audio>` element around, but MUTED,
 * purely as a "primer" — all audible output flows through the graph.
 *
 * This is a no-op on every non-Android platform: iOS is handled by the Audio
 * Session API and desktop already uses the loudspeaker, so there we leave the
 * element's own output alone and callers fall back to `el.muted`.
 */

import { ensureCtxRunning } from "@/lib/audio-context"

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false
  // Covers Android Chrome and Chromium-based WebViews (e.g. Median wrappers).
  return /Android/i.test(navigator.userAgent)
}

type Route = {
  source: MediaStreamAudioSourceNode
  gain: GainNode
}

// One AudioContext dedicated to remote playout, kept separate from the
// music/fx/recording contexts the hooks own so its lifecycle stays independent.
let playoutCtx: AudioContext | null = null

function getPlayoutCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!playoutCtx || playoutCtx.state === "closed") {
    playoutCtx = new Ctor()
  }
  void ensureCtxRunning(playoutCtx)
  return playoutCtx
}

// element → its live graph. WeakMap so removed elements are collected freely.
const routes = new WeakMap<HTMLMediaElement, Route>()

/**
 * Route a just-attached remote audio element through the loudspeaker on Android.
 * No-op (returns false) elsewhere, or if the element has no usable stream yet —
 * callers then keep using the element's own output via `applyRemoteAudioMuted`.
 */
export function routeRemoteAudioToSpeaker(el: HTMLMediaElement): boolean {
  if (!isAndroid()) return false
  const stream = el.srcObject
  if (!(stream instanceof MediaStream) || stream.getAudioTracks().length === 0) return false
  const ctx = getPlayoutCtx()
  if (!ctx) return false
  try {
    const source = ctx.createMediaStreamSource(stream)
    const gain = ctx.createGain()
    source.connect(gain)
    gain.connect(ctx.destination)
    // Element becomes the silent primer; the graph is now the audible path.
    el.muted = true
    routes.set(el, { source, gain })
    return true
  } catch {
    // If anything fails, leave the element's own output intact.
    return false
  }
}

/**
 * Mute/unmute a remote audio element in a way that respects the Android route:
 * when routed, the element must STAY muted (it's the primer) and muting happens
 * on the graph gain instead. Off Android it's a plain element mute.
 */
export function applyRemoteAudioMuted(el: HTMLMediaElement, muted: boolean): void {
  const route = routes.get(el)
  if (route) {
    try {
      route.gain.gain.value = muted ? 0 : 1
    } catch {
      /* graph already torn down */
    }
    return
  }
  el.muted = muted
}

/** Tear down the graph for an element that's being detached/removed. */
export function releaseRemoteAudioRoute(el: HTMLMediaElement): void {
  const route = routes.get(el)
  if (!route) return
  try {
    route.source.disconnect()
  } catch {
    /* already gone */
  }
  try {
    route.gain.disconnect()
  } catch {
    /* already gone */
  }
  routes.delete(el)
}

/**
 * Resume the playout context from a user gesture (the same tap that unblocks
 * LiveKit audio). Android autoplay policy can leave a fresh context suspended.
 */
export function resumeSpeakerPlayout(): void {
  if (playoutCtx) void ensureCtxRunning(playoutCtx)
}
