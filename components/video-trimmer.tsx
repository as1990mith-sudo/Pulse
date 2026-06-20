"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Loader2, Scissors } from "lucide-react"
import { Button } from "@/components/ui/button"

type VideoTrimmerProps = {
  /** Object URL of the chosen video. */
  src: string
  /** Hard cap on the trimmed clip length, in seconds. */
  maxDuration?: number
  title?: string
  onCancel: () => void
  /** Receives the re-encoded clip as a video file. */
  onTrimmed: (file: File) => void | Promise<void>
}

function fmt(s: number) {
  if (!isFinite(s)) return "0:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}

/** Pick the best MediaRecorder container the browser supports. */
function pickMimeType(): { mime: string; ext: string } {
  const candidates: { mime: string; ext: string }[] = [
    { mime: "video/mp4;codecs=h264,aac", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mime)) return c
  }
  return { mime: "video/webm", ext: "webm" }
}

export function VideoTrimmer({
  src,
  maxDuration = 60,
  title = "Trim video",
  onCancel,
  onTrimmed,
}: VideoTrimmerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [duration, setDuration] = useState(0)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [preview, setPreview] = useState(0) // playhead while scrubbing the preview
  const [ready, setReady] = useState(false)
  const [encoding, setEncoding] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const window = Math.max(0, end - start)

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  function handleLoaded() {
    const v = videoRef.current
    if (!v) return
    const d = v.duration
    setDuration(d)
    const initialEnd = Math.min(d, maxDuration)
    setStart(0)
    setEnd(initialEnd)
    setReady(true)
    v.currentTime = 0
  }

  // Keep the preview frame on the start handle as the user drags it.
  function seekTo(t: number) {
    const v = videoRef.current
    if (v) v.currentTime = t
    setPreview(t)
  }

  function onStartChange(value: number) {
    let s = value
    if (s > end - 1) s = Math.max(0, end - 1) // keep at least 1s
    // Enforce the max window by pushing the end if needed.
    let e = end
    if (e - s > maxDuration) e = s + maxDuration
    setStart(s)
    setEnd(e)
    seekTo(s)
  }

  function onEndChange(value: number) {
    let e = value
    if (e < start + 1) e = Math.min(duration, start + 1)
    let s = start
    if (e - s > maxDuration) s = e - maxDuration
    setStart(s)
    setEnd(e)
    seekTo(e)
  }

  const encode = useCallback(async () => {
    const v = videoRef.current
    if (!v) return
    setError(null)
    setEncoding(true)
    setProgress(0)

    try {
      const { mime, ext } = pickMimeType()

      // Canvas captures the video frames; WebAudio captures the audio without
      // routing it to the speakers, so encoding stays silent for the user.
      const canvas = document.createElement("canvas")
      canvas.width = v.videoWidth || 720
      canvas.height = v.videoHeight || 1280
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Canvas unavailable")

      const stream = canvas.captureStream(30)

      // Audio graph: element -> destination only (not -> speakers).
      let audioCtx: AudioContext | null = null
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (AC) {
          audioCtx = new AC()
          await audioCtx.resume()
          const sourceNode = audioCtx.createMediaElementSource(v)
          const destNode = audioCtx.createMediaStreamDestination()
          sourceNode.connect(destNode)
          for (const track of destNode.stream.getAudioTracks()) stream.addTrack(track)
        }
      } catch {
        // No audio track (silent video or unsupported) — encode video only.
      }

      const chunks: BlobPart[] = []
      const recorder = new MediaRecorder(stream, { mimeType: mime })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      const done = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
      })

      // Draw frames as the trimmed segment plays.
      let raf = 0
      const draw = () => {
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
        const elapsed = v.currentTime - start
        setProgress(Math.min(100, (elapsed / window) * 100))
        if (v.currentTime >= end - 0.03 || v.ended) {
          recorder.stop()
          cancelAnimationFrame(raf)
          v.pause()
          return
        }
        raf = requestAnimationFrame(draw)
      }

      // Seek to the start, then play + record the window.
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          v.removeEventListener("seeked", onSeeked)
          resolve()
        }
        v.addEventListener("seeked", onSeeked)
        v.currentTime = start
      })

      recorder.start()
      await v.play()
      raf = requestAnimationFrame(draw)

      await done
      if (audioCtx) await audioCtx.close().catch(() => {})

      const blob = new Blob(chunks, { type: mime })
      const file = new File([blob], `clip.${ext}`, { type: mime })
      await onTrimmed(file)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not trim the video.")
      setEncoding(false)
    }
  }, [start, end, window, onTrimmed])

  if (typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Pick up to {maxDuration} seconds. We&apos;ll trim and re-encode the clip on your device before uploading.
        </p>

        <div className="mt-4 overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            src={src}
            className="mx-auto max-h-[46vh] w-auto"
            playsInline
            muted={!encoding}
            onLoadedMetadata={handleLoaded}
            preload="metadata"
          />
        </div>

        {ready && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
              <span>Start {fmt(start)}</span>
              <span className={window > maxDuration ? "text-destructive" : "text-foreground"}>
                Clip {fmt(window)}
              </span>
              <span>End {fmt(end)}</span>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Start</span>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={start}
                onChange={(e) => onStartChange(Number(e.target.value))}
                disabled={encoding}
                className="h-1.5 w-full cursor-pointer accent-primary"
                aria-label="Trim start"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">End</span>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={end}
                onChange={(e) => onEndChange(Number(e.target.value))}
                disabled={encoding}
                className="h-1.5 w-full cursor-pointer accent-primary"
                aria-label="Trim end"
              />
            </label>
          </div>
        )}

        {encoding && (
          <div className="mt-4 space-y-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-[width] duration-100 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-center text-xs text-muted-foreground">Trimming… keep this tab open.</p>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={encoding}>
            Cancel
          </Button>
          <Button type="button" onClick={encode} disabled={!ready || encoding} className="gap-2">
            {encoding ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
            {encoding ? "Trimming…" : "Trim & use"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
