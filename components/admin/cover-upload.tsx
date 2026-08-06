"use client"

import { useRef, useState } from "react"
import { ImagePlus, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { uploadMedia } from "@/lib/upload-media"
import { CropModal, type AspectOption } from "@/components/media-editor/crop-modal"

/**
 * Crop preset for square + portrait covers (Question of the Day). Lets the
 * admin frame the same image as either 1:1 or 4:5.
 */
export const SQUARE_PORTRAIT_RATIOS: AspectOption[] = [
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
]

/**
 * Square-only preset for live meeting cover art (broadcast, conversation, and
 * audio rooms). A single ratio hides the aspect-ratio chip bar, so the host
 * only chooses Fit/Fill + zoom and every live cover stays a consistent 1:1.
 */
export const SQUARE_RATIO: AspectOption[] = [{ label: "1:1", value: 1 }]

/** Default single-ratio preset used by ordinary landscape covers. */
const DEFAULT_RATIOS: AspectOption[] = [{ label: "16:9", value: 16 / 9 }]

export function CoverUpload({
  value,
  onChange,
  label = "Cover image",
  ratios = DEFAULT_RATIOS,
  allowFit = false,
}: {
  value: string | null
  onChange: (url: string | null) => void
  label?: string
  /**
   * Crop aspect options offered in the editor. The first entry also drives the
   * preview's aspect so what's shown matches how the image was framed.
   */
  ratios?: AspectOption[]
  /**
   * Enables the editor's "Fit whole flyer" mode, letting the uploader show the
   * entire image inside the frame (blurred letterbox fill) and drag it freely,
   * instead of only cover-cropping. Used for live-meeting cover art.
   */
  allowFit?: boolean
}) {
  // Preview aspect follows the first fixed ratio (e.g. 1:1 or 4:5); falls back
  // to 16:9 when the preset only offers a free crop.
  const previewAspect = ratios.find((r) => r.value != null)?.value ?? 16 / 9
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Object URL of the freshly-picked file, shown in the crop editor before we
  // upload. Null when the cropper is closed.
  const [cropSrc, setCropSrc] = useState<string | null>(null)

  function openCropper(file: File) {
    setError(null)
    setCropSrc(URL.createObjectURL(file))
  }

  function closeCropper() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  async function handleCropped(blob: Blob) {
    closeCropper()
    setUploading(true)
    try {
      const data = await uploadMedia(blob, "covers", "cover.jpg")
      onChange(data.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{label}</span>

      {value ? (
        <div
          className="relative overflow-hidden rounded-xl border border-border/60"
          style={{ aspectRatio: previewAspect, ...(previewAspect < 1 ? { maxWidth: "16rem" } : { width: "100%" }) }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value || "/placeholder.svg"} alt="Selected cover" className="size-full object-cover" />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute right-2 top-2 size-8"
            onClick={() => onChange(null)}
            aria-label="Remove image"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{ aspectRatio: previewAspect, ...(previewAspect < 1 ? { maxWidth: "16rem" } : { width: "100%" }) }}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          {uploading ? (
            <>
              <Loader2 className="size-6 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <ImagePlus className="size-6" />
              Choose an image from your device
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) openCropper(file)
          e.target.value = ""
        }}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {cropSrc && (
        <CropModal
          imageSrc={cropSrc}
          title="Crop cover"
          ratios={ratios}
          allowFit={allowFit}
          onCancel={closeCropper}
          onApply={handleCropped}
        />
      )}
    </div>
  )
}
