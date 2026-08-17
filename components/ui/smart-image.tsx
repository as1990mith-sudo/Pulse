"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

type SmartImageProps = Omit<React.ComponentProps<"img">, "src"> & {
  src: string | null | undefined
  /**
   * Above-the-fold hint. When true the image loads eagerly with high fetch
   * priority (use for hero avatars / the first media in view). When false
   * (default) it lazy-loads so offscreen media doesn't saturate the connection
   * and steal bandwidth from what the user can actually see.
   */
  priority?: boolean
}

/**
 * A drop-in replacement for a raw <img> that makes media feel instant and
 * smooth without any image optimizer (the project runs `images.unoptimized`
 * and serves originals straight from Blob):
 *
 *  - `decoding="async"` keeps large-image decoding OFF the main thread, so a
 *    photo can't jank scrolling or delay the first paint of the rest of the UI.
 *  - `loading` / `fetchPriority` prioritize what's visible and defer what isn't.
 *  - A short opacity fade-in replaces the abrupt "pop" as bytes arrive, so the
 *    image reveals over whatever placeholder background its container already
 *    has (bg-muted / bg-black), which reads as smooth rather than flashy.
 *
 * The `complete` check covers the cache-hit case where the browser finishes the
 * image before React attaches `onLoad` — without it a cached image would stay
 * stuck at opacity-0.
 */
export function SmartImage({ src, className, priority, alt = "", onLoad, ...props }: SmartImageProps) {
  const ref = useRef<HTMLImageElement>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (ref.current?.complete) setLoaded(true)
  }, [src])

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src || "/placeholder.svg"}
      alt={alt}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      onLoad={(e) => {
        setLoaded(true)
        onLoad?.(e)
      }}
      className={cn("transition-opacity duration-300 ease-out", loaded ? "opacity-100" : "opacity-0", className)}
      {...props}
    />
  )
}
