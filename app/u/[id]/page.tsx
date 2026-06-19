import { notFound } from "next/navigation"
import { Mic } from "lucide-react"
import { getProfile } from "@/lib/profile"
import { getEpisodesByUser } from "@/lib/content"
import { SiteHeader } from "@/components/site-header"
import { EpisodeCatalog } from "@/components/episode-catalog"
import { ProfileFollowButton } from "@/components/profile/profile-follow-button"
import { cn } from "@/lib/utils"

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile(id)
  if (!profile) notFound()

  const episodes = await getEpisodesByUser(id)

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

        <section className="mt-8 space-y-5">
          <h2 className="text-lg font-semibold tracking-tight">
            {profile.isSelf ? "Your published episodes" : `Episodes by ${profile.name}`}
          </h2>

          {episodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <Mic className="size-6" />
              </span>
              <p className="font-medium">No published episodes yet</p>
              <p className="max-w-sm text-pretty text-sm text-muted-foreground">
                {profile.isSelf
                  ? "When you finish a live session in the studio, publish it and it will appear here for your followers to browse."
                  : `${profile.name} hasn't published any episodes yet. Follow them to know when they go live.`}
              </p>
            </div>
          ) : (
            <EpisodeCatalog episodes={episodes} />
          )}
        </section>
      </main>
    </div>
  )
}
