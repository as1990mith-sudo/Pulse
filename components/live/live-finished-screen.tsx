"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Radio, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Shown when someone opens (or reloads) a live URL whose session has already
 * finished. Replaces the bare 404 with a warm, on-brand "this live has ended"
 * moment that gives people a clear way forward instead of a dead end.
 *
 * Fully theme-sensitive (uses design tokens) so it reads correctly in both
 * light and dark, and matches the rest of Frequency rather than a stark error.
 */
export function LiveFinishedScreen({
  title,
  hostName,
}: {
  /** Optional title of the live that ended, when we still know it. */
  title?: string | null
  /** Optional host/organisation name, when known. */
  hostName?: string | null
}) {
  const router = useRouter()

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background px-6 py-16 text-center text-foreground">
      {/* Soft ambient wash — subtle, not a decorative blob spam. A single
          radial glow anchored behind the icon gives the page depth. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/3 -z-10 size-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <span className="relative mb-6 flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
        <Radio className="size-9" />
        <Sparkles className="absolute -right-1 -top-1 size-5 text-primary/70" />
      </span>

      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Live has ended</p>
      <h1 className="font-display text-balance text-2xl font-bold leading-tight sm:text-3xl">
        {title ? `“${title}” has finished` : "This live has finished"}
      </h1>
      <p className="mt-3 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
        {hostName ? (
          <>
            Thanks for showing up. {hostName} has ended this session — catch the next one live, or explore what else is
            happening right now.
          </>
        ) : (
          <>
            Thanks for showing up. This session has wrapped up — catch the next one live, or explore what else is
            happening right now.
          </>
        )}
      </p>

      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <Link
          href="/live/browse"
          className={cn(
            "flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground",
            "transition-transform active:scale-[0.98]",
          )}
        >
          <Radio className="size-4" />
          Browse live now
        </Link>
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) router.back()
            else router.push("/")
          }}
          className="flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-card px-6 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          <ArrowLeft className="size-4" />
          Go back
        </button>
      </div>
    </main>
  )
}
