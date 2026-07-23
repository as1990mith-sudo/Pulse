import { notFound } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { getEpisodesByUser } from "@/lib/content"
import { getPostsByUser } from "@/app/actions/feed"
import { getActiveStatusForUser } from "@/app/actions/status"
import { getWriterArticles } from "@/app/actions/articles"
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

  const [episodes, posts, currentUser, statusGroup, articles] = await Promise.all([
    getEpisodesByUser(id, profile.isSelf),
    getPostsByUser(id),
    getCurrentUser(),
    getActiveStatusForUser(id),
    getWriterArticles(id),
  ])

  return (
    <div className="min-h-screen">
      <SiteHeader />
      {/* Full-bleed, immersive header — a centered profile composition on top of
          a soft gradient glow derived from the user's avatar colors. */}
      <header className="relative overflow-hidden border-b border-border/60">
        {/* Ambient gradient glow that fades into the page background. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-64"
          style={{
            backgroundImage: `radial-gradient(120% 80% at 50% 0%, color-mix(in oklab, var(${profile.gradient.from}) 45%, transparent) 0%, color-mix(in oklab, var(${profile.gradient.to}) 22%, transparent) 45%, transparent 75%)`,
          }}
          aria-hidden
        />

        <div className="relative mx-auto flex w-full max-w-md flex-col items-center px-4 pb-5 pt-3 text-center sm:px-6">
          {/* Ringed avatar, centered. */}
          <div className="rounded-full bg-background p-1 shadow-xl ring-1 ring-border/50">
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

          {/* Name + handle, centered. */}
          <div className="mt-3 flex flex-col items-center gap-0.5">
            <ProfileName name={profile.name} editable={profile.isSelf} />
            <p className="text-sm text-muted-foreground">{profile.handle}</p>
          </div>

          {/* Bio, centered. */}
          <div className="mt-2 flex flex-col items-center text-center">
            <ProfileBio bio={profile.bio} editable={profile.isSelf} />
          </div>

          {/* Stats with a vertical divider. */}
          <div className="mt-3">
            <ProfileFollowStats
              userId={profile.id}
              followers={profile.followers}
              following={profile.following}
            />
          </div>

          {/* Actions for other people's profiles — Follow and Message sit
              side by side, each flexing to an equal share of the row. */}
          {!profile.isSelf && (
            <div className="mt-4 flex w-full items-center gap-2">
              <ProfileFollowButton
                targetUserId={profile.id}
                targetName={profile.name}
                initialFollowing={profile.isFollowing}
                className="h-11 flex-1 rounded-full text-sm font-semibold"
              />
              {currentUser && (
                <ProfileMessageButton
                  targetUserId={profile.id}
                  targetName={profile.name}
                  variant="outline"
                  className="h-11 flex-1 rounded-full text-sm font-semibold"
                />
              )}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6">
        <ProfileTabs
          name={profile.name}
          isSelf={profile.isSelf}
          episodes={episodes}
          posts={posts}
          articles={articles}
          currentUser={currentUser}
        />
      </main>
    </div>
  )
}
