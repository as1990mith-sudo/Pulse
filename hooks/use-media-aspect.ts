"use client"

import { useEffect, useState } from "react"

/**
 * Detects the intrinsic aspect ratio (width / height) of an image or video URL
 * at runtime, so the feed can decide how to frame it WITHOUT any stored
 * dimensions. Returns `null` until the media's metadata has loaded.
 *
 * This is purely a presentation-layer signal: it never mutates the media. The
 * feed uses it to clamp tall portrait media into a contained preview, while the
 * immersive viewers ignore it and show the media at its natural ratio.
 */
export function useMediaAspect(url: string | undefined, type: "image" | "video"): number | null {
  const [ratio, setRatio] = useState<number | null>(null)

  useEffect(() => {
    if (!url) {
      setRatio(null)
      return
    }
    let cancelled = false

    if (type === "image") {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        if (!cancelled && img.naturalWidth > 0 && img.naturalHeight > 0) {
          setRatio(img.naturalWidth / img.naturalHeight)
        }
      }
      img.src = url
      return () => {
        cancelled = true
      }
    }

    // Video: read dimensions from a lightweight metadata-only load.
    const video = document.createElement("video")
    video.preload = "metadata"
    video.crossOrigin = "anonymous"
    const onMeta = () => {
      if (!cancelled && video.videoWidth > 0 && video.videoHeight > 0) {
        setRatio(video.videoWidth / video.videoHeight)
      }
    }
    video.addEventListener("loadedmetadata", onMeta)
    video.src = url
    return () => {
      cancelled = true
      video.removeEventListener("loadedmetadata", onMeta)
      video.src = ""
    }
  }, [url, type])

  return ratio
}

// Aspect ratio of the contained feed preview for tall/portrait media (1:1).
// Anything TALLER (smaller ratio) than this square frame gets contained inside
// it; media this wide or wider keeps its natural ratio.
export const FEED_PREVIEW_MIN_RATIO = 1

/** True when the media is taller than the 1:1 feed-preview frame. */
export function isTallMedia(ratio: number | null): boolean {
  return ratio != null && ratio < FEED_PREVIEW_MIN_RATIO
}
