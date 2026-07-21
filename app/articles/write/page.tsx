import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { ArticleEditor } from "@/components/articles/article-editor"
import { getCurrentUser } from "@/lib/session"
import { getEditableArticle } from "@/app/actions/articles"

export const metadata: Metadata = {
  title: "Write an Article · Frequency",
}

export const dynamic = "force-dynamic"

export default async function WriteArticlePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/login")

  const { id } = await searchParams
  const existing = id ? await getEditableArticle(id) : null
  if (id && !existing) redirect("/articles/mine")

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <ArticleEditor
          seed={
            existing
              ? {
                  id: existing.id,
                  title: existing.title,
                  category: existing.category,
                  tags: existing.tags,
                  coverUrl: existing.coverUrl,
                  bodyHtml: existing.bodyHtml,
                  status: existing.status,
                }
              : undefined
          }
        />
      </main>
    </div>
  )
}
