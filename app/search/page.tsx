import { SiteHeader } from "@/components/site-header"
import { SearchView } from "@/components/search-view"

export default function SearchPage() {
  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-4">
        <SearchView />
      </main>
    </div>
  )
}
