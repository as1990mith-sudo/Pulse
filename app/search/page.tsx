import { SiteHeader } from "@/components/site-header"
import { SearchView } from "@/components/search-view"
import { getCurrentUser } from "@/lib/session"

export default async function SearchPage() {
  const currentUser = await getCurrentUser()

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-0 pb-24 pt-2">
        <SearchView currentUser={currentUser} />
      </main>
    </div>
  )
}
