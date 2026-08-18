"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Camera, Loader2 } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { ImageCropper } from "@/components/image-cropper"
import { uploadMedia, compressImage } from "@/lib/upload-media"

/**
 * A self-contained avatar that lets the signed-in user set their personal
 * profile picture in place — tapping the camera badge opens a square cropper,
 * then compresses, uploads and persists the image on the account via Better
 * Auth. Used in the app drawer so admins (who are redirected away from the
 * personal /u/[id] editor to their organisation profile) can still replace the
 * blank initials avatar. Reuses the same upload flow as ProfileAvatar.
 */
export function AvatarUploadButton({
  image,
  initials,
  color,
  name,
  sizeClass = "size-14 text-lg",
  onUploaded,
}: {
  image: string | null
  initials: string
  color: string
  name: string
  /** Tailwind classes controlling the avatar circle size + font size. */
  sizeClass?: string
  /** Notified with the new URL once the upload is persisted. */
  onUploaded?: (url: string) => void
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(image)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pickFile(e: React.MouseEvent) {
    // The avatar may live inside a Link/row — never navigate when editing.
    e.preventDefault()
    e.stopPropagation()
    inputRef.current?.click()
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-picking the same file
    if (!file) return
    setError(null)
    setCropSrc(URL.createObjectURL(file))
  }

  async function handleCropped(blob: Blob) {
    setCropSrc(null)
    setUploading(true)
    setError(null)
    try {
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" })
      // Avatars display tiny, so shrink to 512px before upload.
      const compressed = await compressImage(file, 512, 0.85)
      const data = await uploadMedia(compressed, "avatars")
      const result = await authClient.updateUser({ image: data.url })
      if (result.error) throw new Error(result.error.message || "Could not save your photo")
      setPreview(data.url)
      onUploaded?.(data.url)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="relative shrink-0">
      <span
        className={cn(
          "flex items-center justify-center overflow-hidden rounded-full font-semibold ring-2 ring-border/60",
          sizeClass,
          color,
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview || "/placeholder.svg"} alt="" className="size-full object-cover" />
        ) : (
          initials
        )}
      </span>

      <button
        type="button"
        onClick={pickFile}
        disabled={uploading}
        aria-label={preview ? `Change ${name}'s profile picture` : `Add a profile picture`}
        className="tap-scale absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-background disabled:opacity-70"
      >
        {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
      </button>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

      {error && (
        <p role="alert" className="absolute left-0 top-full mt-1 whitespace-nowrap text-xs text-destructive">
          {error}
        </p>
      )}

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          aspect={1}
          round
          title="Adjust your photo"
          onCancel={() => setCropSrc(null)}
          onCropped={handleCropped}
        />
      )}
    </div>
  )
}
