/**
 * Synthesizes phone ring tones with the Web Audio API so we don't ship an audio
 * asset. Two patterns:
 *  - "incoming": the classic two-tone warble a callee hears.
 *  - "ringback": the single mid tone the caller hears while waiting.
 *
 * Each call to start() returns a stop() function. The tones loop on a timer
 * until stopped.
 */
type RingKind = "incoming" | "ringback"

export function startRingtone(kind: RingKind): () => void {
  // Guard against SSR / unsupported browsers.
  if (typeof window === "undefined") return () => {}
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return () => {}

  let ctx: AudioContext
  try {
    ctx = new AudioCtx()
  } catch {
    return () => {}
  }

  // Some browsers start the context suspended until a user gesture; resume best-effort.
  void ctx.resume?.()

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const master = ctx.createGain()
  master.gain.value = 0.0001
  master.connect(ctx.destination)

  /** Plays a single beep at a frequency for a duration with a soft envelope. */
  function beep(freq: number, startAt: number, duration: number) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = freq
    osc.connect(gain)
    gain.connect(master)

    const peak = 0.22
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.04)
    gain.gain.setValueAtTime(peak, startAt + duration - 0.06)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)

    osc.start(startAt)
    osc.stop(startAt + duration + 0.02)
  }

  // Bring the master gain up once we're ready to play.
  master.gain.setValueAtTime(1, ctx.currentTime)

  function playPattern() {
    if (stopped) return
    const now = ctx.currentTime
    if (kind === "incoming") {
      // Two short warbling pairs, then a pause — repeats every ~3s.
      beep(440, now, 0.4)
      beep(480, now + 0.45, 0.4)
      beep(440, now + 1.1, 0.4)
      beep(480, now + 1.55, 0.4)
      timer = setTimeout(playPattern, 3000)
    } else {
      // Ringback: a 1s tone followed by a 2s gap (NA-style ~ adapted).
      beep(420, now, 1.0)
      timer = setTimeout(playPattern, 3000)
    }
  }

  playPattern()

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    try {
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.setValueAtTime(0.0001, ctx.currentTime)
      void ctx.close()
    } catch {
      // ignore teardown errors
    }
  }
}
