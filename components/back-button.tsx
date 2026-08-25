"use client"

import { ArrowLeft } from "lucide-react"

import { useBack } from "@/lib/navigation/use-back"

/**
 * Generic "Back" control. All of the behaviour lives in `useBack`, which unwinds
 * the user's real navigation history instead of guessing a destination from the
 * current route — see the note there for why that distinction matters.
 *
 * `fallbackHref` applies ONLY when there is no in-app history to pop (a deep link
 * or a notification opened in a fresh tab).
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
  const goBack = useBack(fallbackHref)

  return (
    <button
      type="button"
      onClick={goBack}
      className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground ${className}`}
    >
      <ArrowLeft className="size-4" /> {label}
    </button>
  )
}
