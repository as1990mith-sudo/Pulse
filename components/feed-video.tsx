"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { SKIP_SECONDS, VIDEO_CONTROLS_HEIGHT, VideoControlsBar } from "@/components/video-controls-bar"
import { exclusivePlaybackProps, installExclusivePlayback } from "@/lib/exclusive-playback"
import { getSharedMuted, noteAutoplayBlocked, setSharedMuted, useSharedMute } from "@/lib/shared-mute"
import {
  rememberVideoPosition,
  getVideoPosition,
  getImmersiveViewerOpen,
  useImmersiveViewerOpen,
} from "@/lib/video-handoff"
import { registerActiveVideo, reconcileActiveVideo, setManualActiveVideo } from "@/lib/active-video"

/**
 * A feed video with a modern, minimal custom control bar.
 *
 * Playback behavior:
 * - Auto-plays when scrolled ≥60% into view and pauses when scrolled away, so
 *   only the clip currently in view plays.
 * - Defaults to sound ON. Because browsers block autoplay-with-audio until the
 *   user has interacted with the page, we attempt an unmuted autoplay and, if
 *   the browser rejects it, fall back to muted playback. The user's mute choice
 *   is shared across all feed videos so once they unmute (or the browser allows
 *   sound) it sticks while scrolling.
 *
 * Appearance:
 * - Until the clip first starts playing we paint our own premium poster overlay
 *   on top of the element. This hides the browser's blurry default play-glyph
 *   (rendered in the <video> shadow DOM on some mobile browsers) entirely, so
 *   the user only ever sees our branded play button.
 *
 * Controls:
 * - Tap the frame to play/pause, skip ±10s, and scrub by tapping OR dragging the
 *   time track (pointer + keyboard).
 */

/** Re-exported from the shared control bar, which now owns the bar's markup and
 *  therefore its height. Kept under this name so existing overlays that clear
 *  the bar by reference keep working. */
export const FEED_VIDEO_CONTROLS_HEIGHT = VIDEO_CONTROLS_HEIGHT

export function FeedVideo({
  src,
  className,
  poster,
  trimStart,
  trimEnd,
  onAspectRatio,
  onExpand,
  resume = false,
  ignoreViewerGate = false,
  hideMuteControl = false,
  safeAreaControls = false,
  chromeVisible,
  onToggleChrome,
}: {
  src: string
  className?: string
  /** Optional cover image chosen in the editor; shown until playback starts. */
  poster?: string
  /** Trim window in seconds. Playback is kept within [trimStart, trimEnd] so
   *  viewers only ever see the trimmed selection — the file itself is untouched. */
  trimStart?: number
  trimEnd?: number
  /** Fires once real dimensions are known so a parent can size its frame to the
   *  clip's natural aspect ratio (width / height). */
  onAspectRatio?: (ratio: number) => void
  /** When provided, tapping the video surface (and the poster / center play
   *  affordances) calls this instead of toggling play — used by the community
   *  feed so tapping anywhere on the clip opens the full post. The bottom
   *  control bar still handles play/pause, seek, and mute. */
  onExpand?: () => void
  /** Start from the position the same clip (by src) last reached inline, so
   *  expanding a playing preview continues instead of restarting. */
  resume?: boolean
  /** This player owns playback (e.g. the expanded post overlay), so it should
   *  keep playing even while the immersive-viewer pause gate is active — that
   *  gate exists to silence the *inline* feed clip behind it, not this one. */
  ignoreViewerGate?: boolean
  /** Drop the mute toggle from the bottom control bar. For overlays that publish
   *  their own mute button (the full-screen action rails), where keeping this one
   *  would show two controls for the same shared mute state. Everything else in
   *  the bar — play/pause, skip, elapsed time, seek — is unaffected. */
  hideMuteControl?: boolean
  /** The player fills the screen, so its control bar sits on the device's bottom
   *  edge. Adds the safe-area inset beneath the bar to lift play/pause and the
   *  scrubber out of the home-indicator / gesture strip. Off for inline cards,
   *  which sit mid-page where that inset would only add stray padding. */
  safeAreaControls?: boolean
  /** Full-screen chrome state, owned by the overlay so the author row, caption,
   *  action rail and this control bar all fade as one. When `onToggleChrome` is
   *  supplied, tapping the video surface toggles that chrome INSTEAD of pausing —
   *  pausing is then exclusively the play/pause button's job, which is how
   *  full-screen video players are expected to behave. Leave both unset for
   *  inline cards, where a surface tap keeps its existing meaning. */
  chromeVisible?: boolean
  onToggleChrome?: () => void
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const seekRef = useRef<HTMLDivElement>(null)
  // The coordinator entry for this player, so manual play can mark it the winner.
  const entryRef = useRef<{ distanceToCenter: () => number; play: () => void; pause: () => void } | null>(null)
  const userPausedRef = useRef(false)
  const programmaticPauseRef = useRef(false)
  const draggingRef = useRef(false)
  // Whether the clip is currently scrolled into view, so we can resume the
  // right clips when the immersive viewer closes.
  const inViewRef = useRef(false)

  // While the full-screen reel viewer is open, inline feed videos must not play
  // (otherwise the feed clip and the expanded clip play at once).
  const viewerOpen = useImmersiveViewerOpen()

  // The active trim window. `windowEndRef` is finalized once real duration is
  // known (on loadedmetadata); until then it's the requested end or +Infinity.
  const windowStartRef = useRef(Math.max(0, trimStart ?? 0))
  const windowEndRef = useRef(trimEnd != null ? trimEnd : Number.POSITIVE_INFINITY)
  windowStartRef.current = Math.max(0, trimStart ?? 0)

  // Mute is a single app-wide preference shared with the expanded reel player.
  const [muted, setMuted] = useSharedMute()
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  // Stays false until the clip has begun playing at least once. While false we
  // show a full-bleed premium poster that hides the native play-glyph flash.
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (el) el.muted = muted
  }, [muted])

  // Arm the app-wide "only one recorded media element plays" guard. Idempotent,
  // so every player can safely ask for it.
  useEffect(() => {
    installExclusivePlayback()
  }, [])

  // Try to play with sound; if the browser blocks it, fall back to muted.
  const attemptPlay = useCallback((el: HTMLVideoElement) => {
    // Never autoplay while another player owns playback (expanded reel viewer or
    // the community post overlay) — unless this instance IS that owner.
    if (!ignoreViewerGate && getImmersiveViewerOpen()) return
    // Never start outside the trimmed window.
    if (el.currentTime < windowStartRef.current || el.currentTime >= windowEndRef.current) {
      try {
        el.currentTime = windowStartRef.current
      } catch {
        /* not seekable yet */
      }
    }
    el.muted = getSharedMuted()
    el.play().catch((err: unknown) => {
      // Only an autoplay-policy refusal means "the browser wants silence". An
      // `AbortError` just means this play() was superseded by a load or pause
      // (constant during scroll and hand-off); treating it as a policy block
      // muted every player app-wide for the rest of the session.
      const name = (err as { name?: string } | null)?.name
      if (name && name !== "NotAllowedError") return
      if (!getSharedMuted()) {
        // The browser refused to start with sound because the page hasn't been
        // interacted with yet. Fall back to muted playback, but record it as an
        // autoplay block rather than a mute preference — that way the first tap
        // anywhere restores sound instead of leaving the clip silently muted for
        // the rest of the session.
        noteAutoplayBlocked()
        el.muted = true
        el.play().catch(() => {})
      }
    })
  }, [ignoreViewerGate])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // An in-view player does not play itself — it registers with the app-wide
    // coordinator, which lets only the clip nearest the viewport center play and
    // pauses all the others. This is what prevents two stacked feed videos from
    // playing at once. `unregister` is (re)created as this clip enters/leaves view.
    let unregister: (() => void) | null = null

    const entry = {
      // Distance from this clip's center to the viewport center — the smallest
      // wins the single "active" slot.
      distanceToCenter: () => {
        const rect = el.getBoundingClientRect()
        const clipCenter = rect.top + rect.height / 2
        return Math.abs(clipCenter - window.innerHeight / 2)
      },
      play: () => {
        if (!userPausedRef.current) attemptPlay(el)
      },
      pause: () => {
        if (!el.paused) {
          programmaticPauseRef.current = true
          el.pause()
        }
      },
    }
    entryRef.current = entry

    const observer = new IntersectionObserver(
      ([obs]) => {
        const visible = obs.isIntersecting && obs.intersectionRatio >= 0.6
        inViewRef.current = visible
        if (visible) {
          // Become eligible to play; the coordinator decides if we actually do.
          if (!unregister) unregister = registerActiveVideo(entry)
        } else {
          // No longer eligible — leave the running set (this also pauses us) and
          // clear the user-pause flag so re-entering view can autoplay again.
          if (unregister) {
            unregister()
            unregister = null
          }
          userPausedRef.current = false
        }
      },
      { threshold: [0, 0.6, 1] },
    )
    observer.observe(el)

    // As the user scrolls between two simultaneously-visible clips, re-pick the
    // one nearest center so playback follows focus. Listen in the CAPTURE phase
    // so scrolls inside a nested scroll container (e.g. the Community Help feed,
    // which scrolls its own panel rather than the window) still trigger the
    // re-pick — scroll events don't bubble, but capture-phase listeners on
    // window receive them from any descendant scroller.
    const onScroll = () => reconcileActiveVideo()
    window.addEventListener("scroll", onScroll, { passive: true, capture: true })

    return () => {
      observer.disconnect()
      window.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions)
      if (unregister) unregister()
      entryRef.current = null
    }
  }, [attemptPlay])

  // Pause inline playback while the immersive viewer is open, and resume the
  // in-view clip (unless the user had paused it) once it closes — so expanding
  // hands playback off cleanly instead of running two videos at once.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // The owner instance (e.g. the expanded post overlay) ignores the gate.
    if (ignoreViewerGate) return
    if (viewerOpen) {
      // Record the exact position BEFORE pausing. `timeupdate` only fires every
      // ~250ms, so the last value it stored can be a quarter-second stale — and
      // if the clip was paused when the reader expanded it, `timeupdate` never
      // fired at all and no position was ever stored. Writing it here means the
      // expanded player always has an accurate point to pick up from.
      rememberVideoPosition(src, el.currentTime)
      programmaticPauseRef.current = true
      el.pause()
    } else {
      // Reverse hand-off: while the expanded player owned playback it advanced
      // the shared position for this src. Seek the inline preview there so
      // closing the expand continues from where full screen reached (not the
      // stale spot where the preview paused). For any other clip this resolves
      // to its own last position — a harmless no-op.
      //
      // The SEEK is deliberately unconditional, while only the resume respects
      // scroll position and an explicit pause. Previously both sat behind the
      // same guard, so a preview the reader had paused before expanding stayed
      // frozen on its old frame after watching a chunk full screen — the
      // position was known and simply never applied. Syncing regardless keeps
      // the two surfaces on the same frame; whether it then plays is a separate
      // question.
      const handoff = getVideoPosition(src)
      if (handoff != null && handoff >= windowStartRef.current && handoff < windowEndRef.current) {
        try {
          el.currentTime = handoff
          setCurrent(Math.max(0, handoff - windowStartRef.current))
        } catch {
          /* not seekable yet — attemptPlay clamps into the window anyway */
        }
      }
      if (inViewRef.current && !userPausedRef.current) attemptPlay(el)
    }
  }, [viewerOpen, attemptPlay, ignoreViewerGate, src])

  function togglePlay() {
    const el = ref.current
    if (!el) return
    if (el.paused) {
      userPausedRef.current = false
      // Manually starting a clip makes it the active one regardless of scroll
      // position, pausing any other inline video that happened to be playing.
      if (entryRef.current) setManualActiveVideo(entryRef.current)
      attemptPlay(el)
      reconcileActiveVideo()
    } else {
      userPausedRef.current = true
      // Releasing the manual override lets nearest-to-center selection resume.
      setManualActiveVideo(null)
      el.pause()
    }
  }

  // Tapping the video SURFACE. Full screen fades the chrome, community's inline
  // card expands the post, and a plain inline card toggles playback. Note the
  // order: chrome wins over expand, because the full-screen player is already
  // expanded and has nowhere further to go.
  const surfaceClick = onToggleChrome ?? onExpand ?? togglePlay
  const surfaceLabel = onToggleChrome ? "Show or hide controls" : onExpand ? "Open post" : "Play video"

  // Tapping the center play GLYPH, which is a distinct affordance from the
  // surface: it is a play button, so it must start playback even in full screen
  // where a surface tap only moves chrome. Without this split, the glyph would
  // fade the chrome and the clip would stay frozen with no way to resume.
  const glyphClick = onExpand ?? togglePlay
  const glyphLabel = onExpand ? "Open post" : "Play video"

  function toggleMute() {
    const el = ref.current
    const next = !muted
    setSharedMuted(next)
    if (el) {
      el.muted = next
      // Unmuting counts as a user gesture, so playback with sound is allowed.
      if (!next && el.paused && !userPausedRef.current) el.play().catch(() => {})
    }
  }

  function skip(delta: number) {
    const el = ref.current
    if (!el) return
    const ws = windowStartRef.current
    const we = Number.isFinite(windowEndRef.current) ? windowEndRef.current : el.duration || 0
    const next = Math.min(we, Math.max(ws, el.currentTime + delta))
    el.currentTime = next
    setCurrent(next - ws)
  }

  // Translate a pointer x-position over the track into a seek time.
  const seekToClientX = useCallback(
    (clientX: number) => {
      const el = ref.current
      const bar = seekRef.current
      if (!el || !bar) return
      // `duration` state is the trimmed window length; map the track to it.
      const total = duration || 0
      if (!total) return
      const rect = bar.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      el.currentTime = windowStartRef.current + ratio * total
      setCurrent(ratio * total)
    },
    [duration],
  )

  function onSeekPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    seekToClientX(e.clientX)
  }

  function onSeekPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    seekToClientX(e.clientX)
  }

  function onSeekPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* pointer already released */
    }
  }

  function onSeekKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") {
      e.preventDefault()
      skip(SKIP_SECONDS)
    } else if (e.key === "ArrowLeft") {
      e.preventDefault()
      skip(-SKIP_SECONDS)
    }
  }

  const progress = duration > 0 ? (current / duration) * 100 : 0

  // Append a media-fragment so mobile browsers decode and paint the frame at
  // 0.1s as the element's thumbnail — even before the clip scrolls fully into
  // view or starts playing. This is what makes the real first frame show
  // instead of the browser's blurry default play-glyph on a grey box.
  const posterTime = (trimStart ?? 0) > 0 ? (trimStart as number) : 0.1
  const posterSrc = src.includes("#") ? src : `${src}#t=${posterTime}`

  return (
    // Fill the parent frame (e.g. MindFeed's fixed 4:5 card) so every overlay —
    // the poster, the centered play button, and the bottom control bar — anchors
    // to the *visible* crop rather than the video's full natural height. Without
    // this the wrapper grew to the clip's intrinsic (e.g. 9:16) height, centering
    // the play button off-frame and pushing the controls out of the 4:5 view.
    <div className="group absolute inset-0 overflow-hidden bg-black">
      <video
        ref={ref}
        src={posterSrc}
        poster={poster}
        loop
        playsInline
        muted={muted}
        preload="metadata"
        {...exclusivePlaybackProps}
        className={cn("h-full w-full", className)}
        aria-label={surfaceLabel}
        onClick={surfaceClick}
        onPlay={() => {
          setPlaying(true)
          setStarted(true)
          userPausedRef.current = false
        }}
        onPause={() => {
          setPlaying(false)
          if (programmaticPauseRef.current) {
            programmaticPauseRef.current = false
            return
          }
          userPausedRef.current = true
        }}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget
          if (onAspectRatio && el.videoWidth > 0 && el.videoHeight > 0) {
            onAspectRatio(el.videoWidth / el.videoHeight)
          }
          const real = el.duration && isFinite(el.duration) ? el.duration : 0
          // Finalize the trim window against the real duration, then expose the
          // trimmed length as the video's duration so all controls treat the
          // clip as if it were exactly the selected range.
          const ws = Math.max(0, Math.min(trimStart ?? 0, real))
          const we = Math.min(trimEnd != null ? trimEnd : real, real)
          windowStartRef.current = ws
          windowEndRef.current = we > ws ? we : real
          setDuration(Math.max(0, windowEndRef.current - ws))
          // Seek to the window start so the trimmed first frame is the thumbnail —
          // unless we're resuming a hand-off, in which case continue from the
          // position the inline preview last reached (clamped to the window).
          if (!started) {
            const handoff = resume ? getVideoPosition(src) : undefined
            const resumeAt =
              handoff != null && handoff >= ws && handoff < windowEndRef.current ? handoff : ws > 0 ? ws : 0.1
            try {
              el.currentTime = resumeAt
              setCurrent(Math.max(0, resumeAt - ws))
            } catch {
              /* seek not ready yet — the media fragment still covers this */
            }
          }
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget
          // Keep playback inside the trimmed window, looping back to its start.
          if (el.currentTime >= windowEndRef.current) {
            try {
              el.currentTime = windowStartRef.current
            } catch {
              /* ignore */
            }
          } else if (el.currentTime < windowStartRef.current - 0.05) {
            try {
              el.currentTime = windowStartRef.current
            } catch {
              /* ignore */
            }
          }
          // While actively dragging, the thumb is driven by the pointer.
          if (!draggingRef.current) {
            setCurrent(Math.max(0, el.currentTime - windowStartRef.current))
          }
          // Remember the absolute position so expanding into the reel can
          // continue from exactly here instead of restarting.
          rememberVideoPosition(src, el.currentTime)
        }}
      />

      {/* Premium poster overlay — sits on top of the real first-frame thumbnail
          with a light scrim so the thumbnail stays visible, while still hiding
          the browser's blurry default play-glyph until the clip first plays. */}
      {!started && (
        <button
          type="button"
          onClick={glyphClick}
          aria-label={glyphLabel}
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/45 via-black/15 to-black/25"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-white/15 text-white shadow-lg ring-1 ring-white/25 backdrop-blur-md transition-transform duration-200 group-hover:scale-105">
            <Play className="size-7 translate-x-0.5 fill-current" />
          </span>
        </button>
      )}

      {/* Center play affordance — shown only while paused after first play.
          `pointer-events-none` on the wrapper with the button itself as the only
          hit target is deliberate: this box spans the whole frame, and if it
          stayed tappable it would swallow every surface tap while paused. In
          full screen that would defeat tap-to-toggle-chrome exactly when the
          reader is most likely to try it. */}
      {started && !playing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <button
            type="button"
            onClick={glyphClick}
            aria-label={glyphLabel}
            className="pointer-events-auto flex size-16 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/20 backdrop-blur-md transition-transform duration-200 active:scale-95"
          >
            <Play className="size-7 translate-x-0.5 fill-current" />
          </button>
        </div>
      )}

      {/* Bottom control bar — the shared one, so the community viewer and the
          main feed's reel viewer render identical controls. Its occupied height
          is published as VIDEO_CONTROLS_HEIGHT for overlays that stack chrome
          above it. */}
      <VideoControlsBar
        playing={playing}
        current={current}
        duration={duration}
        progress={progress}
        onTogglePlay={togglePlay}
        onSkip={skip}
        seekRef={seekRef}
        onSeekPointerDown={onSeekPointerDown}
        onSeekPointerMove={onSeekPointerMove}
        onSeekPointerUp={onSeekPointerUp}
        onSeekKeyDown={onSeekKeyDown}
        muted={hideMuteControl ? undefined : muted}
        onToggleMute={hideMuteControl ? undefined : toggleMute}
        safeArea={safeAreaControls}
        // Full screen ties the bar to the overlay's chrome so it fades together
        // with the author row and action rail. Inline cards keep the old rule of
        // appearing once playback has started.
        visible={onToggleChrome ? !!chromeVisible : started}
      />
    </div>
  )
}
