import { notFound } from "next/navigation"
import { requireHomeMembership } from "@/lib/home/access"
import { getOrganizationByHandle, getOrganizationPosts } from "@/app/actions/organizations"
import { HomeFeed } from "@/components/home/feed/home-feed"

export default async function HomeFeedPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  // Membership enforced by the /home/[handle] layout. Resolve the org for its
  // posts — the query is scoped to this organisation only.
  await requireHomeMembership(handle)
  const org = await getOrganizationByHandle(handle)
  if (!org) notFound()
  const posts = await getOrganizationPosts(org.id)

  return <HomeFeed org={org} posts={posts} orgName={org.name} />
}
