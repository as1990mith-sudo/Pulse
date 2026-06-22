import { upload } from "@vercel/blob/client"

export type UploadedMedia = {
  url: string
  type: "image" | "video" | "audio" | "document"
  name: string
}

function detectType(mime: string): "image" | "video" | "audio" | "document" {
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("audio/")) return "audio"
  return "document"
}

/**
 * Downscales and re-encodes a phone photo in the browser before upload.
 * Modern phone cameras produce 4–12 MB JPEG/HEIC files; shrinking the longest
 * edge to `maxEdge` and re-encoding as JPEG typically cuts the payload by
 * 80–95%, which is the single biggest win for status upload speed.
 *
 * Falls back to the original file if anything goes wrong (e.g. unsupported
 * codec, decode failure) so a post is never blocked by compression.
 */
export async function compressImage(file: File, maxEdge = 1600, quality = 0.82): Promise<File | Blob> {
  // Animated GIFs would lose their animation if redrawn to a canvas — skip them.
  if (file.type === "image/gif") return file
  if (typeof document === "undefined") return file

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    const scale = Math.min(1, maxEdge / Math.max(width, height))
    // Already small enough — don't waste time re-encoding.
    if (scale === 1 && file.size < 600_000) {
      bitmap.close?.()
      return file
    }

    const targetW = Math.round(width * scale)
    const targetH = Math.round(height * scale)
    const canvas = document.createElement("canvas")
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      bitmap.close?.()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    )
    // Only use the compressed version if it's actually smaller.
    if (blob && blob.size > 0 && blob.size < file.size) return blob
    return file
  } catch {
    return file
  }
}

/**
 * Uploads a file straight from the browser to Vercel Blob using a signed token
 * minted by /api/blob-upload. This avoids routing the file bytes through a
 * serverless function, which is capped at ~4.5 MB and was the cause of large
 * photo/video uploads failing.
 *
 * `folder` becomes the blob key prefix and must be one of the allow-listed
 * prefixes in the token route (chat, status, covers, avatars, live-music,
 * episodes, dm).
 */
export async function uploadMedia(
  file: File | Blob,
  folder: "chat" | "status" | "covers" | "avatars" | "live-music" | "episodes" | "dm",
  fileName?: string,
): Promise<UploadedMedia> {
  const name = fileName ?? (file instanceof File ? file.name : "upload")
  const pathname = `${folder}/${Date.now()}-${name}`

  const blob = await upload(pathname, file, {
    access: "public",
    handleUploadUrl: "/api/blob-upload",
    contentType: file.type || undefined,
  })

  return {
    url: blob.url,
    type: detectType(file.type || ""),
    name,
  }
}
