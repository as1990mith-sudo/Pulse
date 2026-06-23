"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Radio, X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The round cover-art thumbnail shown in the top-left of the live header.
 * Borders are solid black and fully circular; tapping it opens a centered
 * lightbox with the expanded artwork (shared by host + listener interfaces).
 */
export function CoverArt({
  src,
  alt = "Cover art",
  className,
}: {
  src: string | null
  alt?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Lock background scroll while the lightbox is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => src && setOpen(true)}
        disabled={!src}
        aria-label={src ? "View cover art" : "No cover art"}
        className={cn(
          "relative size-12 shrink-0 overflow-hidden rounded-full bg-white/10 shadow-xl ring-2 ring-black transition-transform",
          src && "hover:scale-105 active:scale-95 cursor-zoom-in",
          className,
        )}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src || "/placeholder.svg"} alt={alt} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-white/80">
            <Radio className="size-5" strokeWidth={2.75} />
          </span>
        )}
      </button>

      {mounted &&
        open &&
        src &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-6 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Expanded cover art"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] flex size-10 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-inset ring-white/20 transition-colors hover:bg-white/20"
            >
              <X className="size-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src || "/placeholder.svg"}
              alt={alt}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[80dvh] w-auto max-w-[90vw] rounded-3xl object-contain shadow-2xl ring-1 ring-white/10 animate-in zoom-in-95 duration-200"
            />
          </div>,
          document.body,
        )}
    </>
  )
}
