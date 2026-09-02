import { notFound } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { getPublicCommunityPostsByUser, getAnonymousCommunityPostsByUser } from "@/app/actions/community"
import { getFeedPostsByUser } from "@/app/actions/feed"
import { getActiveStatusForUser } from "@/app/actions/status"
import { getWriterArticles } from "@/app/actions/articles"
import { getCurrentUser } from "@/lib/session"
import { getProfileScope } from "@/lib/home/profile-scope"
import { HomeMark } from "@/components/home/home-mark"
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

  // /u/[id] is ALWAYS the person. It never redirects to an organisation.
  //
  // This page previously redirected in two ways, and both erased the individual:
  //   1. your own profile → /org/[handle] whenever you administered the active
  //      Home, so an admin had no personal profile at all; and
  //   2. anyone's profile → /org/[handle] if that user happened to own an org,
  //      so visitors could never see the person either.
  //
  // A user is a person who may hold a role in some Home — the role is not the
  // identity. A Home profile is reached deliberately, from the Home switcher's
  // per-Home menu, never by opening a human being's profile.
  const profile = await getProfile(id)
  if (!profile) notFound()

  // Every timeline below is scoped to the ACTIVE Home (see lib/home/profile-scope).
  // The scope is read here purely so the header can name the context the visitor
  // is seeing — the queries resolve it themselves, so there is no way for the
  // page to display one Home's label over another Home's content.
  const scope = await getProfileScope()

  const [feedPosts, communityPosts, anonymousPosts, currentUser, statusGroup, articles] = await Promise.all([
    // Main-feed posts power the "Posts" tab. Public (identifiable) Community Help
    // posts feed the "Thread" tab for every viewer; anonymous posts are fetched
    // only for the owner's own profile — the action returns nothing otherwise.
    getFeedPostsByUser(id),
    getPublicCommunityPostsByUser(id),
    profile.isSelf ? getAnonymousCommunityPostsByUser(id) : Promise.resolve([]),
    getCurrentUser(),
    getActiveStatusForUser(id),
    getWriterArticles(id),
  ])

  return (
    <div className="min-h-screen">
      <SiteHeader />
      {/* Full-bleed, immersive header — a centered profile composition on top of
          a soft gradient glow derived from the user's avatar colors. This band
          is theme-sensitive: it uses the app's own background/foreground tokens
          so it renders light in light mode and dark in dark mode. The gradient
          glow is defined with color-mix transparency over that background, so it
          reads correctly on either. */}
      <header className="relative overflow-hidden border-b border-border/60 bg-background text-foreground">
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

          {/* The Home this profile is being read in. Deliberately a quiet,
              non-interactive chip rather than a picker: the active Home already
              IS the filter, so offering a selector here would imply the profile
              can be re-scoped independently of the Home you're inside. It reads
              as "this person, within this Home", which is what the timelines
              below actually contain. */}
          {scope.homeName && (
            <div className="mt-2 flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 py-1 pl-1 pr-2.5">
              <HomeMark
                name={scope.homeName}
                logo={scope.homeLogo}
                initials={scope.homeInitials}
                color={scope.homeColor}
                className="size-4"
                rounded="rounded"
              />
              <span className="text-[11px] font-medium text-muted-foreground">{scope.homeName}</span>
            </div>
          )}

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
          homeName={scope.homeName}
          currentUser={currentUser}
          feedPosts={feedPosts}
          communityPosts={communityPosts}
          anonymousPosts={anonymousPosts}
          articles={articles}
        />
      </main>
    </div>
  )
}
