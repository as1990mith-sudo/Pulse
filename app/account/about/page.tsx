import type { Metadata } from "next"
import Link from "next/link"
import { ChevronLeft, Radio } from "lucide-react"

export const metadata: Metadata = {
  title: "About Frequency Home",
  description: "One platform. Multiple Homes. Connected communities.",
}

// Approved copy — rendered verbatim. Keep as provided.
const PARAGRAPHS = [
  "Frequency Home is a digital community platform built for churches, ministries, organisations, and community-led institutions.",
  "It provides organisations with a dedicated digital environment to manage their community, communicate with members, share content, host live sessions, organise activities, and provide services—all within one platform.",
  "Each organisation has its own Home, giving it a distinct digital identity and a central place for its members to access the organisation’s content, communications, programmes, and services.",
  "For members, Frequency Home provides a structured and convenient way to stay connected with the organisations and communities they are part of.",
  "Frequency Home is designed to reduce the need for organisations to manage their communities across multiple disconnected platforms, bringing essential community and engagement tools together in one integrated experience.",
]

export default function AboutFrequencyHomePage() {
  return (
    <div className="relative min-h-screen bg-background">
      {/* Immersive brand page: a quiet back affordance, then a single centred
          column with strong typographic hierarchy and generous rhythm. */}
      <Link
        href="/account"
        aria-label="Back to Account"
        className="fixed left-4 top-[max(1rem,env(safe-area-inset-top))] z-10 inline-flex size-10 items-center justify-center rounded-full bg-secondary/60 text-foreground backdrop-blur-md transition-colors hover:bg-secondary"
      >
        <ChevronLeft className="size-5" />
      </Link>

      <main className="mx-auto flex w-full max-w-2xl flex-col px-6 pb-24 pt-24 sm:pt-32">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
          <Radio className="size-7" />
        </span>

        <p className="mt-8 text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          About
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
          Frequency Home
        </h1>

        <div className="mt-10 flex flex-col gap-6">
          {PARAGRAPHS.map((p) => (
            <p key={p} className="text-pretty text-lg leading-relaxed text-muted-foreground">
              {p}
            </p>
          ))}
          <p className="text-pretty text-lg font-medium leading-relaxed text-foreground">
            Frequency Home — a dedicated digital home for your organisation and its community.
          </p>
        </div>

        {/* Closing statement — the page's signature, given deliberate emphasis. */}
        <div className="mt-16 border-t border-border/60 pt-12">
          <p className="font-display text-3xl font-semibold leading-snug tracking-tight text-balance sm:text-4xl">
            One platform.
            <br />
            Multiple Homes.
            <br />
            <span className="text-primary">Connected communities.</span>
          </p>
        </div>
      </main>
    </div>
  )
}
