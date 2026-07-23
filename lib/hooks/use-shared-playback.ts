"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { recordEpisodeView } from "@/app/actions/engagement"

export const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const

export function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return "0:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}

/**
 * SharedPlaybackEngine — headless playback logic shared by every video player
 * (the existing YouTube-style `EpisodePlayer` and the new `LiveReplayPlayer`).
 *
 * It owns nothing about layout: it exposes a `mediaRef` (attach to the
 * `<video>`), a `frameRef` (the element that goes fullscreen so custom controls
 * stay visible), the playback state, and imperative actions. Each player renders
 * its own interface around this identical engine, so behaviour — seek, ±skip,
 * speed, fullscreen, native Picture-in-Picture, view analytics and the
 * Infinity-duration fix for recorded/streamed blobs — is guaranteed consistent.
 */
export function useSharedPlayback(opts: {
  episodeId?: number | null
  /** When true, decode a frame at 0.1s so a poster paints without a real cover. */
  hasRealCover?: boolean
  /** Skip amount in seconds for rewind/forward. Defaults to 15. */
  skipSeconds?: number
}) {
  const { episodeId, hasRealCover = false, skipSeconds = 15 } = opts

  const mediaRef = useRef<HTMLVideoElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speedIdx, setSpeedIdx] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPip, setIsPip] = useState(false)

  const viewRecordedRef = useRef(false)

  // Reset the view guard whenever the episode changes so a fresh open can count.
  useEffect(() => {
    viewRecordedRef.current = false
  }, [episodeId])

  // Record one view once playback passes 5% of the episode length.
  useEffect(() => {
    if (viewRecordedRef.current) return
    if (!episodeId || !duration || duration <= 0) return
    if (current / duration >= 0.05) {
      viewRecordedRef.current = true
      void recordEpisodeView(episodeId)
    }
  }, [current, duration, episodeId])

  const toggle = useCallback(() => {
    const el = mediaRef.current
    if (!el) return
    if (el.paused) void el.play().catch(() => {})
    else el.pause()
  }, [])

  const skip = useCallback(
    (delta: number) => {
      const el = mediaRef.current
      if (!el) return
      const t = Math.min(Math.max(0, el.currentTime + delta), duration || el.duration || 0)
      el.currentTime = t
      setCurrent(t)
    },
    [duration],
  )

  const rewind = useCallback(() => skip(-skipSeconds), [skip, skipSeconds])
  const forward = useCallback(() => skip(skipSeconds), [skip, skipSeconds])

  const cycleSpeed = useCallback(() => {
    setSpeedIdx((prev) => {
      const next = (prev + 1) % PLAYBACK_SPEEDS.length
      if (mediaRef.current) mediaRef.current.playbackRate = PLAYBACK_SPEEDS[next]
      return next
    })
  }, [])

  const seekTo = useCallback((t: number) => {
    const el = mediaRef.current
    if (!el) return
    el.currentTime = t
    setCurrent(t)
  }, [])

  // Native OS Picture-in-Picture (distinct from the app's in-page mini-player).
  const togglePip = useCallback(async () => {
    const el = mediaRef.current as
      | (HTMLVideoElement & { requestPictureInPicture?: () => Promise<PictureInPictureWindow> })
      | null
    if (!el) return
    try {
      const doc = document as Document & { pictureInPictureElement?: Element; exitPictureInPicture?: () => Promise<void> }
      if (doc.pictureInPictureElement) {
        await doc.exitPictureInPicture?.()
      } else if (typeof el.requestPictureInPicture === "function") {
        await el.requestPictureInPicture()
      }
    } catch {
      /* user dismissed or PiP unsupported */
    }
  }, [])

  // YouTube-style fullscreen: put the whole frame into fullscreen so custom
  // controls stay visible, and lock landscape. iOS falls back to native video FS.
  const toggleFullscreen = useCallback(async () => {
    const fsEl =
      document.fullscreenElement ?? (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement
    if (fsEl) {
      try {
        if (document.exitFullscreen) await document.exitFullscreen()
        else (document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen?.()
      } catch {
        /* ignore */
      }
      return
    }
    const frame = frameRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      | null
    const video = mediaRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    try {
      if (frame?.requestFullscreen) {
        await frame.requestFullscreen()
      } else if (frame?.webkitRequestFullscreen) {
        await frame.webkitRequestFullscreen()
      } else if (video && typeof video.webkitEnterFullscreen === "function") {
        video.webkitEnterFullscreen()
        return
      }
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: "landscape" | "portrait") => Promise<void>
      }
      if (orientation && typeof orientation.lock === "function") {
        await orientation.lock("landscape").catch(() => {})
      }
    } catch {
      /* user dismissed or the browser blocked the request */
    }
  }, [])

  // Track fullscreen state and release the orientation lock when exited.
  useEffect(() => {
    const onFsChange = () => {
      const active = Boolean(
        document.fullscreenElement ??
          (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement,
      )
      setIsFullscreen(active)
      if (!active) {
        try {
          screen.orientation?.unlock?.()
        } catch {
          /* unlock unsupported */
        }
      }
    }
    document.addEventListener("fullscreenchange", onFsChange)
    document.addEventListener("webkitfullscreenchange", onFsChange)
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange)
      document.removeEventListener("webkitfullscreenchange", onFsChange)
    }
  }, [])

  // Track native PiP enter/leave to reflect the button state.
  useEffect(() => {
    const el = mediaRef.current
    if (!el) return
    const onEnter = () => setIsPip(true)
    const onLeave = () => setIsPip(false)
    el.addEventListener("enterpictureinpicture", onEnter)
    el.addEventListener("leavepictureinpicture", onLeave)
    return () => {
      el.removeEventListener("enterpictureinpicture", onEnter)
      el.removeEventListener("leavepictureinpicture", onLeave)
    }
  }, [])

  // Bind the core media events. Recorded/streamed blobs often report duration as
  // Infinity until scanned to the end; force a seek to expose the real length.
  const bindMediaEvents = useCallback(
    (el: HTMLVideoElement) => {
      const onPlay = () => setPlaying(true)
      const onPause = () => setPlaying(false)
      const onTime = () => setCurrent(el.currentTime)
      el.addEventListener("play", onPlay)
      el.addEventListener("pause", onPause)
      el.addEventListener("timeupdate", onTime)
      return () => {
        el.removeEventListener("play", onPlay)
        el.removeEventListener("pause", onPause)
        el.removeEventListener("timeupdate", onTime)
      }
    },
    [],
  )

  const onLoadedMetadata = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const el = e.currentTarget
      if (el.duration === Infinity || Number.isNaN(el.duration)) {
        const onUpdate = () => {
          if (el.duration !== Infinity && !Number.isNaN(el.duration)) {
            setDuration(el.duration)
            el.currentTime = hasRealCover ? 0 : 0.1
            el.removeEventListener("timeupdate", onUpdate)
          }
        }
        el.addEventListener("timeupdate", onUpdate)
        el.currentTime = 1e7
      } else {
        setDuration(el.duration)
        if (!hasRealCover && el.currentTime === 0) {
          try {
            el.currentTime = 0.1
          } catch {
            /* ignore seek errors */
          }
        }
      }
    },
    [hasRealCover],
  )

  const pct = duration > 0 ? (current / duration) * 100 : 0

  return {
    mediaRef,
    frameRef,
    // state
    playing,
    current,
    duration,
    pct,
    speed: PLAYBACK_SPEEDS[speedIdx],
    isFullscreen,
    isPip,
    // actions
    toggle,
    skip,
    rewind,
    forward,
    cycleSpeed,
    seekTo,
    togglePip,
    toggleFullscreen,
    // media wiring
    bindMediaEvents,
    onLoadedMetadata,
    setPlaying,
    setCurrent,
    setDuration,
  }
}
