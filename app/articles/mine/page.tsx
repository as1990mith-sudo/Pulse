import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { MyArticlesView } from "@/components/articles/my-articles-view"
import { getCurrentUser } from "@/lib/session"
import { getMyArticles } from "@/app/actions/articles"

export const metadata: Metadata = {
  title: "My Articles · Frequency",
}

export const dynamic = "force-dynamic"

export default async function MyArticlesPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/login")

  const { drafts, published, archived } = await getMyArticles()
  // The view filters by status internally, so hand it a single flat list.
  const initial = [...published, ...drafts, ...archived]

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <MyArticlesView initial={initial} />
      </main>
    </div>
  )
}
