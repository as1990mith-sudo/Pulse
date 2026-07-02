import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { LibraryView } from "@/components/library-view"

export const metadata: Metadata = {
  title: "Library · Frequency",
  description: "Your purchased books and courses, ready to read and learn.",
}

export default function LibraryPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <LibraryView />
      </main>
    </div>
  )
}
