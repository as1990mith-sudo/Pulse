import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { ArticlesHub } from "@/components/articles/articles-hub"
import { getArticleHub, getArticleFeed } from "@/app/actions/articles"

export const metadata: Metadata = {
  title: "Articles · Frequency",
  description: "Read and write long-form articles from the Frequency community.",
}

export const dynamic = "force-dynamic"

export default async function ArticlesPage() {
  // Fetch the featured article first so the latest feed can omit it (otherwise
  // the hero article shows up again as the first "Latest articles" card).
  const hub = await getArticleHub()
  const feed = await getArticleFeed({ limit: 12, excludeId: hub.featured?.id })

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <ArticlesHub
          featured={hub.featured}
          featuredWriters={hub.featuredWriters}
          initialFeed={feed.items}
          initialNextOffset={feed.nextOffset}
          categories={hub.categories}
        />
      </main>
    </div>
  )
}
