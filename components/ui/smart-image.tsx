"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { optimizedImageUrl } from "@/lib/image-url"

type SmartImageProps = Omit<React.ComponentProps<"img">, "src"> & {
  src: string | null | undefined
  /**
   * Above-the-fold hint. When true the image loads eagerly with high fetch
   * priority (use for hero avatars / the first media in view). When false
   * (default) it lazy-loads so offscreen media doesn't saturate the connection
   * and steal bandwidth from what the user can actually see.
   */
  priority?: boolean
  /**
   * Target render width in CSS px at the LARGEST size this image is shown.
   * Used to fetch a right-sized file via the Next optimizer instead of the
   * full-resolution original — the single biggest speed win. Must be one of
   * Next's configured widths (16/32/48/64/96/128/256/384, 640/750/828/1080/
   * 1200/1920/2048/3840). Omit to serve the source untouched.
   */
  w?: number
}

/**
 * A drop-in replacement for a raw <img> that makes media feel instant and
 * smooth:
 *
 *  - `w` routes the image through Next's optimizer (`/_next/image`) so the
 *    browser downloads a resized WebP, not the multi-MB original.
 *  - `decoding="async"` keeps large-image decoding OFF the main thread.
 *  - `loading` / `fetchPriority` prioritize what's visible and defer what isn't.
 *  - A short opacity fade-in replaces the abrupt "pop" as bytes arrive.
 *  - If the optimizer request ever fails, we fall back to the raw URL so the
 *    image still shows (never a hard break).
 *
 * The `complete` check covers the cache-hit case where the browser finishes the
 * image before React attaches `onLoad` — without it a cached image would stay
 * stuck at opacity-0.
 */
export function SmartImage({ src, className, priority, w, alt = "", onLoad, onError, ...props }: SmartImageProps) {
  const ref = useRef<HTMLImageElement>(null)
  const [loaded, setLoaded] = useState(false)
  // When the optimizer URL fails, drop back to the original source.
  const [useRaw, setUseRaw] = useState(false)

  const rawSrc = src || "/placeholder.svg"
  const displaySrc = useRaw || !w ? rawSrc : optimizedImageUrl(src, w) ?? rawSrc

  useEffect(() => {
    setLoaded(false)
    setUseRaw(false)
  }, [src])

  useEffect(() => {
    if (ref.current?.complete) setLoaded(true)
  }, [displaySrc])

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={displaySrc}
      alt={alt}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      onLoad={(e) => {
        setLoaded(true)
        onLoad?.(e)
      }}
      onError={(e) => {
        // First failure on the optimized URL → retry with the raw source.
        if (!useRaw && displaySrc !== rawSrc) {
          setUseRaw(true)
          return
        }
        onError?.(e)
      }}
      className={cn("transition-opacity duration-300 ease-out", loaded ? "opacity-100" : "opacity-0", className)}
      {...props}
    />
  )
}
