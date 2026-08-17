"use client"

import { useRef, useState } from "react"
import { Camera, ImagePlus, X } from "lucide-react"
import { ImageCropper } from "@/components/image-cropper"

// Branding step uploader. Because the administrator account doesn't exist yet
// at this point in onboarding, images are held as local blobs (with preview
// URLs) and only uploaded to storage AFTER the account is created — mirroring
// the avatar handling in the individual signup form.
export function BrandingUpload({
  logoPreview,
  coverPreview,
  accent,
  orgName,
  onLogo,
  onCover,
  onRemoveCover,
}: {
  logoPreview: string | null
  coverPreview: string | null
  accent: string
  orgName: string
  onLogo: (blob: Blob) => void
  onCover: (blob: Blob) => void
  onRemoveCover: () => void
}) {
  const logoInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [crop, setCrop] = useState<{ src: string; kind: "logo" | "cover" } | null>(null)

  function pick(kind: "logo" | "cover", file: File) {
    setCrop({ src: URL.createObjectURL(file), kind })
  }

  function closeCrop() {
    if (crop) URL.revokeObjectURL(crop.src)
    setCrop(null)
  }

  function handleCropped(blob: Blob) {
    if (crop?.kind === "logo") onLogo(blob)
    else if (crop?.kind === "cover") onCover(blob)
    closeCrop()
  }

  return (
    <div className="space-y-6">
      {/* Cover + logo composite preview */}
      <div className="overflow-hidden rounded-3xl border border-border/60 bg-card">
        <div className="relative h-28 w-full sm:h-36" style={{ backgroundColor: coverPreview ? undefined : accent }}>
          {coverPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverPreview || "/placeholder.svg"} alt="Cover preview" className="size-full object-cover" />
          ) : (
            <div
              className="size-full opacity-90"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}00)` }}
            />
          )}
          <div className="absolute right-3 top-3 flex gap-2">
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-full bg-background/85 px-3 py-1.5 text-xs font-medium shadow-soft backdrop-blur transition-colors hover:bg-background"
            >
              <ImagePlus className="size-3.5" />
              {coverPreview ? "Change cover" : "Add cover"}
            </button>
            {coverPreview && (
              <button
                type="button"
                onClick={onRemoveCover}
                aria-label="Remove cover"
                className="flex size-7 items-center justify-center rounded-full bg-background/85 shadow-soft backdrop-blur transition-colors hover:bg-background"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Logo overlaps the cover, org-profile style */}
          <div className="absolute -bottom-8 left-5">
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              aria-label={logoPreview ? "Change organisation logo" : "Add organisation logo"}
              className="relative flex size-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-card bg-muted text-muted-foreground shadow-elevated transition-transform hover:scale-[1.02]"
            >
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPreview || "/placeholder.svg"} alt="Logo preview" className="size-full object-cover" />
              ) : (
                <Camera className="size-6" />
              )}
              <span className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground">
                <Camera className="size-3.5" />
              </span>
            </button>
          </div>
        </div>
        <div className="px-5 pb-4 pt-10">
          <p className="text-sm font-semibold leading-tight">{orgName || "Your organisation"}</p>
          <p className="text-xs text-muted-foreground">This is how your Home will introduce itself.</p>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Your logo becomes the primary identity inside your Home. A square image works best. The cover is optional.
      </p>

      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) pick("logo", file)
          e.target.value = ""
        }}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) pick("cover", file)
          e.target.value = ""
        }}
      />

      {crop && (
        <ImageCropper
          src={crop.src}
          aspect={crop.kind === "logo" ? 1 : 16 / 9}
          title={crop.kind === "logo" ? "Crop your logo" : "Crop your cover"}
          onCancel={closeCrop}
          onCropped={handleCropped}
        />
      )}
    </div>
  )
}
