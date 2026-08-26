"use client"

import { useEffect, useRef } from "react"

import { getNavDepth } from "./history-key"

/**
 * Gives a full-screen overlay, modal, bottom sheet or media viewer its own
 * history entry, so the device Back button / iOS swipe-back closes THAT overlay
 * and returns to the screen underneath — rather than navigating the whole app
 * away and leaving the user to find their place again.
 *
 * This replaces several near-identical hand-rolled pushState/popstate blocks that
 * had drifted apart — some closed on Back, some left an orphan entry that made
 * the next Back a no-op, requiring two presses to leave.
 *
 * ## Why the dispatcher below is module-level rather than per-hook
 *
 * `popstate` is a *window* event: every listener attached to it receives every
 * pop. The earlier version of this hook added one listener per open overlay, so a
 * single Back press notified all of them and they all closed at once. Nesting
 * therefore collapsed instead of unwinding — Back from a video opened inside a
 * conversation dismissed the viewer *and* the conversation, dropping the reader
 * back on the list rather than on the post they were watching.
 *
 * Closing an overlay from its own UI had the mirror-image bug: cleanup calls
 * `history.back()` to retire its entry, and that synthetic pop was delivered to
 * the layer underneath, which closed too.
 *
 * So a single listener owns the event and dispatches it to the TOPMOST overlay
 * only, and pops this hook itself issues are counted and skipped. One Back — or
 * one X button — moves exactly one layer.
 *
 * @param open    Whether the overlay is currently shown.
 * @param onClose Invoked when Back dismisses it. Should only update state — do
 *                not call `history.back()` from here, or the two will fight.
 * @param id      Debug label, also used to keep sibling markers distinguishable.
 * @param opts.skipPush
 *   Set when the CURRENT history entry already represents this overlay — i.e. it
 *   was opened by a deep link rather than by a tap inside the app. Pushing in that
 *   case would make Back merely peel the overlay off and strand the user on a
 *   screen they never chose to visit; skipping it lets one Back return them to
 *   wherever they actually came from.
 */

type OverlayEntry = { token: string; close: () => void }

/** Open overlays that own a history entry, deepest last. */
const stack: OverlayEntry[] = []
/**
 * Pops this module issued itself (retiring an entry after a UI-driven close).
 * The browser delivers those as ordinary `popstate` events, so they have to be
 * counted and ignored or they would close the layer underneath as well.
 */
let selfPops = 0
let listening = false

function ensureListener() {
  if (listening || typeof window === "undefined") return
  listening = true
  window.addEventListener("popstate", () => {
    if (selfPops > 0) {
      selfPops--
      return
    }
    // Only the topmost overlay consumes this Back; anything beneath it keeps its
    // entry and closes on a later press.
    const top = stack.pop()
    top?.close()
  })
}

export function useOverlayHistory(
  open: boolean,
  onClose: () => void,
  id = "overlay",
  opts: { skipPush?: boolean } = {},
): { releaseForNavigation: () => void } {
  // Read through a ref: this is evaluated only when the overlay opens, and we do
  // not want a later change to re-run the effect and push a duplicate entry.
  const skipPushRef = useRef(opts.skipPush)
  skipPushRef.current = opts.skipPush
  // Held in a ref so a new inline closure on every render doesn't tear down and
  // rebuild the history entry, which would corrupt the stack.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // The live entry, so `releaseForNavigation` can retire the same object the
  // effect registered.
  const entryRef = useRef<OverlayEntry | null>(null)

  /**
   * Give up this overlay's history entry WITHOUT calling `history.back()`,
   * because the caller is about to navigate over it (with `router.replace`, so
   * the entry is overwritten rather than left behind).
   *
   * This exists to close a race that made drawer/menu taps look dead. Cleanup
   * below runs when the overlay unmounts, which is on a close ANIMATION timer,
   * while the tap also starts a route change. If the new route's server render
   * took longer than that timer — normal for a data-heavy page — the entry was
   * still the current one, so cleanup fired `history.back()` and yanked the user
   * off the page they were navigating to. The tap appeared to do nothing, and a
   * reload "fixed" it only because it cleared the stale entry.
   *
   * Callers must navigate with `replace` after calling this, so the entry this
   * hook pushed is consumed instead of lingering and eating the next Back.
   */
  const releaseForNavigation = () => {
    const entry = entryRef.current
    if (!entry) return
    const i = stack.indexOf(entry)
    if (i !== -1) stack.splice(i, 1)
    entryRef.current = null
  }

  useEffect(() => {
    if (!open || typeof window === "undefined") return

    // Deep-linked open: this entry already IS the overlay, so we neither push nor
    // pop. Back leaves the page naturally, which is what the user expects.
    if (skipPushRef.current) return

    ensureListener()

    const token = `${id}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    // An overlay pushes a real entry without changing the pathname, so the
    // app-wide tracker (which watches the pathname) never sees it. Stamp the depth
    // here so Back from the overlay still knows there is somewhere to return to.
    // Existing state is spread through so Next.js router internals survive.
    window.history.pushState(
      { ...(window.history.state ?? {}), __freqOverlay: token, __freqNavDepth: getNavDepth() + 1 },
      "",
    )

    const entry: OverlayEntry = { token, close: () => onCloseRef.current() }
    stack.push(entry)
    entryRef.current = entry

    return () => {
      entryRef.current = null
      const i = stack.indexOf(entry)
      // Still registered means this close came from the UI (an X button, a route
      // change) rather than from Back, so our entry is live and has to be retired
      // — otherwise it would linger and swallow the user's next Back as a no-op.
      if (i !== -1) {
        stack.splice(i, 1)
        if ((window.history.state as { __freqOverlay?: string } | null)?.__freqOverlay === token) {
          selfPops++
          window.history.back()
        }
      }
    }
  }, [open, id])

  return { releaseForNavigation }
}
