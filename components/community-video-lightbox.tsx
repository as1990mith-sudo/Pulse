"use client"

import { useEffect } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { FeedVideo } from "@/components/feed-video"
import { setImmersiveViewerOpen } from "@/lib/video-handoff"
import { useOverlayHistory } from "@/lib/navigation/use-overlay-history"

/**
 * Shared full-screen viewer for a Community Help attached video, used by BOTH
 * the preview feed and the expanded conversation so the behaviour is identical
 * everywhere.
 *
 * It renders the same `FeedVideo` player used inline (branded controls, ±10s
 * skip, draggable scrubber and the app-wide shared mute) letterboxed with
 * `object-contain` on a black backdrop, so the clip fills the screen at its true
 * aspect ratio. Using the same player — rather than a second, independent
 * `<video>` — is what makes the transition instant and seamless:
 *
 *  - `resume` continues from exactly where the inline preview reached (playback
 *    positions are shared by `src` via video-handoff), so opening and closing
 *    never restart the clip or flash a reload.
 *  - `ignoreViewerGate` lets this player own playback while the inline preview is
 *    unmounted, so only one `<video>` ever plays.
 *  - `FeedVideo` reads the single app-wide shared mute, so the sound state
 *    carries in BOTH directions — unmuting in the preview stays unmuted full
 *    screen, and vice versa (no surprise re-mute when switching views).
 *
 * While open it raises the (ref-counted) immersive-viewer gate so any OTHER feed
 * videos pause, and pushes a history entry so the device / browser Back button
 * simply dismisses this overlay and lands back on whichever page was underneath
 * (the preview feed or the expanded conversation) — the same result as tapping
 * the close button.
 */
export function VideoLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  // Back / back-gesture dismisses the overlay rather than navigating away. The
  // hook holds `onClose` in a ref, so an inline arrow from the parent no longer
  // tears down and re-pushes the history entry on every render — which is what
  // the old `[onClose]` dependency did.
  useOverlayHistory(true, onClose, "video-lightbox")

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)

    // Pause every other feed video behind the overlay (ref-counted so it composes
    // with an already-open conversation gate).
    setImmersiveViewerOpen(true)

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
      setImmersiveViewerOpen(false)
    }
  }, [onClose])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Attached video"
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black duration-200 animate-in fade-in"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-10 flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
      >
        <X className="size-5" />
      </button>
      {/* Stop backdrop clicks so tapping the video toggles play instead of closing. */}
      <div onClick={(e) => e.stopPropagation()} className="relative h-full max-h-[100dvh] w-full max-w-[100vw]">
        <FeedVideo src={src} className="h-full w-full object-contain" resume ignoreViewerGate />
      </div>
    </div>,
    document.body,
  )
}
