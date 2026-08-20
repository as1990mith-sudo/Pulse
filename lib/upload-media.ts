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
export async function compressImage(file: File | Blob, maxEdge = 1600, quality = 0.82): Promise<File | Blob> {
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
 * Crops an image to a target aspect ratio (e.g. 1:1, 4:5, 16:9, 9:16) and
 * returns a re-encoded JPEG blob. Nothing is stretched — the largest region
 * matching the ratio is kept.
 *
 * `offsetX` / `offsetY` (0..1) position the crop window within the source along
 * the axis that gets trimmed: 0 = flush to the left/top edge, 1 = flush to the
 * right/bottom edge, 0.5 = centered (the default, matching a plain center-crop).
 * This is what lets the user drag the photo around inside the crop frame.
 *
 * Falls back to the original file if decoding/encoding fails so an upload is
 * never blocked.
 */
export async function cropImageToAspect(
  file: File | Blob,
  ratioW: number,
  ratioH: number,
  offsetX = 0.5,
  offsetY = 0.5,
): Promise<File | Blob> {
  if (typeof document === "undefined") return file
  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    const targetRatio = ratioW / ratioH
    const currentRatio = width / height
    const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

    let cropW = width
    let cropH = height
    if (currentRatio > targetRatio) {
      // Source is too wide — trim the sides.
      cropW = Math.round(height * targetRatio)
    } else {
      // Source is too tall — trim top/bottom.
      cropH = Math.round(width / targetRatio)
    }
    // Position the crop window using the pan offset (only the trimmed axis has
    // any slack; the other resolves to 0).
    const sx = Math.round((width - cropW) * clamp01(offsetX))
    const sy = Math.round((height - cropH) * clamp01(offsetY))

    const canvas = document.createElement("canvas")
    canvas.width = cropW
    canvas.height = cropH
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      bitmap.close?.()
      return file
    }
    ctx.drawImage(bitmap, sx, sy, cropW, cropH, 0, 0, cropW, cropH)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92))
    return blob && blob.size > 0 ? blob : file
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
 * episodes, dm, store, pinned).
 */
// Files at or above this size upload in parallel chunks (multipart). This is
// the single biggest win for video upload speed: instead of one long serial
// stream, the file is split and several parts upload concurrently, and a failed
// part retries on its own rather than restarting the whole upload.
const MULTIPART_THRESHOLD = 5 * 1024 * 1024 // 5 MB

export async function uploadMedia(
  file: File | Blob,
  folder:
    | "chat"
    | "status"
    | "covers"
    | "avatars"
    | "live-music"
    | "episodes"
    | "dm"
    | "store"
    | "pinned"
    | "community"
    | "catalogue",
  fileName?: string,
  onProgress?: (percentage: number) => void,
): Promise<UploadedMedia> {
  const name = fileName ?? (file instanceof File ? file.name : "upload")
  const pathname = `${folder}/${Date.now()}-${name}`

  const blob = await upload(pathname, file, {
    access: "public",
    handleUploadUrl: "/api/blob-upload",
    contentType: file.type || undefined,
    // Parallelize large (video) uploads; small images stay single-shot.
    multipart: file.size >= MULTIPART_THRESHOLD,
    onUploadProgress: onProgress ? (e) => onProgress(Math.round(e.percentage)) : undefined,
  })

  return {
    url: blob.url,
    type: detectType(file.type || ""),
    name,
  }
}
