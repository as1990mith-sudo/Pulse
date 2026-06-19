import { notFound } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { getEpisodesByUser } from "@/lib/content"
import { getPostsByUser } from "@/app/actions/feed"
import { getCurrentUser } from "@/lib/session"
import { SiteHeader } from "@/components/site-header"
import { ProfileFollowButton } from "@/components/profile/profile-follow-button"
import { ProfileTabs } from "@/components/profile/profile-tabs"
import { cn } from "@/lib/utils"

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile(id)
  if (!profile) notFound()

  const [episodes, posts, currentUser] = await Promise.all([
    getEpisodesByUser(id),
    getPostsByUser(id),
    getCurrentUser(),
  ])

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-5 border-b border-border/60 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span
              className={cn(
                "flex size-16 items-center justify-center rounded-full text-xl font-semibold sm:size-20 sm:text-2xl",
                profile.color,
              )}
            >
              {profile.initials}
            </span>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{profile.name}</h1>
              <p className="text-muted-foreground">{profile.handle}</p>
              <div className="flex items-center gap-4 pt-1 text-sm">
                <span>
                  <span className="font-semibold text-foreground">{profile.followers}</span>{" "}
                  <span className="text-muted-foreground">followers</span>
                </span>
                <span>
                  <span className="font-semibold text-foreground">{profile.following}</span>{" "}
                  <span className="text-muted-foreground">following</span>
                </span>
                <span>
                  <span className="font-semibold text-foreground">{episodes.length}</span>{" "}
                  <span className="text-muted-foreground">episodes</span>
                </span>
                <span>
                  <span className="font-semibold text-foreground">{posts.length}</span>{" "}
                  <span className="text-muted-foreground">tweets</span>
                </span>
              </div>
            </div>
          </div>

          {!profile.isSelf && (
            <ProfileFollowButton
              targetUserId={profile.id}
              targetName={profile.name}
              initialFollowing={profile.isFollowing}
            />
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
