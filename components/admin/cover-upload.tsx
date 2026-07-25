"use client"

import { useRef, useState } from "react"
import { ImagePlus, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { uploadMedia } from "@/lib/upload-media"
import { CropModal } from "@/components/media-editor/crop-modal"

export function CoverUpload({
  value,
  onChange,
  label = "Cover image",
}: {
  value: string | null
  onChange: (url: string | null) => void
  label?: string
}) {
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
        <div className="relative w-full overflow-hidden rounded-xl border border-border/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value || "/placeholder.svg"} alt="Selected cover" className="aspect-video w-full object-cover" />
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
          className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
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
          ratios={[{ label: "16:9", value: 16 / 9 }]}
          onCancel={closeCropper}
          onApply={handleCropped}
        />
      )}
    </div>
  )
}
