"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, Square, Trash2, Send, Loader2, Pause, Play } from "lucide-react"
import { cn } from "@/lib/utils"

const MAX_SECONDS = 180 // 3-minute cap

function fmt(secs: number) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

/**
 * Inline voice-note recorder for the DM composer. Records mic audio with
 * MediaRecorder, hard-caps the length at 3 minutes, lets the user preview,
 * discard, or send. On send it hands a `Blob` (audio/webm) to the parent which
 * uploads it to Blob and sends it as an audio attachment.
 */
export function VoiceRecorder({
  onSend,
  onCancel,
  sending = false,
}: {
  onSend: (blob: Blob, durationSecs: number) => void
  onCancel: () => void
  sending?: boolean
}) {
  const [phase, setPhase] = useState<"recording" | "preview">("recording")
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [previewPlaying, setPreviewPlaying] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const blobRef = useRef<Blob | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const finalDurationRef = useRef(0)

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  // Start recording as soon as the recorder mounts.
  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const rec = new MediaRecorder(stream)
        recorderRef.current = rec
        chunksRef.current = []
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }
        rec.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" })
          blobRef.current = blob
          finalDurationRef.current = seconds
          stopStream()
          setPhase("preview")
        }
        rec.start()
        timerRef.current = setInterval(() => {
          setSeconds((s) => {
            const next = s + 1
            if (next >= MAX_SECONDS) {
              // Hard stop at the cap.
              finishRecording()
              return MAX_SECONDS
            }
            return next
          })
        }, 1000)
      } catch {
        if (!cancelled) setError("Microphone access was denied.")
      }
    }
    void start()
    return () => {
      cancelled = true
      clearTimer()
      try {
        recorderRef.current?.stream?.getTracks().forEach((t) => t.stop())
      } catch {
        /* noop */
      }
      stopStream()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function finishRecording() {
    clearTimer()
    const rec = recorderRef.current
    if (rec && rec.state !== "inactive") rec.stop()
  }

  function discard() {
    clearTimer()
    finishRecording()
    blobRef.current = null
    if (audioRef.current) {
      audioRef.current.pause()
    }
    onCancel()
  }

  function togglePreview() {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      void el.play()
      setPreviewPlaying(true)
    } else {
      el.pause()
      setPreviewPlaying(false)
    }
  }

  function handleSend() {
    if (!blobRef.current) return
    onSend(blobRef.current, finalDurationRef.current || seconds)
  }

  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2.5">
        <p className="text-sm text-destructive">{error}</p>
        <button type="button" onClick={onCancel} className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>
    )
  }

  const previewUrl = phase === "preview" && blobRef.current ? URL.createObjectURL(blobRef.current) : null

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5">
      {phase === "recording" ? (
        <>
          <span className="relative flex size-3 shrink-0 items-center justify-center">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-destructive" />
          </span>
          <span className="flex-1 text-sm font-medium tabular-nums">
            Recording… {fmt(seconds)} <span className="text-muted-foreground">/ {fmt(MAX_SECONDS)}</span>
          </span>
          <button
            type="button"
            onClick={discard}
            aria-label="Cancel recording"
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Trash2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={finishRecording}
            aria-label="Stop recording"
            className="flex size-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-transform hover:scale-105"
          >
            <Square className="size-4 fill-current" />
          </button>
        </>
      ) : (
        <>
          {previewUrl && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio ref={audioRef} src={previewUrl} onEnded={() => setPreviewPlaying(false)} className="hidden" />
          )}
          <button
            type="button"
            onClick={togglePreview}
            aria-label={previewPlaying ? "Pause preview" : "Play preview"}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/80"
          >
            {previewPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <span className="flex-1 text-sm font-medium tabular-nums">
            <Mic className="mr-1.5 inline size-4 text-muted-foreground" />
            Voice note · {fmt(finalDurationRef.current || seconds)}
          </span>
          <button
            type="button"
            onClick={discard}
            disabled={sending}
            aria-label="Discard voice note"
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <Trash2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            aria-label="Send voice note"
            className={cn(
              "flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 disabled:opacity-60",
            )}
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </>
      )}
    </div>
  )
}
