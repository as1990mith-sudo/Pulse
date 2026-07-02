import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { MyListingsView } from "@/components/store/my-listings-view"
import { getMyListings } from "@/app/actions/store"
import { getCurrentUser } from "@/lib/session"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Your listings · Frequency Store",
  description: "Manage the books and courses you've published.",
}

export default async function ListingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")

  const listings = await getMyListings()

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <MyListingsView listings={listings} />
      </main>
    </div>
  )
}
