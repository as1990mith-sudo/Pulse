"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Loader2, Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ImageCropperProps = {
  /** Object URL or data URL of the chosen image. */
  src: string
  /** Target aspect ratio as width / height (1 = square). */
  aspect: number
  title?: string
  /** Render the crop window as a circle (display only). */
  round?: boolean
  onCancel: () => void
  /** Receives the cropped JPEG blob. */
  onCropped: (blob: Blob) => void | Promise<void>
}

const OUTPUT_WIDTH = 1080
const MAX_ZOOM = 4

export function ImageCropper({ src, aspect, title = "Adjust image", round, onCancel, onCropped }: ImageCropperProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(false)

  // Load the image to read its natural dimensions.
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      imgRef.current = img
      setNatural({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.src = src
  }, [src])

  // Measure the crop window and keep it in sync with viewport size.
  useEffect(() => {
    function measure() {
      const el = containerRef.current
      if (!el) return
      const w = el.clientWidth
      setBox({ w, h: w / aspect })
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [aspect])

  const baseScale = natural && box.w ? Math.max(box.w / natural.w, box.h / natural.h) : 1
  const displayScale = baseScale * zoom

  const clamp = useCallback(
    (o: { x: number; y: number }, scale: number) => {
      if (!natural) return o
      const dispW = natural.w * scale
      const dispH = natural.h * scale
      return {
        x: Math.min(0, Math.max(box.w - dispW, o.x)),
        y: Math.min(0, Math.max(box.h - dispH, o.y)),
      }
    },
    [natural, box],
  )

  // Center the image once everything is measured.
  useEffect(() => {
    if (!natural || !box.w || ready) return
    const dispW = natural.w * baseScale
    const dispH = natural.h * baseScale
    setOffset({ x: (box.w - dispW) / 2, y: (box.h - dispH) / 2 })
    setReady(true)
  }, [natural, box, baseScale, ready])

  function changeZoom(next: number) {
    const clampedZoom = Math.min(MAX_ZOOM, Math.max(1, next))
    const newScale = baseScale * clampedZoom
    // Keep the crop-window center fixed while zooming.
    const cx = box.w / 2
    const cy = box.h / 2
    const imgX = (cx - offset.x) / displayScale
    const imgY = (cy - offset.y) / displayScale
    const newOffset = clamp({ x: cx - imgX * newScale, y: cy - imgY * newScale }, newScale)
    setZoom(clampedZoom)
    setOffset(newOffset)
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    const next = { x: d.ox + (e.clientX - d.px), y: d.oy + (e.clientY - d.py) }
    setOffset(clamp(next, displayScale))
  }

  function onPointerUp(e: React.PointerEvent) {
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
  }

  async function handleSave() {
    if (!imgRef.current || !natural || !box.w) return
    setSaving(true)
    try {
      const outW = OUTPUT_WIDTH
      const outH = Math.round(OUTPUT_WIDTH / aspect)
      const canvas = document.createElement("canvas")
      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Canvas unavailable")
      const sx = -offset.x / displayScale
      const sy = -offset.y / displayScale
      const sw = box.w / displayScale
      const sh = box.h / displayScale
      ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, outW, outH)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9),
      )
      if (blob) await onCropped(blob)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  if (typeof document === "undefined") return null

  return createPortal(
    // z-[95] keeps the cropper above the sheets/modals that open it (Edit
    // profile and other pickers sit at z-[80]); otherwise those overlays render
    // on top and block the "Apply" confirmation.
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Drag to reposition and use the slider to zoom.</p>

        <div
          ref={containerRef}
          className={cn(
            "relative mt-4 w-full touch-none overflow-hidden bg-muted select-none",
            round ? "mx-auto max-w-[260px] rounded-full" : "rounded-lg",
          )}
          style={{ height: box.h || undefined, aspectRatio: box.h ? undefined : String(aspect) }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {natural && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src || "/placeholder.svg"}
              alt="Crop preview"
              draggable={false}
              className="absolute max-w-none cursor-grab active:cursor-grabbing"
              style={{
                width: natural.w * displayScale,
                height: natural.h * displayScale,
                left: offset.x,
                top: offset.y,
              }}
            />
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => changeZoom(zoom - 0.25)}
            className="flex size-8 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/80"
            aria-label="Zoom out"
          >
            <Minus className="size-4" />
          </button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-primary"
            aria-label="Zoom"
          />
          <button
            type="button"
            onClick={() => changeZoom(zoom + 0.25)}
            className="flex size-8 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/80"
            aria-label="Zoom in"
          >
            <Plus className="size-4" />
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !ready}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
