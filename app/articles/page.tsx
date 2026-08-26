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
  //
  // The first page is fetched through `getArticleFeed` rather than sliced from
  // `hub.latest`, even though that costs one more query. The two are NOT
  // interchangeable: `hub.latest` already has the hero removed, while
  // `getArticleFeed` applies `offset` in SQL and excludes the hero as a
  // predicate. Seeding from the slice and then paging with offset 12 therefore
  // skipped an article at the boundary, and `hub.latest` also ignores the
  // category/search filters the hub's own load-more path passes.
  const hub = await getArticleHub()
  const feed = await getArticleFeed({ limit: 12, excludeId: hub.featured?.id })

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <ArticlesHub
          featured={hub.featured}
          editorsPicks={hub.editorsPicks}
          initialFeed={feed.items}
          initialNextOffset={feed.nextOffset}
          categories={hub.categories}
        />
      </main>
    </div>
  )
}
