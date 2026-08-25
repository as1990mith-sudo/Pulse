/**
 * Output routing for live audio: loudspeaker or an external device, never the
 * phone's earpiece.
 *
 * The problem this solves is specific to iOS. When WebKit activates a mic via
 * `getUserMedia` it forces the underlying AVAudioSession into `play-and-record`,
 * and that mode defaults to the *receiver* — the tiny earpiece speaker you hold
 * against your ear on a phone call. So the moment a Pulse participant unmutes,
 * everyone's audio can collapse into the earpiece: the listener assumes the
 * stream broke, when in fact it is playing at earpiece volume a foot from their
 * head. Nothing in the app configured this, so the routing was left to whatever
 * the OS picked.
 *
 * Two important things this deliberately does NOT do:
 *
 *  - It does not try to *pick* a device. A connected Bluetooth headset, wired
 *    headphones, or a hearing aid already wins at the OS level, and that is the
 *    correct behaviour — someone on a hearing device must keep hearing through
 *    it. This only removes the earpiece as the fallback when no such device is
 *    connected, which leaves exactly the required outcome: loudspeaker, or the
 *    connected device.
 *
 *  - It does not use `setSinkId`. That selects an output for a single media
 *    element and is unimplemented on iOS Safari, which is the only place the
 *    earpiece problem exists.
 */

/** The subset of the WebKit Audio Session API this module relies on. */
type AudioSessionType = "auto" | "playback" | "play-and-record"

function audioSession(): { type: AudioSessionType } | null {
  if (typeof navigator === "undefined") return null
  const session = (navigator as Navigator & { audioSession?: { type: AudioSessionType } }).audioSession
  return session ?? null
}

/**
 * Call immediately BEFORE `getUserMedia`.
 *
 * Ordering is the whole trick. iOS decides the route when the session first
 * becomes a recording session, so the type has to be neutral at that moment for
 * the later assignment to be treated as a change worth re-evaluating. Setting
 * `play-and-record` up front instead means the value never changes, iOS never
 * re-evaluates, and the audio stays stuck in the earpiece.
 */
export function prepareAudioRouting(): void {
  const session = audioSession()
  if (!session) return
  try {
    session.type = "auto"
  } catch {
    // Non-fatal: an unsupported browser keeps its default routing, and every
    // platform other than iOS already prefers the loudspeaker.
  }
}

/**
 * Call immediately AFTER `getUserMedia` resolves.
 *
 * Assigning `play-and-record` now is a transition rather than a no-op, which is
 * what makes iOS recompute the route and hand back the loudspeaker (or leave a
 * connected Bluetooth/wired device in place).
 */
export function applyAudioRouting(): void {
  const session = audioSession()
  if (!session) return
  try {
    session.type = "play-and-record"
  } catch {
    // See prepareAudioRouting.
  }
}

/**
 * Call when leaving a live or a call.
 *
 * A session left in `play-and-record` stays in the low-fidelity, mic-oriented
 * profile, so ordinary media played afterwards — a feed video, a background
 * track — sounds muffled and quiet until the tab is reloaded. Stepping through
 * `playback` restores the high-fidelity output profile before going neutral.
 */
export function releaseAudioRouting(): void {
  const session = audioSession()
  if (!session) return
  try {
    session.type = "playback"
    session.type = "auto"
  } catch {
    // See prepareAudioRouting.
  }
}
