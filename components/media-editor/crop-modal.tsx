"use client"

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Cropper, { type Area } from "react-easy-crop"
import { Check, Loader2, X, ZoomIn } from "lucide-react"
import { getCroppedBlob } from "@/lib/media-edit"
import { cn } from "@/lib/utils"

export type AspectOption = { label: string; value: number | null; hint?: string }

// Photo crop presets for the feed. "Free" is intentionally omitted so every
// posted photo lands on one of four consistent, premium shapes. The first entry
// (4:5 Portrait) is the default selection. Order matches the product spec.
const DEFAULT_RATIOS: AspectOption[] = [
  { label: "4:5", value: 4 / 5, hint: "Portrait" },
  { label: "1:1", value: 1, hint: "Square" },
  { label: "16:9", value: 16 / 9, hint: "Landscape" },
  { label: "9:16", value: 9 / 16, hint: "Vertical" },
]

// Tallest portrait shape we ever allow (width/height). Nothing may be taller
// than 9:16, so the "Free" option is clamped to this even for very tall photos.
const MIN_ASPECT = 9 / 16

/**
 * WhatsApp-style crop editor. Shows the image with a draggable/zoomable crop
 * box (react-easy-crop), quick-select aspect ratios, and a zoom slider. "Apply"
 * renders the selected region to a JPEG Blob via canvas and hands it back;
 * "Cancel" discards. Pass a single-entry `ratios` (e.g. the article 4:5) to
 * lock the shape while still letting the user choose which part is framed.
 */
export function CropModal({
  imageSrc,
  ratios = DEFAULT_RATIOS,
  title = "Crop photo",
  onCancel,
  onApply,
}: {
  imageSrc: string
  ratios?: AspectOption[]
  title?: string
  onCancel: () => void
  onApply: (blob: Blob) => void
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [ratio, setRatio] = useState<AspectOption>(ratios[0])
  // The image's natural aspect, used to back the "Free" option (crop box tracks
  // the whole image shape rather than forcing a fixed ratio).
  const [mediaAspect, setMediaAspect] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [working, setWorking] = useState(false)
  // Portal target guard: this overlay is `position: fixed`, but when it renders
  // inside a transformed/animated ancestor (e.g. a Sheet), that ancestor becomes
  // its containing block and the "fullscreen" overlay gets trapped inside the
  // panel — the layout looks chaotic. Rendering into <body> keeps it viewport-
  // relative and truly fullscreen everywhere it's used.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  // When a fixed ratio is picked, use it. "Free" follows the photo's natural
  // shape but is never allowed to exceed 9:16 tallness.
  const effectiveAspect = ratio.value ?? Math.max(mediaAspect, MIN_ASPECT)
  const showRatioBar = ratios.length > 1

  async function apply() {
    if (!croppedAreaPixels) return
    setWorking(true)
    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels)
      onApply(blob)
    } catch {
      setWorking(false)
    }
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={title}>
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
        <span className="text-sm font-semibold text-white">{title}</span>
        <button
          type="button"
          onClick={apply}
          disabled={working || !croppedAreaPixels}
          className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:brightness-110 active:scale-90 disabled:opacity-50"
          aria-label="Apply crop"
        >
          {working ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-6" />}
        </button>
      </div>

      {/* Cropper surface */}
      <div className="relative flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={effectiveAspect}
          minZoom={1}
          maxZoom={4}
          restrictPosition
          showGrid
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          onMediaLoaded={(size) => setMediaAspect(size.naturalWidth / size.naturalHeight || 1)}
        />
      </div>

      {/* Controls */}
      <div className="space-y-4 bg-black px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5">
        {/* Zoom slider (pinch/scroll also work on the cropper itself) */}
        <div className="flex items-center gap-3">
          <ZoomIn className="size-4 shrink-0 text-white/60" />
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-primary [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
          />
        </div>

        {showRatioBar && (
          <div className="flex items-center justify-center gap-2">
            {ratios.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => setRatio(r)}
                className={cn(
                  "flex min-w-16 flex-col items-center gap-0.5 rounded-2xl px-3 py-2 leading-none transition-colors active:scale-95",
                  ratio.label === r.label
                    ? "bg-white text-black"
                    : "bg-white/10 text-white/80 hover:bg-white/20",
                )}
                aria-pressed={ratio.label === r.label}
                aria-label={r.hint ? `${r.hint} ${r.label}` : r.label}
              >
                <span className="text-sm font-semibold">{r.label}</span>
                {r.hint && (
                  <span
                    className={cn(
                      "text-[10px] font-medium uppercase tracking-wide",
                      ratio.label === r.label ? "text-black/60" : "text-white/50",
                    )}
                  >
                    {r.hint}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
