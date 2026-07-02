import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { StoreView } from "@/components/store/store-view"

export const metadata: Metadata = {
  title: "Store · Frequency",
  description: "Discover premium Christian books, courses, and resources on Frequency.",
}

export default function StorePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <StoreView />
      </main>
    </div>
  )
}
