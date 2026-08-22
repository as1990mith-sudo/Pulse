/**
 * Shared AudioContext recovery used by both the audio-live and video-live hooks.
 *
 * Lives in its own module so the two hooks can't drift apart on this: a fix to
 * interruption handling has to apply everywhere a live session mixes music.
 */

const ctxWatched = new WeakSet<AudioContext>()

/**
 * Resumes an AudioContext that isn't running, and keeps it that way.
 *
 * Two things this handles that a bare `if (ctx.state === "suspended")` misses:
 *
 *  - Safari/iOS also uses the non-standard `"interrupted"` state when the OS
 *    takes over the audio session (incoming call, another app, a route change
 *    like plugging in headphones, screen lock). A context in that state is not
 *    `"suspended"`, so a suspended-only check silently skips it and the host's
 *    local monitoring — their own background music — stays dead for the rest of
 *    the session even though listeners keep receiving the published track.
 *
 *  - An interruption can land at any time, not only when we happen to be
 *    starting a track. The `statechange` listener re-resumes whenever the
 *    context drops out of `"running"`, so recovery is automatic.
 *
 * Attaching the listener is idempotent via a WeakSet, so repeat calls on the
 * same context don't stack up handlers.
 */
export async function ensureCtxRunning(ctx: AudioContext) {
  if (!ctxWatched.has(ctx)) {
    ctxWatched.add(ctx)
    ctx.addEventListener("statechange", () => {
      if (ctx.state !== "running" && ctx.state !== "closed") void ctx.resume().catch(() => {})
    })
  }
  if (ctx.state !== "running") {
    try {
      await ctx.resume()
    } catch {
      // Resume needs a user gesture in some states; the statechange listener and
      // the next explicit play both retry, so a failure here isn't terminal.
    }
  }
}
