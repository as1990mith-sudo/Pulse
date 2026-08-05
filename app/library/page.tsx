import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { LibraryView } from "@/components/library-view"
import { getLibraryArticles } from "@/app/actions/articles"

export const metadata: Metadata = {
  title: "Library · Frequency",
  description: "Continue reading, revisit, and manage the articles you care about.",
}

export const dynamic = "force-dynamic"

export default async function LibraryPage() {
  const library = await getLibraryArticles()
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <LibraryView library={library} />
      </main>
    </div>
  )
}
