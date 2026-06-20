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
