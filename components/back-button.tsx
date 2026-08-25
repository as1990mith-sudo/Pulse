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
  className,
  children,
  "aria-label": ariaLabel,
}: {
  fallbackHref?: string
  label?: string
  className?: string
  /**
   * Custom contents (e.g. a bare chevron in an icon-only header button). When
   * given, `label` is not rendered — pass `aria-label` so the control still has
   * an accessible name.
   */
  children?: React.ReactNode
  "aria-label"?: string
}) {
  const goBack = useBack(fallbackHref)

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={ariaLabel}
      className={
        className ??
        "inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      }
    >
      {children ?? (
        <>
          <ArrowLeft className="size-4" /> {label}
        </>
      )}
    </button>
  )
}
