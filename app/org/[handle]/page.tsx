import { notFound } from "next/navigation"
import { getOrganizationByHandle } from "@/app/actions/organizations"
import { getOrganizationCatalogue } from "@/app/actions/org-content"
import { getOrganizationMaterials, getOrganizationPlaylists } from "@/app/actions/materials"
import { getFeedPostsByOrganization } from "@/app/actions/feed"
import { getOrgCommunityPosts } from "@/app/actions/community"
import { getWriterArticles } from "@/app/actions/articles"
import { getCurrentUser } from "@/lib/session"
import { getHomeRosterByOrg } from "@/lib/home/access"
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

  // Posts are the org's main-feed posts in the same shape the feed uses, so the
  // tab renders with <PostCard>. Threads are the org's Community Help threads;
  // the action itself withholds anonymous rows from non-admins.
  const [posts, threads, catalogue, materials, playlists, articles, members, currentUser] = await Promise.all([
    safeSection("posts", () => getFeedPostsByOrganization(org.id), []),
    safeSection("threads", () => getOrgCommunityPosts(org.id), []),
    safeSection("catalogue", () => getOrganizationCatalogue(org.id), []),
    safeSection("materials", () => getOrganizationMaterials(org.id), []),
    safeSection("playlists", () => getOrganizationPlaylists(org.id), []),
    safeSection("articles", () => getWriterArticles(org.ownerId), []),
    safeSection("members", () => getHomeRosterByOrg(org.id), []),
    safeSection("currentUser", () => getCurrentUser(), null),
  ])

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <OrgHero org={org} members={members} />

      <main className="mx-auto w-full max-w-4xl px-4 pb-8 sm:px-6">
        <OrgTabs
          org={org}
          posts={posts}
          threads={threads}
          currentUser={currentUser}
          articles={articles}
          catalogue={catalogue}
          materials={materials}
          playlists={playlists}
        />
      </main>
    </div>
  )
}
