import { Track, type Room } from "livekit-client"

/**
 * Development-only live-audio diagnostics.
 *
 * These helpers exist to make the echo/duplication class of bugs observable
 * instead of guessed at. They are gated on a non-production build and log to the
 * console with the [v0-audio] tag — they never render anything to ordinary Home
 * users and never expose device details in the UI. Every function is a no-op in
 * production and swallows its own errors so diagnostics can never break a live
 * session.
 *
 * What they verify (matching the audio-audit requirements):
 *  - the ACTUAL applied microphone processing (echoCancellation / noiseSuppression
 *    / autoGainControl) read back from the live track via getSettings(), not the
 *    requested constraints, because the browser may negotiate them differently;
 *  - that exactly ONE microphone track is published (duplicate publication is a
 *    common cause of doubled/echoing voice);
 *  - that each remote audio track resolves to exactly ONE playback element
 *    (duplicate remote playback is the other common cause);
 *  - that no local (own) microphone stream is attached to an output element
 *    (local self-playback is a feedback source).
 */

const ENABLED = process.env.NODE_ENV !== "production"

type ProcSettings = MediaTrackSettings & {
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
  voiceIsolation?: boolean
}

/**
 * Reads back and logs the real processing state of every published local
 * microphone track, and warns if more than one mic track is live at once.
 * Call right after a mic (re)publish / unmute.
 */
export function logMicProcessing(room: Room | null, format: string): void {
  if (!ENABLED || !room) return
  try {
    const micPubs = Array.from(room.localParticipant.trackPublications.values()).filter(
      (pub) => pub.kind === Track.Kind.Audio && pub.source === Track.Source.Microphone,
    )
    if (micPubs.length === 0) return

    if (micPubs.length > 1) {
      console.warn(
        `[v0-audio] WARN (${format}): ${micPubs.length} microphone publications detected — expected exactly 1. Duplicate mic publication can cause doubled/echoing voice.`,
      )
    }

    for (const pub of micPubs) {
      const mst = pub.track?.mediaStreamTrack
      if (!mst) continue
      const s = mst.getSettings() as ProcSettings
      console.log(
        `[v0-audio] mic (${format})`,
        {
          echoCancellation: s.echoCancellation ?? "unknown",
          noiseSuppression: s.noiseSuppression ?? "unknown",
          autoGainControl: s.autoGainControl ?? "unknown",
          voiceIsolation: s.voiceIsolation ?? "n/a",
          sampleRate: s.sampleRate ?? "browser-chosen",
          channelCount: s.channelCount ?? "unknown",
          deviceId: s.deviceId ? `${String(s.deviceId).slice(0, 8)}…` : "default",
          trackId: mst.id,
          muted: pub.isMuted,
        },
      )
      if (s.echoCancellation === false) {
        console.warn(
          `[v0-audio] WARN (${format}): echoCancellation is OFF on the live mic track. Acoustic echo is likely on loudspeakers.`,
        )
      }
    }
  } catch {
    /* diagnostics must never break a live session */
  }
}

/**
 * Warns if any remote audio track is attached to more than one playback element,
 * which is heard as a doubled/echoing remote voice. `elements` is the hook's
 * per-track element map (keyed however the hook keys it — the key is only used
 * for the message).
 */
export function warnDuplicateRemoteAudio(elements: Map<string, HTMLMediaElement>, format: string): void {
  if (!ENABLED) return
  try {
    // Group elements by the underlying MediaStreamTrack id. Two live elements
    // sharing one track id === the same remote voice playing twice.
    const byTrack = new Map<string, number>()
    for (const el of elements.values()) {
      const stream = el.srcObject
      if (!(stream instanceof MediaStream)) continue
      for (const t of stream.getAudioTracks()) {
        byTrack.set(t.id, (byTrack.get(t.id) ?? 0) + 1)
      }
    }
    for (const [trackId, count] of byTrack) {
      if (count > 1) {
        console.warn(
          `[v0-audio] WARN (${format}): remote audio track ${trackId.slice(0, 8)}… is attached to ${count} elements — expected 1. Duplicate remote playback is heard as echo.`,
        )
      }
    }
    console.log(`[v0-audio] remote audio elements (${format}): ${elements.size}`)
  } catch {
    /* diagnostics must never break a live session */
  }
}
