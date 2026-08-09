import { notFound } from "next/navigation"
import { getOrganizationByHandle, getOrganizationPosts } from "@/app/actions/organizations"
import { getOrganizationEvents, getOrganizationCatalogue } from "@/app/actions/org-content"
import { getWriterArticles } from "@/app/actions/articles"
import { SiteHeader } from "@/components/site-header"
import { OrgTabs } from "@/components/org/org-tabs"
import { OrgHero } from "@/components/org/org-hero"

// Load a secondary section without letting one failing query take down the
// whole profile. A failure degrades that section to empty (still logged) rather
// than 500ing the entire route — the hero and remaining tabs still render.
async function safeSection<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load()
  } catch (err) {
    console.error(`[v0] Org profile section "${label}" failed to load:`, err)
    return fallback
  }
}

export default async function OrganizationPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const org = await getOrganizationByHandle(handle)
  if (!org) notFound()

  const [posts, events, catalogue, articles] = await Promise.all([
    safeSection("posts", () => getOrganizationPosts(org.id), []),
    safeSection("events", () => getOrganizationEvents(org.id), { upcoming: [], past: [] }),
    safeSection("catalogue", () => getOrganizationCatalogue(org.id), []),
    safeSection("articles", () => getWriterArticles(org.ownerId), []),
  ])

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <OrgHero org={org} />

      <main className="mx-auto w-full max-w-4xl px-4 pb-8 sm:px-6">
        <OrgTabs org={org} posts={posts} articles={articles} events={events} catalogue={catalogue} />
      </main>
    </div>
  )
}
