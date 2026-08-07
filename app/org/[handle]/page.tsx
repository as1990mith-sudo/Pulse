import { notFound } from "next/navigation"
import Link from "next/link"
import { BadgeCheck, Globe, MapPin, ShieldQuestion } from "lucide-react"
import { getOrganizationByHandle, getOrganizationPosts, getOrganizationSubscribers } from "@/app/actions/organizations"
import { getEpisodesByUser } from "@/lib/content"
import { getWriterArticles } from "@/app/actions/articles"
import { SiteHeader } from "@/components/site-header"
import { OrgTabs } from "@/components/org/org-tabs"
import { OrgSubscribeButton } from "@/components/org/org-subscribe-button"
import { OrgVerifyButton } from "@/components/org/org-verify-button"

export default async function OrganizationPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const org = await getOrganizationByHandle(handle)
  if (!org) notFound()

  const [posts, subscribers, episodes, articles] = await Promise.all([
    getOrganizationPosts(org.id),
    getOrganizationSubscribers(org.id),
    getEpisodesByUser(org.ownerId, org.isOwner),
    getWriterArticles(org.ownerId),
  ])

  const websiteHost = org.website ? org.website.replace(/^https?:\/\//, "").replace(/\/$/, "") : null

  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Immersive organisation header on a soft ambient glow. */}
      <header className="relative overflow-hidden border-b border-border/60">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-64"
          style={{
            backgroundImage:
              "radial-gradient(120% 80% at 50% 0%, color-mix(in oklab, var(--primary) 30%, transparent) 0%, transparent 70%)",
          }}
          aria-hidden
        />

        <div className="relative mx-auto flex w-full max-w-md flex-col items-center px-4 pb-5 pt-4 text-center sm:px-6">
          {/* Logo */}
          <div className="rounded-2xl bg-background p-1 shadow-xl ring-1 ring-border/50">
            <span
              className={`flex size-20 items-center justify-center overflow-hidden rounded-xl text-2xl font-bold ${!org.logo ? org.color : ""}`}
            >
              {org.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={org.logo || "/placeholder.svg"} alt={org.name} className="size-full object-cover" />
              ) : (
                org.initials
              )}
            </span>
          </div>

          {/* Name + verification badge */}
          <div className="mt-3 flex items-center gap-1.5">
            <h1 className="text-balance text-xl font-bold tracking-tight">{org.name}</h1>
            {org.verified ? (
              <BadgeCheck className="size-5 shrink-0 text-primary" aria-label="Verified ministry" />
            ) : (
              <ShieldQuestion
                className="size-5 shrink-0 text-muted-foreground/50"
                aria-label="Not yet verified"
              />
            )}
          </div>

          {/* Category · Reach · Location identity line */}
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="rounded-full bg-secondary px-2.5 py-1 font-medium text-secondary-foreground">
              {org.categoryLabel}
            </span>
            <span className="inline-flex items-center gap-1">
              <Globe className="size-3.5" /> {org.reachLabel}
            </span>
            {org.locationLabel && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" /> {org.locationLabel}
              </span>
            )}
          </div>

          {/* Short description */}
          {org.description && (
            <p className="mt-2 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
              {org.description}
            </p>
          )}

          {/* Primary actions */}
          <div className="mt-4 flex w-full flex-col gap-2">
            {org.isOwner ? (
              <div className="flex w-full items-center gap-2">
                <OrgVerifyButton
                  organizationId={org.id}
                  status={org.verificationStatus}
                  verified={org.verified}
                  className="h-11 flex-1"
                />
                {websiteHost && (
                  <WebsiteButton href={org.website!} host={websiteHost} />
                )}
              </div>
            ) : (
              <div className="flex w-full items-center gap-2">
                <OrgSubscribeButton
                  organizationId={org.id}
                  organizationName={org.name}
                  initialSubscribed={org.isSubscribed}
                  initialNotify={org.notify}
                  className="h-11 flex-1"
                />
                {websiteHost && <WebsiteButton href={org.website!} host={websiteHost} />}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6">
        <OrgTabs org={org} posts={posts} articles={articles} episodes={episodes} subscribers={subscribers} />
      </main>
    </div>
  )
}

function WebsiteButton({ href, host }: { href: string; host: string }) {
  const url = /^https?:\/\//.test(href) ? href : `https://${href}`
  return (
    <Link
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-4 text-sm font-semibold transition hover:bg-muted"
      title={`Visit ${host}`}
    >
      <Globe className="size-4" />
      <span className="max-w-28 truncate">Visit Website</span>
    </Link>
  )
}
