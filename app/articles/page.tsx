import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { ArticlesHub } from "@/components/articles/articles-hub"
import { getArticleHub } from "@/app/actions/articles"

export const metadata: Metadata = {
  title: "Articles · Frequency",
  description: "Read and write long-form articles from the Frequency community.",
}

export const dynamic = "force-dynamic"

export default async function ArticlesPage() {
  // `getArticleHub` already returns up to 30 of the latest published articles
  // with the hero removed, so the first feed page is sliced from that instead of
  // issuing a second, near-identical query. The old code awaited the hub and
  // THEN awaited the feed — a strict waterfall where the feed's whole
  // author-scoping chain re-ran before any HTML could be sent. Both orderings
  // are tie-broken identically, so paging deeper via getArticleFeed(offset: 12)
  // continues exactly where this slice ends.
  const hub = await getArticleHub()
  const PAGE = 12
  const feed = {
    items: hub.latest.slice(0, PAGE),
    nextOffset: hub.latest.length > PAGE ? PAGE : null,
  }

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
