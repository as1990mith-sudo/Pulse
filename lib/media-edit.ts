import type { Area } from "react-easy-crop"

/**
 * Shared helpers for the pre-post media editor (crop / trim / cover art).
 * These run entirely in the browser on <canvas> — no backend involved — and
 * return Blobs that the composer then uploads with the existing uploadMedia().
 */

/** Loads an <img> from a URL (works for object URLs and same-origin blobs). */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // Allow drawing remote images (e.g. an existing cover URL) to a canvas
    // without tainting it.
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not load image."))
    img.src = src
  })
}

/**
 * Crops `imageSrc` to the pixel rectangle react-easy-crop reports
 * (`croppedAreaPixels`) and returns a JPEG Blob. The output canvas is exactly
 * the crop size so no quality is lost to rescaling.
 */
export async function getCroppedBlob(
  imageSrc: string,
  cropPixels: Area,
  quality = 0.92,
): Promise<Blob> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas unavailable.")

  canvas.width = Math.round(cropPixels.width)
  canvas.height = Math.round(cropPixels.height)

  ctx.drawImage(
    image,
    Math.round(cropPixels.x),
    Math.round(cropPixels.y),
    Math.round(cropPixels.width),
    Math.round(cropPixels.height),
    0,
    0,
    canvas.width,
    canvas.height,
  )

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Crop failed."))),
      "image/jpeg",
      quality,
    )
  })
}

/**
 * Renders a "fit" cover: the WHOLE image contained inside the crop frame
 * exactly as the user positioned it (react-easy-crop with restrictPosition off
 * and zoom below cover), with any letterbox bands filled by a blurred, zoomed
 * copy of the same image instead of black bars. Used for live-meeting flyers
 * where nothing should be cropped off.
 *
 * `cropPixels` is the crop rectangle in the image's natural pixel space; when
 * the frame extends past the image its x/y go negative and width/height exceed
 * the image, which is exactly what produces the letterbox we fill.
 */
export async function getFittedBlob(
  imageSrc: string,
  cropPixels: Area,
  quality = 0.92,
): Promise<Blob> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas unavailable.")

  const W = Math.max(1, Math.round(cropPixels.width))
  const H = Math.max(1, Math.round(cropPixels.height))
  canvas.width = W
  canvas.height = H

  const natW = image.naturalWidth
  const natH = image.naturalHeight

  // 1) Blurred, cover-scaled background (slightly over-scanned so the blur's
  //    transparent edge fringe never shows) fills any letterbox with the
  //    flyer's own colors.
  const coverScale = Math.max(W / natW, H / natH) * 1.18
  const bw = natW * coverScale
  const bh = natH * coverScale
  ctx.filter = "blur(28px)"
  ctx.drawImage(image, (W - bw) / 2, (H - bh) / 2, bw, bh)
  ctx.filter = "none"

  // 2) The flyer itself at 1:1 image-pixel scale, translated so the framed
  //    region lands on the canvas (image px (ix,iy) → (ix - x, iy - y)).
  ctx.drawImage(image, -cropPixels.x, -cropPixels.y, natW, natH)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Fit failed."))),
      "image/jpeg",
      quality,
    )
  })
}

/**
 * Grabs a single frame from a video at `timeSec` and returns it as a JPEG Blob,
 * used for the "pick a cover frame" step. Loads the video muted/off-DOM, seeks
 * to the requested time, then paints the current frame to a canvas.
 */
export function captureVideoFrame(videoSrc: string, timeSec: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video")
    video.crossOrigin = "anonymous"
    video.muted = true
    video.playsInline = true
    video.preload = "auto"
    video.src = videoSrc

    const cleanup = () => {
      video.removeAttribute("src")
      video.load()
    }

    const onSeeked = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("Canvas unavailable.")
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(
          (blob) => {
            cleanup()
            blob ? resolve(blob) : reject(new Error("Could not capture frame."))
          },
          "image/jpeg",
          0.92,
        )
      } catch (err) {
        cleanup()
        reject(err instanceof Error ? err : new Error("Could not capture frame."))
      }
    }

    video.onloadeddata = () => {
      // Clamp the requested time into the valid range before seeking.
      const t = Math.min(Math.max(timeSec, 0), Math.max(video.duration - 0.05, 0))
      video.currentTime = t
    }
    video.onseeked = onSeeked
    video.onerror = () => {
      cleanup()
      reject(new Error("Could not read video."))
    }
  })
}

/** Formats seconds as `m:ss` (e.g. 75 → "1:15"). */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, "0")}`
}

/**
 * Generates evenly-spaced thumbnail data URLs across a video's duration for the
 * trim timeline strip. Returns small JPEGs so the strip stays lightweight.
 */
export function generateVideoThumbnails(
  videoSrc: string,
  count: number,
  thumbWidth = 96,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video")
    video.crossOrigin = "anonymous"
    video.muted = true
    video.playsInline = true
    video.preload = "auto"
    video.src = videoSrc

    const thumbs: string[] = []
    let i = 0
    let times: number[] = []
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")

    const cleanup = () => {
      video.removeAttribute("src")
      video.load()
    }

    const seekNext = () => {
      if (i >= times.length) {
        cleanup()
        resolve(thumbs)
        return
      }
      video.currentTime = times[i]
    }

    video.onloadeddata = () => {
      if (!ctx || !video.duration || !isFinite(video.duration)) {
        cleanup()
        resolve([])
        return
      }
      const ratio = video.videoHeight / video.videoWidth || 0.5625
      canvas.width = thumbWidth
      canvas.height = Math.round(thumbWidth * ratio)
      // Sample at the midpoint of each segment for a representative frame.
      times = Array.from({ length: count }, (_, k) => ((k + 0.5) / count) * video.duration)
      seekNext()
    }

    video.onseeked = () => {
      if (!ctx) return
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        thumbs.push(canvas.toDataURL("image/jpeg", 0.6))
      } catch {
        // Ignore a single failed frame; keep going.
      }
      i += 1
      seekNext()
    }

    video.onerror = () => {
      cleanup()
      // Thumbnails are decorative — resolve empty rather than blocking trim.
      resolve([])
    }
  })
}
