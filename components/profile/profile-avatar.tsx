"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Camera, Loader2 } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { ImageCropper } from "@/components/image-cropper"
import { uploadMedia } from "@/lib/upload-media"

export function ProfileAvatar({
  initials,
  color,
  image,
  name,
  editable,
}: {
  initials: string
  color: string
  image: string | null
  name: string
  editable: boolean
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Show the freshly chosen image immediately, before the page refreshes.
  const [preview, setPreview] = useState<string | null>(image)
  // Object URL of the file being adjusted in the cropper.
  const [cropSrc, setCropSrc] = useState<string | null>(null)

  async function handleCropped(blob: Blob) {
    setError(null)
    setUploading(true)
    setCropSrc(null)
    try {
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" })
      const data = await uploadMedia(file, "avatars")

      // Persist the URL on the user via Better Auth so the session stays in sync.
      const result = await authClient.updateUser({ image: data.url })
      if (result.error) throw new Error(result.error.message || "Could not save your photo")

      setPreview(data.url)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <span
          className={cn(
            "flex size-16 items-center justify-center overflow-hidden rounded-full text-xl font-semibold sm:size-20 sm:text-2xl",
            color,
          )}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview || "/placeholder.svg"} alt={`${name}'s profile picture`} className="size-full object-cover" />
          ) : (
            initials
          )}
        </span>

        {editable && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            aria-label="Change profile picture"
            className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          </button>
        )}

        {editable && (
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) setCropSrc(URL.createObjectURL(file))
              e.target.value = ""
            }}
          />
        )}
      </div>
      {error && <p className="max-w-[12rem] text-center text-xs text-destructive">{error}</p>}

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          aspect={1}
          round
          title="Adjust profile picture"
          onCancel={() => setCropSrc(null)}
          onCropped={handleCropped}
        />
      )}
    </div>
  )
}
