import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { StoreView } from "@/components/store/store-view"
import { getStoreCatalog } from "@/app/actions/store"

export const metadata: Metadata = {
  title: "Book Store · Frequency",
  description: "Discover Christian books published by the Frequency community.",
}

export const dynamic = "force-dynamic"

export default async function StorePage() {
  const { books } = await getStoreCatalog()
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <StoreView books={books} />
      </main>
    </div>
  )
}
