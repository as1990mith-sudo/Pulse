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
  const [hub, feed] = await Promise.all([getArticleHub(), getArticleFeed({ limit: 12 })])

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
