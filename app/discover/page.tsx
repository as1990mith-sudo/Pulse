import type { Metadata } from "next"
import { Compass } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { DiscoverBrowser } from "@/components/org/discover-browser"
import { discoverOrganizations, getMyLocation } from "@/app/actions/organizations"

export const metadata: Metadata = {
  title: "Discover ministries · Frequency",
  description: "Find and subscribe to churches, ministries and Christian organisations near you and around the world.",
}

export default async function DiscoverPage() {
  const [initial, location] = await Promise.all([discoverOrganizations({}), getMyLocation()])
  const hasLocation = !!(location.city || location.country)

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="relative mx-auto w-full max-w-2xl px-4 pb-28 pt-5 sm:px-6">
        {/* Atmospheric backdrop — a soft radial orange glow bleeding down from
            behind the header gives the page depth without an obvious gradient. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-96 overflow-hidden">
          <div className="absolute left-1/2 top-[-38%] h-[26rem] w-[130%] -translate-x-1/2 rounded-[50%] bg-primary/10 blur-3xl" />
          <div className="absolute left-1/2 top-[-10%] h-64 w-[80%] -translate-x-1/2 rounded-[50%] bg-primary/5 blur-2xl" />
        </div>

        <header className="relative mb-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Compass className="size-3.5" />
            Curated for you
          </span>
          <h1 className="mt-2.5 font-display text-3xl font-bold leading-[1.05] tracking-tight text-balance sm:text-4xl">
            Discover ministries
          </h1>
          <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
            Find churches, ministries and Christian organisations to follow.
          </p>
        </header>

        <DiscoverBrowser initial={initial} hasLocation={hasLocation} location={location} />
      </main>
    </div>
  )
}
