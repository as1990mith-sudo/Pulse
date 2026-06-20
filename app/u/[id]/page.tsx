import { notFound } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { getEpisodesByUser } from "@/lib/content"
import { getPostsByUser } from "@/app/actions/feed"
import { getActiveStatusForUser } from "@/app/actions/status"
import { getCurrentUser } from "@/lib/session"
import { SiteHeader } from "@/components/site-header"
import { ProfileFollowButton } from "@/components/profile/profile-follow-button"
import { ProfileMessageButton } from "@/components/profile/profile-message-button"
import { ProfileFollowStats } from "@/components/profile/profile-follow-stats"
import { ProfileTabs } from "@/components/profile/profile-tabs"
import { ProfileAvatar } from "@/components/profile/profile-avatar"
import { ProfileName } from "@/components/profile/profile-name"

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile(id)
  if (!profile) notFound()

  const [episodes, posts, currentUser, statusGroup] = await Promise.all([
    getEpisodesByUser(id),
    getPostsByUser(id),
    getCurrentUser(),
    getActiveStatusForUser(id),
  ])

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-5 border-b border-border/60 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <ProfileAvatar
              initials={profile.initials}
              color={profile.color}
              image={profile.image}
              name={profile.name}
              editable={profile.isSelf}
              statusGroup={statusGroup}
              currentUser={currentUser}
            />
            <div className="space-y-1">
              <ProfileName name={profile.name} handle={profile.handle} editable={profile.isSelf} />
              <ProfileFollowStats
                userId={profile.id}
                followers={profile.followers}
                following={profile.following}
                episodes={episodes.length}
                posts={posts.length}
              />
            </div>
          </div>

          {!profile.isSelf && (
            <div className="flex items-center gap-2">
              <ProfileFollowButton
                targetUserId={profile.id}
                targetName={profile.name}
                initialFollowing={profile.isFollowing}
              />
              {currentUser && <ProfileMessageButton targetUserId={profile.id} targetName={profile.name} />}
            </div>
          )}
        </header>

        <ProfileTabs
          name={profile.name}
          isSelf={profile.isSelf}
          episodes={episodes}
          posts={posts}
          currentUser={currentUser}
        />
      </main>
    </div>
  )
}
