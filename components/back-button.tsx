"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"

/**
 * Generic "Back" control that returns to whatever page the user came from,
 * mirroring the browser/device back button. We use router.back() so it reflects
 * the actual navigation history (the page where the video link was clicked),
 * and fall back to a provided href when there's no in-app history to pop
 * (e.g. the page was opened directly from a shared link or a new tab).
 */
export function BackButton({
  fallbackHref = "/",
  label = "Back",
  className = "",
}: {
  fallbackHref?: string
  label?: string
  className?: string
}) {
  const router = useRouter()

  const handleClick = () => {
    // history.length > 1 means there's a previous entry to return to.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground ${className}`}
    >
      <ArrowLeft className="size-4" /> {label}
    </button>
  )
}
