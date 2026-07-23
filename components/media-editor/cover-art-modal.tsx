"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ImageIcon, Loader2, X } from "lucide-react"
import { captureVideoFrame, formatClock, generateVideoThumbnails } from "@/lib/media-edit"

const THUMB_COUNT = 10

/**
 * Optional "Choose cover art" step in the media editor flow.
 *
 * - Video: scrub a thumbnail timeline (constrained to the trimmed range) and
 *   tap "Use this frame" to capture that frame as the cover.
 * - Image: optionally upload a separate custom cover, otherwise skip and the
 *   photo itself is used as its own cover.
 *
 * Always skippable — cover art is never required to post.
 */
export function CoverArtModal({
  kind,
  videoSrc,
  imageSrc,
  rangeStart = 0,
  rangeEnd,
  onSkip,
  onDone,
}: {
  kind: "video" | "image"
  videoSrc?: string
  imageSrc?: string
  rangeStart?: number
  rangeEnd?: number
  onSkip: () => void
  onDone: (cover: Blob | null) => void
}) {
  if (kind === "video" && videoSrc) {
    return (
      <VideoFramePicker
        videoSrc={videoSrc}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        onSkip={onSkip}
        onDone={onDone}
      />
    )
  }
  return <ImageCoverPicker imageSrc={imageSrc} onSkip={onSkip} onDone={onDone} />
}

function Shell({
  onSkip,
  onDone,
  doneDisabled,
  doneLabel,
  working,
  children,
}: {
  onSkip: () => void
  onDone: () => void
  doneDisabled?: boolean
  doneLabel: string
  working?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Choose cover art">
      <div className="flex items-center justify-between px-3 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onSkip}
          className="flex size-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 active:scale-90"
          aria-label="Skip cover art"
        >
          <X className="size-6" />
        </button>
        <span className="text-sm font-semibold text-white">Cover art</span>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-full px-3 py-2 text-sm font-semibold text-white/70 transition-colors hover:text-white"
        >
          Skip
        </button>
      </div>

      {children}

      <div className="bg-black px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4">
        <button
          type="button"
          onClick={onDone}
          disabled={doneDisabled || working}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition-transform hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
        >
          {working ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />}
          {doneLabel}
        </button>
      </div>
    </div>
  )
}

function VideoFramePicker({
  videoSrc,
  rangeStart,
  rangeEnd,
  onSkip,
  onDone,
}: {
  videoSrc: string
  rangeStart: number
  rangeEnd?: number
  onSkip: () => void
  onDone: (cover: Blob | null) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const [duration, setDuration] = useState(0)
  const [thumbs, setThumbs] = useState<string[]>([])
  const [time, setTime] = useState(rangeStart)
  const [working, setWorking] = useState(false)

  const minT = rangeStart
  const maxT = rangeEnd ?? duration

  useEffect(() => {
    let cancelled = false
    generateVideoThumbnails(videoSrc, THUMB_COUNT).then((t) => {
      if (!cancelled) setThumbs(t)
    })
    return () => {
      cancelled = true
    }
  }, [videoSrc])

  function seekTo(t: number) {
    const clamped = Math.min(Math.max(t, minT), maxT || t)
    setTime(clamped)
    if (videoRef.current) videoRef.current.currentTime = clamped
  }

  function timeFromClientX(clientX: number): number {
    const strip = stripRef.current
    if (!strip || duration === 0) return 0
    const rect = strip.getBoundingClientRect()
    const pct = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
    return pct * duration
  }

  function beginDrag(e: React.PointerEvent) {
    e.preventDefault()
    seekTo(timeFromClientX(e.clientX))
    const move = (ev: PointerEvent) => seekTo(timeFromClientX(ev.clientX))
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  async function useFrame() {
    setWorking(true)
    try {
      const blob = await captureVideoFrame(videoSrc, time)
      onDone(blob)
    } catch {
      setWorking(false)
    }
  }

  const pct = duration ? (time / duration) * 100 : 0

  return (
    <Shell onSkip={onSkip} onDone={useFrame} doneLabel="Use this frame" working={working} doneDisabled={duration === 0}>
      <div className="flex flex-1 flex-col">
        <p className="px-5 pb-3 text-center text-sm text-white/60">Scrub to pick a frame for your cover</p>
        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            src={videoSrc}
            playsInline
            muted
            preload="auto"
            onLoadedMetadata={() => {
              const v = videoRef.current
              if (!v) return
              setDuration(v.duration && isFinite(v.duration) ? v.duration : 0)
              v.currentTime = rangeStart
            }}
            className="max-h-full max-w-full"
          />
        </div>

        <div className="bg-black px-4 pt-4">
          <div className="mb-2 text-center text-xs font-medium tabular-nums text-white/60">{formatClock(time)}</div>
          <div ref={stripRef} onPointerDown={beginDrag} className="relative h-14 cursor-pointer select-none touch-none">
            <div className="absolute inset-0 flex overflow-hidden rounded-xl bg-white/5">
              {thumbs.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src || "/placeholder.svg"} alt="" className="h-full flex-1 object-cover" draggable={false} />
              ))}
            </div>
            <div
              className="absolute inset-y-0 z-10 w-1.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_2px_rgba(0,0,0,0.4)]"
              style={{ left: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </Shell>
  )
}

function ImageCoverPicker({
  imageSrc,
  onSkip,
  onDone,
}: {
  imageSrc?: string
  onSkip: () => void
  onDone: (cover: Blob | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [custom, setCustom] = useState<{ file: File; url: string } | null>(null)

  useEffect(() => {
    return () => {
      if (custom) URL.revokeObjectURL(custom.url)
    }
  }, [custom])

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (custom) URL.revokeObjectURL(custom.url)
    setCustom({ file, url: URL.createObjectURL(file) })
    e.target.value = ""
  }

  const shown = custom?.url ?? imageSrc

  return (
    <Shell
      onSkip={onSkip}
      onDone={() => onDone(custom?.file ?? null)}
      doneLabel={custom ? "Use this cover" : "Use photo as cover"}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
        <p className="text-center text-sm text-white/60">
          Use the photo as its own cover, or upload a different image.
        </p>
        {shown && (
          <div className="max-h-[45vh] overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown || "/placeholder.svg"} alt="Cover preview" className="max-h-[45vh] w-full object-contain" />
          </div>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
        >
          <ImageIcon className="size-4" />
          {custom ? "Choose another image" : "Upload a different cover"}
        </button>
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={pick} />
      </div>
    </Shell>
  )
}
