import { notFound } from "next/navigation"
import Link from "next/link"
import { Globe, MapPin, ShieldQuestion } from "lucide-react"
import { getOrganizationByHandle, getOrganizationPosts } from "@/app/actions/organizations"
import { getOrganizationEvents, getOrganizationCatalogue } from "@/app/actions/org-content"
import { getWriterArticles } from "@/app/actions/articles"
import { SiteHeader } from "@/components/site-header"
import { OrgTabs } from "@/components/org/org-tabs"
import { OrgSubscribeButton } from "@/components/org/org-subscribe-button"
import { OrgVerifyButton } from "@/components/org/org-verify-button"
import { OrgManageSheet } from "@/components/org/org-manage-sheet"
import { AvatarWithBadge, VerifiedBadge } from "@/components/org/verified-badge"

export default async function OrganizationPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const org = await getOrganizationByHandle(handle)
  if (!org) notFound()

  const [posts, events, catalogue, articles] = await Promise.all([
    getOrganizationPosts(org.id),
    getOrganizationEvents(org.id),
    getOrganizationCatalogue(org.id),
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
          <AvatarWithBadge verified={org.verified} badgeSize="lg">
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
          </AvatarWithBadge>

          {/* Name + verification badge */}
          <div className="mt-3 flex items-center gap-1.5">
            <h1 className="text-balance text-xl font-bold tracking-tight">{org.name}</h1>
            {org.verified ? (
              <VerifiedBadge size="md" />
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
          <div className="mt-4 flex w-full flex-col items-center gap-3">
            {org.isOwner ? (
              <>
                <div className="flex w-full max-w-[240px] items-center gap-2">
                  <OrgManageSheet org={org} />
                  {/* Verify control only when not yet verified; a verified org
                      already shows the badge on its logo and name. */}
                  {!org.verified && (
                    <OrgVerifyButton
                      organizationId={org.id}
                      status={org.verificationStatus}
                      verified={org.verified}
                    />
                  )}
                </div>
                {websiteHost && (
                  <div className="w-full max-w-[240px]">
                    <WebsiteButton href={org.website!} host={websiteHost} />
                  </div>
                )}
              </>
            ) : (
              // Single compact row: subscribe pill grows, notify bell + website
              // sit beside it so all controls are side by side and balanced.
              <div className="flex w-full max-w-[340px] items-center justify-center gap-2">
                <OrgSubscribeButton
                  organizationId={org.id}
                  initialSubscribed={org.isSubscribed}
                  initialNotify={org.notify}
                  compact
                  className="min-w-0 flex-1"
                />
                {websiteHost && <WebsiteButton href={org.website!} host={websiteHost} />}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6">
        <OrgTabs org={org} posts={posts} articles={articles} events={events} catalogue={catalogue} />
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
      className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-semibold transition hover:bg-muted"
      title={`Visit ${host}`}
    >
      <Globe className="size-4 shrink-0" />
      <span className="truncate">Website</span>
    </Link>
  )
}
