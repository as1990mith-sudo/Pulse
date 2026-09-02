"use client"

/* eslint-disable @typescript-eslint/no-explicit-any */

// The synchronised "Video" resource. The host loads a video — an uploaded file
// or a YouTube link — and drives play/pause/seek/stop; every participant's
// player follows the shared server state in real time, so the room watches
// together. A late joiner instantly lands at the current position. The live
// keeps running underneath: this is a floating popup player, never a takeover.

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import {
  Film,
  Link2,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Square,
  Upload,
  Volume2,
  VolumeX,
} from "lucide-react"
import { useLiveResources } from "@/components/live/resource/resource-context"
import {
  controlVideo,
  getVideoState,
  recognizeYouTube,
  setVideoSource,
  type LiveVideoState,
} from "@/app/actions/live-video-resource"
import { uploadMedia } from "@/lib/upload-media"
import { youTubeId } from "@/lib/materials"
import { formatTime } from "@/lib/hooks/use-shared-playback"
import { loadYouTubeApi } from "@/lib/youtube-iframe"

// How far a follower may drift from the host before we snap-seek (seconds).
const DRIFT_SEC = 1.25
// Follower reconciliation tick.
const SYNC_TICK_MS = 500
// While the host is playing, re-anchor the shared position periodically so
// late joiners land accurately even between explicit transport actions.
const HOST_HEARTBEAT_MS = 4000

type ActiveState = NonNullable<LiveVideoState>

// The uniform imperative surface every stage exposes to the sync engine, so the
// follow/heartbeat logic is identical for <video> and the YouTube player.
type PlayerHandle = {
  play: () => void
  pause: () => void
  seek: (sec: number) => void
  getTime: () => number
  isPlaying: () => boolean
  setMuted: (muted: boolean) => void
}

export function MiniVideoPanel() {
  const { descriptor } = useLiveResources()
  const roomName = descriptor?.roomName ?? null
  const isHost = descriptor?.isHost ?? false

  const { data, mutate } = useSWR<LiveVideoState>(
    roomName ? ["live-video", roomName] : null,
    () => getVideoState(roomName as string),
    { refreshInterval: 1200, revalidateOnFocus: false },
  )

  if (!roomName) return null

  // No active video: host sees the loader, everyone else an empty state.
  if (!data) {
    return isHost ? (
      <HostLoader roomName={roomName} onLoaded={() => mutate()} />
    ) : (
      <EmptyState />
    )
  }

  return (
    <div className="flex h-full flex-col">
      {data.source === "youtube" ? (
        <YouTubeStage key={data.youtubeId ?? "yt"} state={data} isHost={isHost} roomName={roomName} />
      ) : (
        <UploadStage key={data.url ?? "up"} state={data} isHost={isHost} roomName={roomName} />
      )}
      {isHost && <HostFooter roomName={roomName} onStopped={() => mutate()} onReplace={() => mutate(null)} />}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Shared sync engine                                                        */
/* -------------------------------------------------------------------------- */

// Keeps a follower's player locked to the shared state, and — for the host —
// heartbeats the live position so late joiners stay accurate. Hosts are the
// source of truth and are never auto-seeked; they push via their own controls.
function useVideoSync(opts: {
  isHost: boolean
  roomName: string
  ready: boolean
  positionSec: number
  playing: boolean
  duration: number
  handleRef: React.MutableRefObject<PlayerHandle | null>
}) {
  const { isHost, roomName, ready, positionSec, playing, duration, handleRef } = opts

  // The anchor followers extrapolate from: server position + wall-clock elapsed.
  const anchorRef = useRef({ positionSec, playing, at: Date.now() })
  useEffect(() => {
    anchorRef.current = { positionSec, playing, at: Date.now() }
  }, [positionSec, playing])

  // Follower reconciliation loop.
  useEffect(() => {
    if (isHost || !ready) return
    const id = setInterval(() => {
      const h = handleRef.current
      if (!h) return
      const a = anchorRef.current
      let target = a.playing ? a.positionSec + (Date.now() - a.at) / 1000 : a.positionSec
      if (duration > 0) target = Math.min(target, duration)
      target = Math.max(0, target)

      if (a.playing && !h.isPlaying()) h.play()
      if (!a.playing && h.isPlaying()) h.pause()
      if (Math.abs(h.getTime() - target) > DRIFT_SEC) h.seek(target)
    }, SYNC_TICK_MS)
    return () => clearInterval(id)
  }, [isHost, ready, duration, handleRef])

  // Host heartbeat while playing.
  useEffect(() => {
    if (!isHost || !ready) return
    const id = setInterval(() => {
      const h = handleRef.current
      if (h && h.isPlaying()) void controlVideo({ roomName, action: "play", positionSec: h.getTime() })
    }, HOST_HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [isHost, ready, roomName, handleRef])
}

/* -------------------------------------------------------------------------- */
/*  Uploaded-file stage (<video>)                                             */
/* -------------------------------------------------------------------------- */

function UploadStage({ state, isHost, roomName }: { state: ActiveState; isHost: boolean; roomName: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const handleRef = useRef<PlayerHandle | null>(null)
  const suppressPushRef = useRef(false)
  const initedRef = useRef(false)

  const [ready, setReady] = useState(false)
  const [current, setCurrent] = useState(state.positionSec)
  const [playing, setPlaying] = useState(state.playing)
  const [duration, setDuration] = useState(state.durationSec || 0)
  const [muted, setMuted] = useState(!isHost)

  // Build the imperative handle once the element exists.
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    handleRef.current = {
      play: () => void el.play().catch(() => {}),
      pause: () => el.pause(),
      seek: (s) => {
        try {
          el.currentTime = s
        } catch {
          /* ignore */
        }
      },
      getTime: () => el.currentTime || 0,
      isPlaying: () => !el.paused && !el.ended,
      setMuted: (m) => {
        el.muted = m
      },
    }
    setReady(true)
  }, [])

  // Local UI tracking (drives the scrubber + play button for everyone).
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const onTime = () => setCurrent(el.currentTime)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onMeta = () => {
      if (Number.isFinite(el.duration)) setDuration(el.duration)
    }
    el.addEventListener("timeupdate", onTime)
    el.addEventListener("play", onPlay)
    el.addEventListener("pause", onPause)
    el.addEventListener("loadedmetadata", onMeta)
    return () => {
      el.removeEventListener("timeupdate", onTime)
      el.removeEventListener("play", onPlay)
      el.removeEventListener("pause", onPause)
      el.removeEventListener("loadedmetadata", onMeta)
    }
  }, [])

  // Host pushes genuine transport events to everyone (guarded during the
  // initial reconcile so re-opening a panel never rewinds the room).
  useEffect(() => {
    if (!isHost) return
    const el = videoRef.current
    if (!el) return
    const onPlay = () => {
      if (!suppressPushRef.current) void controlVideo({ roomName, action: "play", positionSec: el.currentTime })
    }
    const onPause = () => {
      if (!suppressPushRef.current) void controlVideo({ roomName, action: "pause", positionSec: el.currentTime })
    }
    const onSeeked = () => {
      if (!suppressPushRef.current) void controlVideo({ roomName, action: "seek", positionSec: el.currentTime })
    }
    el.addEventListener("play", onPlay)
    el.addEventListener("pause", onPause)
    el.addEventListener("seeked", onSeeked)
    return () => {
      el.removeEventListener("play", onPlay)
      el.removeEventListener("pause", onPause)
      el.removeEventListener("seeked", onSeeked)
    }
  }, [isHost, roomName])

  // Reflect the mute toggle.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted
  }, [muted])

  // Host re-attach: line up with the shared position without broadcasting it.
  useEffect(() => {
    if (!isHost || !ready || initedRef.current) return
    initedRef.current = true
    const h = handleRef.current
    if (!h) return
    suppressPushRef.current = true
    h.seek(state.positionSec)
    if (state.playing) h.play()
    const t = setTimeout(() => {
      suppressPushRef.current = false
    }, 900)
    return () => clearTimeout(t)
  }, [isHost, ready, state.positionSec, state.playing])

  useVideoSync({ isHost, roomName, ready, positionSec: state.positionSec, playing: state.playing, duration, handleRef })

  const onScrub = useCallback((sec: number) => {
    const el = videoRef.current
    if (!el) return
    el.currentTime = sec
    setCurrent(sec)
  }, [])

  const togglePlay = useCallback(() => {
    const h = handleRef.current
    if (!h) return
    if (h.isPlaying()) h.pause()
    else h.play()
  }, [])

  return (
    <StageChrome
      title={state.title}
      isHost={isHost}
      playing={playing}
      current={current}
      duration={duration}
      muted={muted}
      onToggleMuted={() => setMuted((m) => !m)}
      onTogglePlay={togglePlay}
      onScrub={onScrub}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={state.url ?? undefined}
        playsInline
        muted={!isHost}
        controls={false}
        className="absolute inset-0 size-full bg-black object-contain"
      />
    </StageChrome>
  )
}

/* -------------------------------------------------------------------------- */
/*  YouTube stage (IFrame Player API)                                         */
/* -------------------------------------------------------------------------- */

function YouTubeStage({ state, isHost, roomName }: { state: ActiveState; isHost: boolean; roomName: string }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const handleRef = useRef<PlayerHandle | null>(null)
  const suppressPushRef = useRef(false)
  const initedRef = useRef(false)

  const [ready, setReady] = useState(false)
  const [current, setCurrent] = useState(state.positionSec)
  const [playing, setPlaying] = useState(state.playing)
  const [duration, setDuration] = useState(state.durationSec || 0)
  const [muted, setMuted] = useState(!isHost)

  useEffect(() => {
    let cancelled = false
    let pollId: ReturnType<typeof setInterval> | null = null

    void loadYouTubeApi().then((YT: any) => {
      if (cancelled || !mountRef.current) return
      playerRef.current = new YT.Player(mountRef.current, {
        videoId: state.youtubeId ?? undefined,
        playerVars: {
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          fs: 0,
          iv_load_policy: 3,
        },
        events: {
          onReady: (e: any) => {
            const target = e.target
            handleRef.current = {
              play: () => target.playVideo(),
              pause: () => target.pauseVideo(),
              seek: (s: number) => target.seekTo(s, true),
              getTime: () => target.getCurrentTime?.() ?? 0,
              isPlaying: () => target.getPlayerState?.() === YT.PlayerState.PLAYING,
              setMuted: (m: boolean) => (m ? target.mute() : target.unMute()),
            }
            if (!isHost) target.mute()
            const d = target.getDuration?.() ?? 0
            if (d > 0) setDuration(d)
            setReady(true)
            pollId = setInterval(() => setCurrent(target.getCurrentTime?.() ?? 0), SYNC_TICK_MS)
          },
          onStateChange: (e: any) => {
            const s = e.data
            if (s === YT.PlayerState.PLAYING) setPlaying(true)
            if (s === YT.PlayerState.PAUSED || s === YT.PlayerState.ENDED) setPlaying(false)
            // Host is the source of truth: broadcast native play/pause.
            if (isHost && !suppressPushRef.current) {
              const pos = e.target.getCurrentTime?.() ?? 0
              if (s === YT.PlayerState.PLAYING) void controlVideo({ roomName, action: "play", positionSec: pos })
              else if (s === YT.PlayerState.PAUSED) void controlVideo({ roomName, action: "pause", positionSec: pos })
            }
          },
        },
      })
    })

    return () => {
      cancelled = true
      if (pollId) clearInterval(pollId)
      try {
        playerRef.current?.destroy?.()
      } catch {
        /* ignore */
      }
      handleRef.current = null
    }
  }, [state.youtubeId, isHost, roomName])

  useEffect(() => {
    handleRef.current?.setMuted(muted)
  }, [muted])

  // Host re-attach without rebroadcasting the starting position.
  useEffect(() => {
    if (!isHost || !ready || initedRef.current) return
    initedRef.current = true
    const h = handleRef.current
    if (!h) return
    suppressPushRef.current = true
    h.seek(state.positionSec)
    if (state.playing) h.play()
    const t = setTimeout(() => {
      suppressPushRef.current = false
    }, 900)
    return () => clearTimeout(t)
  }, [isHost, ready, state.positionSec, state.playing])

  useVideoSync({ isHost, roomName, ready, positionSec: state.positionSec, playing: state.playing, duration, handleRef })

  const onScrub = useCallback(
    (sec: number) => {
      const h = handleRef.current
      if (!h) return
      h.seek(sec)
      setCurrent(sec)
      if (isHost) void controlVideo({ roomName, action: "seek", positionSec: sec })
    },
    [isHost, roomName],
  )

  const togglePlay = useCallback(() => {
    const h = handleRef.current
    if (!h) return
    if (h.isPlaying()) h.pause()
    else h.play()
  }, [])

  return (
    <StageChrome
      title={state.title}
      isHost={isHost}
      playing={playing}
      current={current}
      duration={duration}
      muted={muted}
      onToggleMuted={() => setMuted((m) => !m)}
      onTogglePlay={togglePlay}
      onScrub={onScrub}
    >
      <div ref={mountRef} className="absolute inset-0 size-full [&>iframe]:size-full" />
      {/* Block direct interaction with the iframe for followers so playback is
          strictly host-controlled; the host drives via the controls below. */}
      {!isHost && <div className="absolute inset-0" aria-hidden />}
    </StageChrome>
  )
}

/* -------------------------------------------------------------------------- */
/*  Shared stage chrome: 16:9 frame + transport bar                           */
/* -------------------------------------------------------------------------- */

function StageChrome({
  title,
  isHost,
  playing,
  current,
  duration,
  muted,
  onToggleMuted,
  onTogglePlay,
  onScrub,
  children,
}: {
  title: string | null
  isHost: boolean
  playing: boolean
  current: number
  duration: number
  muted: boolean
  onToggleMuted: () => void
  onTogglePlay: () => void
  onScrub: (sec: number) => void
  children: React.ReactNode
}) {
  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0

  return (
    <div className="flex h-full flex-col">
      <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-black">
        {children}
        {/* Followers get a one-tap unmute (they start muted so playback can
            autoplay in sync); hosts already have sound. */}
        {muted && (
          <button
            type="button"
            onClick={onToggleMuted}
            className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20 backdrop-blur transition-transform active:scale-95"
          >
            <VolumeX className="size-3.5" /> Tap to unmute
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 px-3 py-3">
        {title && <p className="truncate text-sm font-semibold text-white">{title}</p>}

        {/* Scrubber — interactive for the host, a synced progress bar for
            followers. */}
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-white/50">{formatTime(current)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(current, duration || current)}
            onChange={(e) => onScrub(Number(e.target.value))}
            disabled={!isHost || duration <= 0}
            aria-label="Seek"
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-primary disabled:cursor-default"
            style={{
              background: `linear-gradient(to right, hsl(var(--primary)) ${pct}%, rgba(255,255,255,0.15) ${pct}%)`,
            }}
          />
          <span className="w-10 shrink-0 text-[11px] tabular-nums text-white/50">{formatTime(duration)}</span>
        </div>

        <div className="flex items-center gap-2">
          {isHost ? (
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={playing ? "Pause for everyone" : "Play for everyone"}
              className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-90"
            >
              {playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-0.5" />}
            </button>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1.5 text-[11px] font-medium text-white/60">
              <span className={`size-1.5 rounded-full ${playing ? "animate-pulse bg-emerald-400" : "bg-white/40"}`} />
              {playing ? "Playing" : "Paused"} · host controlled
            </span>
          )}

          <button
            type="button"
            onClick={onToggleMuted}
            aria-label={muted ? "Unmute" : "Mute"}
            className="flex size-10 items-center justify-center rounded-full bg-white/8 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
          >
            {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Host footer: replace / stop for everyone                                  */
/* -------------------------------------------------------------------------- */

function HostFooter({
  roomName,
  onStopped,
  onReplace,
}: {
  roomName: string
  onStopped: () => void
  onReplace: () => void
}) {
  const [stopping, setStopping] = useState(false)
  return (
    <div className="mt-auto flex items-center gap-2 border-t border-white/8 px-3 py-2.5">
      <button
        type="button"
        onClick={onReplace}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/8 py-2 text-xs font-semibold text-white/80 transition-colors hover:bg-white/15 hover:text-white"
      >
        <RefreshCw className="size-3.5" /> Replace
      </button>
      <button
        type="button"
        disabled={stopping}
        onClick={async () => {
          setStopping(true)
          await controlVideo({ roomName, action: "stop" })
          onStopped()
        }}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500/15 py-2 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/25 disabled:opacity-50"
      >
        {stopping ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />} Stop for everyone
      </button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Host loader: paste YouTube link or upload a file                          */
/* -------------------------------------------------------------------------- */

function HostLoader({ roomName, onLoaded }: { roomName: string; onLoaded: () => void }) {
  const [tab, setTab] = useState<"youtube" | "upload">("youtube")
  const [url, setUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function loadYouTube() {
    const id = youTubeId(url.trim())
    if (!id) {
      setError("That doesn't look like a YouTube link.")
      return
    }
    setError(null)
    setBusy(true)
    try {
      const meta = await recognizeYouTube(url.trim())
      const res = await setVideoSource({
        roomName,
        source: "youtube",
        youtubeId: meta.youtubeId ?? id,
        url: url.trim(),
        title: meta.title,
        thumbnail: meta.thumbnail,
      })
      if (!res.ok) {
        setError("Could not load that video. Only the host can load a video.")
        return
      }
      onLoaded()
    } catch {
      setError("Could not load that video. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  async function loadUpload(file: File) {
    if (!file.type.startsWith("video/")) {
      setError("Please choose a video file.")
      return
    }
    setError(null)
    setBusy(true)
    setProgress(0)
    try {
      const durationSec = await readVideoDuration(file).catch(() => 0)
      const media = await uploadMedia(file, "live-video", file.name, (p) => setProgress(p))
      const title = file.name.replace(/\.[^.]+$/, "").slice(0, 300) || "Video"
      const res = await setVideoSource({
        roomName,
        source: "upload",
        url: media.url,
        title,
        durationSec: Math.round(durationSec),
      })
      if (!res.ok) {
        setError("Could not load that video. Only the host can load a video.")
        return
      }
      onLoaded()
    } catch {
      setError("Upload failed. Please try again.")
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/20 text-primary">
          <Film className="size-5" />
        </span>
        <div>
          <h3 className="text-[15px] font-bold text-white">Watch together</h3>
          <p className="text-xs text-white/45">Load a video and everyone follows your playback in sync.</p>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-1 rounded-full bg-white/6 p-1">
        {(["youtube", "upload"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-semibold transition-colors ${
              tab === t ? "bg-primary text-primary-foreground" : "text-white/55 hover:text-white"
            }`}
          >
            {t === "youtube" ? <Link2 className="size-3.5" /> : <Upload className="size-3.5" />}
            {t === "youtube" ? "YouTube link" : "Upload"}
          </button>
        ))}
      </div>

      {tab === "youtube" ? (
        <div className="space-y-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void loadYouTube()
            }}
            inputMode="url"
            placeholder="Paste a YouTube link…"
            aria-label="YouTube link"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-primary/50"
          />
          <button
            type="button"
            onClick={() => void loadYouTube()}
            disabled={busy || !url.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {busy ? "Loading…" : "Play for everyone"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] py-8 text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="size-6 animate-spin" />
                <span className="text-xs font-semibold">
                  {progress !== null ? `Uploading… ${progress}%` : "Preparing…"}
                </span>
                {progress !== null && (
                  <span className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
                    <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                  </span>
                )}
              </>
            ) : (
              <>
                <Upload className="size-6" />
                <span className="text-xs font-semibold">Choose a video file</span>
                <span className="text-[11px] text-white/35">MP4 / WebM · up to 200 MB</span>
              </>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void loadUpload(file)
              e.target.value = ""
            }}
          />
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <Film className="size-7 text-white/25" />
      <p className="text-sm text-white/50">No video playing.</p>
      <p className="max-w-[220px] text-pretty text-xs text-white/30">
        When the host starts a video, it will play here for everyone in sync.
      </p>
    </div>
  )
}

/** Best-effort read of a video file's duration in seconds (client-side). */
function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("video")
    el.preload = "metadata"
    el.onloadedmetadata = () => {
      const d = el.duration
      URL.revokeObjectURL(el.src)
      resolve(Number.isFinite(d) ? d : 0)
    }
    el.onerror = () => {
      URL.revokeObjectURL(el.src)
      reject(new Error("metadata error"))
    }
    el.src = URL.createObjectURL(file)
  })
}
