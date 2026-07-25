"use client"

import { useRef, useState } from "react"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AspectOption } from "@/components/media-editor/crop-modal"

// Same ratio choices offered for photos, minus taller-than-9:16 options. 9:16
// is the tallest allowed frame; "Free" keeps the video's natural shape but is
// clamped to 9:16 so nothing is ever taller.
const VIDEO_RATIOS: AspectOption[] = [
  { label: "Free", value: null },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "9:16", value: 9 / 16 },
  { label: "16:9", value: 16 / 9 },
]

const MIN_ASPECT = 9 / 16

/**
 * Lets the author choose a display crop ratio for a video. Because trimmed clips
 * can be long, we never re-encode: the chosen ratio is returned as playback
 * metadata (`aspectRatio`) and applied at render with a center object-cover crop
 * — mirroring how photos are cropped, but without panning/zoom. The preview
 * frame shows exactly what viewers will see for the selected ratio.
 */
export function VideoRatioModal({
  videoSrc,
  previewStart = 0,
  onCancel,
  onApply,
}: {
  videoSrc: string
  /** Seconds to seek to for the preview (usually the trim start). */
  previewStart?: number
  onCancel: () => void
  onApply: (aspectRatio: number | null) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [natural, setNatural] = useState(16 / 9)
  const [ratio, setRatio] = useState<AspectOption>(VIDEO_RATIOS[0])

  // "Free" tracks the natural shape, but never taller than 9:16.
  const frameAspect = ratio.value ?? Math.max(natural, MIN_ASPECT)

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Crop video">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onCancel}
          className="flex size-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 active:scale-90"
          aria-label="Cancel"
        >
          <X className="size-6" />
        </button>
        <span className="text-sm font-semibold text-white">Crop video</span>
        <button
          type="button"
          onClick={() => onApply(ratio.value)}
          className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:brightness-110 active:scale-90"
          aria-label="Apply crop"
        >
          <Check className="size-6" />
        </button>
      </div>

      {/* Preview: the frame reflects the chosen ratio; the video center-crops
          into it with object-cover, exactly matching feed rendering. */}
      <div className="relative flex flex-1 items-center justify-center px-4">
        <div
          className="relative max-h-full w-full max-w-md overflow-hidden rounded-xl bg-black"
          style={{ aspectRatio: String(frameAspect), maxHeight: "min(70svh, 40rem)" }}
        >
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            src={videoSrc}
            className="h-full w-full object-cover"
            muted
            loop
            autoPlay
            playsInline
            onLoadedMetadata={(e) => {
              const el = e.currentTarget
              if (el.videoWidth > 0 && el.videoHeight > 0) setNatural(el.videoWidth / el.videoHeight)
              try {
                el.currentTime = previewStart
              } catch {
                /* not seekable yet */
              }
            }}
          />
        </div>
      </div>

      {/* Ratio selector — same options as photo cropping */}
      <div className="bg-black px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5">
        <div className="flex items-center justify-center gap-2">
          {VIDEO_RATIOS.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRatio(r)}
              className={cn(
                "min-w-14 rounded-full px-4 py-2 text-sm font-semibold transition-colors active:scale-95",
                ratio.label === r.label ? "bg-white text-black" : "bg-white/10 text-white/80 hover:bg-white/20",
              )}
              aria-pressed={ratio.label === r.label}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
