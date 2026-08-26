"use client"

/**
 * A last-line guarantee that only ONE piece of recorded media is ever audible.
 *
 * `active-video.ts` already coordinates inline `FeedVideo` clips against each
 * other, and `video-handoff.ts` coordinates inline clips against the immersive
 * viewer. Both work by asking cooperating players to pause. But the app has
 * other players that were never part of either scheme — the persistent episode
 * player mounted above the router, the chat media lightbox, the live-replay
 * player — so an episode could keep narrating while a feed clip started, and
 * two soundtracks would overlap.
 *
 * Rather than teach every player about every other player, this listens for the
 * DOM's own `play` event: whenever a participating element starts, every OTHER
 * participating element is paused. Media coordinates itself through the browser,
 * so a new player is covered the moment it opts in.
 *
 * Opt-in is deliberate. Live call tiles (LiveKit in `dm-call`, `chatroom-call`,
 * `conversation-video`) are also `<video>` elements, and in a call MANY of them
 * must play at once — a blanket rule would silence everyone but the last person
 * to join. Only recorded-media players carry the attribute; call tiles never do,
 * so they are untouched.
 */

/** Marks a media element as participating in exclusive playback. */
export const EXCLUSIVE_PLAYBACK_ATTR = "data-exclusive-playback"

/** Spread onto a `<video>`/`<audio>` element to enrol it. */
export const exclusivePlaybackProps = { [EXCLUSIVE_PLAYBACK_ATTR]: "" } as const

let installed = false

/**
 * Install the document-level guard. Safe to call repeatedly and from any player;
 * only the first call does anything, so each participating player can call it
 * from an effect without coordinating with the others.
 */
export function installExclusivePlayback() {
  if (installed || typeof document === "undefined") return
  installed = true

  // Capture phase: `play` does not bubble, so a listener on document only sees
  // it during capture.
  document.addEventListener(
    "play",
    (event) => {
      const target = event.target
      if (!(target instanceof HTMLMediaElement)) return
      if (!target.hasAttribute(EXCLUSIVE_PLAYBACK_ATTR)) return

      const others = document.querySelectorAll<HTMLMediaElement>(`[${EXCLUSIVE_PLAYBACK_ATTR}]`)
      for (const other of others) {
        // `paused` is already false for the element that just started, so the
        // identity check is what stops us pausing the new arrival itself.
        if (other !== target && !other.paused) other.pause()
      }
    },
    true,
  )
}
