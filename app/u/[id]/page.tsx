import { notFound } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { getEpisodesByUser } from "@/lib/content"
import { getPostsByUser, getRepostsByUser } from "@/app/actions/feed"
import { getSavedItems, type SavedItemView } from "@/app/actions/share"
import { getActiveStatusForUser } from "@/app/actions/status"
import { getCurrentUser } from "@/lib/session"
import { SiteHeader } from "@/components/site-header"
import { ProfileFollowButton } from "@/components/profile/profile-follow-button"
import { ProfileMessageButton } from "@/components/profile/profile-message-button"
import { ProfileFollowStats } from "@/components/profile/profile-follow-stats"
import { ProfileTabs } from "@/components/profile/profile-tabs"
import { ProfileAvatar } from "@/components/profile/profile-avatar"
import { ProfileName } from "@/components/profile/profile-name"
import { ProfileBio } from "@/components/profile/profile-bio"

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile(id)
  if (!profile) notFound()

  const [episodes, posts, reposts, currentUser, statusGroup] = await Promise.all([
    getEpisodesByUser(id, profile.isSelf),
    getPostsByUser(id),
    getRepostsByUser(id),
    getCurrentUser(),
    getActiveStatusForUser(id),
  ])

  // Saved bookmarks are private — only fetch them when viewing your own profile.
  const saved: SavedItemView[] = profile.isSelf ? await getSavedItems() : []

  return (
    <div className="min-h-screen">
      <SiteHeader />
      {/* Full-bleed, immersive header — stretches edge to edge with no card chrome. */}
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        {/* Cover banner with a soft brand-tinted gradient + subtle glow. */}
        <div className="relative h-28 bg-gradient-to-br from-primary/30 via-primary/10 to-transparent sm:h-36">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(120% 100% at 85% 0%, color-mix(in oklab, var(--primary) 22%, transparent) 0%, transparent 60%)",
            }}
          />
        </div>

        {/* Inner content stays aligned to the same max width as the tabs below. */}
        <div className="mx-auto w-full max-w-4xl px-4 pb-6 sm:px-6">
          {/* Avatar overlaps the banner; actions align to its baseline. */}
          <div className="-mt-12 flex items-end justify-between gap-4 sm:-mt-16">
            <div className="w-fit rounded-full bg-background p-1 shadow-lg">
              <ProfileAvatar
                initials={profile.initials}
                color={profile.color}
                image={profile.image}
                name={profile.name}
                editable={profile.isSelf}
                statusGroup={statusGroup}
                currentUser={currentUser}
              />
            </div>

            {!profile.isSelf && (
              <div className="flex items-center gap-2 pb-1">
                <ProfileFollowButton
                  targetUserId={profile.id}
                  targetName={profile.name}
                  initialFollowing={profile.isFollowing}
                />
                {currentUser && <ProfileMessageButton targetUserId={profile.id} targetName={profile.name} />}
              </div>
            )}
          </div>

          <div className="mt-4 space-y-3">
            <div className="space-y-0.5">
              <ProfileName name={profile.name} editable={profile.isSelf} />
              <p className="text-sm text-muted-foreground">{profile.handle}</p>
            </div>

            <ProfileBio bio={profile.bio} editable={profile.isSelf} />

            <ProfileFollowStats
              userId={profile.id}
              followers={profile.followers}
              following={profile.following}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6">
        <ProfileTabs
          name={profile.name}
          isSelf={profile.isSelf}
          episodes={episodes}
          posts={posts}
          reposts={reposts}
          saved={saved}
          currentUser={currentUser}
        />
      </main>
    </div>
  )
}
