"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RotateCw } from "lucide-react"

/**
 * Route-level error boundary for a profile (`/u/[id]`).
 *
 * This is the route the administrator avatar opens, and it resolves a redirect
 * to the active organisation's profile. Without a boundary here, any throw
 * during that resolution fell through to the browser's native "This page
 * couldn't load" crash. This catches it and degrades to a recoverable, on-brand
 * in-app screen with a retry.
 */
export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[v0] Profile failed to load:", error)
  }, [error])

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-secondary/60 text-muted-foreground">
        <AlertTriangle className="size-7" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-balance font-display text-xl font-semibold tracking-tight text-foreground">
          We couldn&apos;t load this profile
        </h1>
        <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
          Something went wrong while opening this profile. This is usually temporary — please try again.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="tap-scale inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-[1.02]"
        >
          <RotateCw className="size-4" />
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-full border border-border/60 px-6 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/60"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
