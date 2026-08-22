/**
 * Shared studio-quality audio processing for every Live experience.
 *
 * All four Live types (Video Live, Video Live second format, Audio Live and
 * Podcast Live) build their background-music graph from this one module, so a
 * listener never notices that one Live type is louder or harsher than another.
 * Previously each hook hand-rolled its own chain and they had genuinely drifted
 * apart: the audio hook ran a +7 dB low shelf while the video hook had already
 * been corrected to +2 dB, which is exactly why Audio/Podcast Live sounded
 * boomier and more fatiguing than Video Live.
 *
 * The chain is deliberately gentle — the target is "professional studio
 * recording", not a heavily-processed radio voice:
 *
 *   source → highpass → lowshelf → presence dip → gain → compressor → limiter → out
 *
 *  - HIGH-PASS (30 Hz) removes subsonic rumble that eats headroom and makes
 *    small speakers flap without ever being heard as pitch.
 *  - LOW SHELF (+2.5 dB @ 180 Hz) adds warmth and a little bass richness. Kept
 *    subtle on purpose: a big shelf is what smears sustained music into mud.
 *  - PRESENCE DIP (−2 dB @ 3.2 kHz) tames the exact band the ear finds harsh
 *    and fatiguing. This is the single biggest win against "piercing" audio and
 *    costs almost no clarity, because intelligibility lives lower (1–2 kHz).
 *  - COMPRESSOR is slow and shallow (ratio 2:1, 12 ms attack) so it controls
 *    peaks without pumping or squashing dynamics.
 *  - LIMITER is a brick-wall safety net (ratio 20:1 at −1.5 dBFS) that prevents
 *    clipping and distortion no matter what the host uploads or how loud they
 *    push the volume slider. Nothing else in the old chain protected the peak,
 *    which is why loud tracks distorted rather than simply sounding loud.
 */

/** Node handles a caller needs to keep for live control (volume, ducking). */
export type MusicChain = {
  /** Host-controlled volume. Ducking ramps this node, not the element volume. */
  gain: GainNode
  /** Final node in the chain — connect this to destinations (monitor/publish). */
  output: AudioNode
}

/**
 * Builds the shared music processing chain from `source` and returns the
 * volume gain plus the chain's output node.
 *
 * The caller connects `output` to as many destinations as it needs (the host's
 * own speakers for monitoring, a MediaStreamDestination for publishing, and a
 * recording mixer), guaranteeing the monitor, the broadcast and the recording
 * all hear the identical processed signal.
 */
export function buildMusicChain(ctx: AudioContext, source: AudioNode, baseVolume: number): MusicChain {
  // Subsonic cleanup first: filtering rumble before any gain stage means the
  // compressor and limiter aren't wasting their range on energy nobody hears.
  const highpass = ctx.createBiquadFilter()
  highpass.type = "highpass"
  highpass.frequency.value = 30
  highpass.Q.value = 0.7

  // Warmth / gentle bass richness.
  const lowShelf = ctx.createBiquadFilter()
  lowShelf.type = "lowshelf"
  lowShelf.frequency.value = 180
  lowShelf.gain.value = 2.5

  // Harshness control. A wide, shallow cut through the "ear pain" band.
  const presence = ctx.createBiquadFilter()
  presence.type = "peaking"
  presence.frequency.value = 3200
  presence.Q.value = 0.9
  presence.gain.value = -2

  // Host-controlled volume. Ducking ramps this node (see rampGain below).
  const gain = ctx.createGain()
  gain.gain.value = baseVolume

  // Gentle glue compression — controlled, never pumping.
  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -20
  compressor.knee.value = 24
  compressor.ratio.value = 2
  compressor.attack.value = 0.012
  compressor.release.value = 0.28

  // Brick-wall peak protection so nothing can clip or distort.
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -1.5
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.002
  limiter.release.value = 0.12

  source.connect(highpass)
  highpass.connect(lowShelf)
  lowShelf.connect(presence)
  presence.connect(gain)
  gain.connect(compressor)
  compressor.connect(limiter)

  return { gain, output: limiter }
}

/**
 * How far the music drops under live speech, as a fraction of the host's base
 * volume. Shared so ducking feels identical in every Live type.
 */
export const DUCK_FACTOR = 0.18

/**
 * Smoothly ramps a gain node toward `target` over `ms`.
 *
 * Uses a linear ramp from the CURRENT value (captured via setValueAtTime) so
 * repeated calls mid-ramp continue smoothly from where they are instead of
 * jumping — that jump is what made ducking sound abrupt. Values are floored
 * just above zero because exponential-style audio ramps can't reach 0.
 */
export function rampGain(ctx: AudioContext | null, gain: GainNode | null, target: number, ms: number) {
  if (!gain) return
  if (!ctx) {
    gain.gain.value = target
    return
  }
  const now = ctx.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(gain.gain.value, now)
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, target), now + Math.max(0.01, ms / 1000))
}

/**
 * Shared voice publishing preset: 128 kbps MONO, far above the default ~24 kbps
 * speech codec, so voices stay full and detailed rather than thin.
 *
 * Mono is deliberate — `forceStereo` is NOT set, because forcing a stereo image
 * onto a single-capsule mic is what puts a speaker in one ear only. Background
 * music opts into real stereo on its own dedicated track.
 *
 * Audio Live previously published voice at 96 kbps while video Lives used
 * 128 kbps; sharing one value removes that audible step between Live types.
 */
export const LIVE_VOICE_PRESET = { maxBitrate: 128_000, priority: "high" } as const

/**
 * Shared microphone capture constraints for voices that are clear, warm and
 * naturally intelligible across all four Live types.
 *
 * Mono capture is deliberate: a mic is a single-capsule mono source, and asking
 * some devices for 2 channels puts the voice in the LEFT channel only, so
 * listeners hear the speaker in one ear. The browser DSP (echo cancellation,
 * noise suppression, auto gain) stays ENABLED so a speaker's own voice never
 * loops back to them on loudspeakers; genuine music rides a separate track that
 * mic DSP never touches.
 */
export const LIVE_MIC_CONSTRAINTS = {
  autoGainControl: true,
  echoCancellation: true,
  noiseSuppression: true,
  // Stronger, neural (Krisp-style) noise removal — the single biggest
  // cleanliness win for the mic: it strips room tone, fans, HVAC, traffic and
  // handling noise far more aggressively than plain noiseSuppression, isolating
  // just the speaker's voice. An experimental constraint, so a browser that
  // doesn't support it simply ignores the value and falls back to
  // noiseSuppression above — never worse, cleaner where available. This was
  // previously only set for video Lives; sharing it lifts Audio and Podcast
  // Live to the same standard.
  voiceIsolation: true,
  channelCount: 1,
  sampleRate: 48000,
  // Full 16-bit sample depth for maximum dynamic range before Opus encoding
  // (a quieter, cleaner noise floor).
  sampleSize: 16,
} as const
