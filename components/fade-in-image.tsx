"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * <img> that gracefully fades in once the image has finished decoding, with an
 * optional shimmering skeleton behind it while loading. Drop-in replacement for
 * a plain <img>; relies on the shared `.img-fade-in` / `.skeleton` utilities so
 * motion timing stays consistent with the rest of the app.
 */
export function FadeInImage({
  className,
  wrapperClassName,
  showSkeleton = true,
  onLoad,
  ...props
}: React.ComponentProps<"img"> & {
  /** Class names for the positioned wrapper (e.g. aspect ratio, rounding). */
  wrapperClassName?: string
  /** Show a shimmering skeleton placeholder until the image loads. */
  showSkeleton?: boolean
}) {
  const [loaded, setLoaded] = useState(false)
  const ref = useRef<HTMLImageElement>(null)

  // If the image is already cached/complete on mount, skip the fade so it
  // doesn't flash. (onLoad won't fire for cached images.)
  useEffect(() => {
    if (ref.current?.complete && ref.current.naturalWidth > 0) setLoaded(true)
  }, [])

  return (
    <span className={cn("relative block overflow-hidden", wrapperClassName)}>
      {showSkeleton && !loaded && <span className="skeleton absolute inset-0" aria-hidden="true" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        data-loaded={loaded}
        onLoad={(e) => {
          setLoaded(true)
          onLoad?.(e)
        }}
        className={cn("img-fade-in", className)}
        {...props}
      />
    </span>
  )
}
