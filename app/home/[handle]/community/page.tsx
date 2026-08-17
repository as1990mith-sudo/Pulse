import { requireHomeMembership } from "@/lib/home/access"
import { getCommunityPosts } from "@/app/actions/community"
import { CommunityHelp } from "@/components/community-help"

export default async function HomeCommunityPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  // Membership enforced by the layout. This Community Help is PRIVATE to the
  // Home: getCommunityPosts(home.id) returns only this organisation's threads,
  // and new posts are stamped with the same homeId — so it never mixes with the
  // Universal room or any other organisation's private conversations.
  const { home } = await requireHomeMembership(handle)
  const initialPosts = await getCommunityPosts(home.id)

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col overflow-hidden md:h-svh">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
        <CommunityHelp initialPosts={initialPosts} homeId={home.id} embedded />
      </main>
    </div>
  )
}
