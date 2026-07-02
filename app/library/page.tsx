import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { LibraryView } from "@/components/library-view"
import { getLibrary } from "@/app/actions/store"

export const metadata: Metadata = {
  title: "Library · Frequency",
  description: "Your purchased books and courses, ready to read and learn.",
}

export const dynamic = "force-dynamic"

export default async function LibraryPage() {
  const { books, courses } = await getLibrary()
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <LibraryView books={books} courses={courses} />
      </main>
    </div>
  )
}
