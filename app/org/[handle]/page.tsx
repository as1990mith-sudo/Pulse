import { notFound } from "next/navigation"
import { getOrganizationByHandle, getOrganizationPosts } from "@/app/actions/organizations"
import { getOrganizationEvents, getOrganizationCatalogue } from "@/app/actions/org-content"
import { getWriterArticles } from "@/app/actions/articles"
import { SiteHeader } from "@/components/site-header"
import { OrgTabs } from "@/components/org/org-tabs"
import { OrgHero } from "@/components/org/org-hero"

export default async function OrganizationPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const org = await getOrganizationByHandle(handle)
  if (!org) notFound()

  const [posts, events, catalogue, articles] = await Promise.all([
    getOrganizationPosts(org.id),
    getOrganizationEvents(org.id),
    getOrganizationCatalogue(org.id),
    getWriterArticles(org.ownerId),
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
