import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { ArticleReader } from "@/components/articles/article-reader"
import { getCurrentUser } from "@/lib/session"
import {
  getArticle,
  getArticleComments,
  getMoreFromAuthor,
  getRelatedArticles,
} from "@/app/actions/articles"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const article = await getArticle(id)
  if (!article) return { title: "Article · Frequency" }
  return {
    title: `${article.title} · Frequency`,
    description: article.excerpt || undefined,
    openGraph: article.coverUrl ? { images: [article.coverUrl] } : undefined,
  }
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const article = await getArticle(id)
  if (!article) notFound()

  const [comments, moreFromAuthor, related, currentUser] = await Promise.all([
    getArticleComments(id),
    getMoreFromAuthor(id, article.author.id),
    getRelatedArticles(id, article.category, article.author.id),
    getCurrentUser(),
  ])

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <ArticleReader
          article={article}
          comments={comments}
          moreFromAuthor={moreFromAuthor}
          related={related}
          signedIn={Boolean(currentUser)}
        />
      </main>
    </div>
  )
}
