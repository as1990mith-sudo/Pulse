import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { StoreView } from "@/components/store/store-view"
import { getStoreCatalog } from "@/app/actions/store"

export const metadata: Metadata = {
  title: "Store · Frequency",
  description: "Discover Christian books and courses published by the Frequency community.",
}

export const dynamic = "force-dynamic"

export default async function StorePage() {
  const { books, courses, trendingBooks, trendingCourses } = await getStoreCatalog()
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <StoreView
          books={books}
          courses={courses}
          trendingBooks={trendingBooks}
          trendingCourses={trendingCourses}
        />
      </main>
    </div>
  )
}
