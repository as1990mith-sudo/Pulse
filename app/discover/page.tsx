import type { Metadata } from "next"
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
      <main className="mx-auto w-full max-w-2xl px-4 py-4 sm:px-6">
        <header className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-balance">Discover ministries</h1>
          <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
            Find churches, ministries and Christian organisations to follow — the ones you subscribe to power your feed.
          </p>
        </header>
        <DiscoverBrowser initial={initial} hasLocation={hasLocation} location={location} />
      </main>
    </div>
  )
}
