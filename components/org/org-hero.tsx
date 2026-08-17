"use client"

import { useState } from "react"
import Link from "next/link"
import { Globe, LayoutDashboard, MapPin, ShieldQuestion } from "lucide-react"
import type { OrganizationView } from "@/lib/org-types"
import { VerifiedBadge } from "@/components/org/verified-badge"
import { OrgSubscribeButton } from "@/components/org/org-subscribe-button"
import { OrgVerifyButton } from "@/components/org/org-verify-button"
import { OrgManageSheet } from "@/components/org/org-manage-sheet"
import { cn } from "@/lib/utils"

/**
 * Premium organisation hero.
 *
 * Composition, not effects, does the heavy lifting: a cinematic cover derived
 * from the org's own logo (blurred + darkened, fading into the page), a raised
 * avatar with an integrated verification badge, a clear identity → metadata →
 * description → actions rhythm, and restrained motion on entry. All existing
 * data and controls (subscribe, notify, verify, manage, website) are preserved.
 */
export function OrgHero({ org }: { org: OrganizationView }) {
  const websiteHost = org.website ? org.website.replace(/^https?:\/\//, "").replace(/\/$/, "") : null

  return (
    <header className="relative overflow-hidden">
      <CinematicCover org={org} />

      <div className="relative mx-auto flex w-full max-w-md flex-col items-center px-5 pb-6 pt-24 text-center sm:pt-28">
        {/* Raised avatar overlapping the cover, with an integrated badge. */}
        <div className="animate-in fade-in zoom-in-95 duration-500">
          <OrgAvatar org={org} />
        </div>

        {/* Identity */}
        <div className="mt-4 flex flex-col items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {/* Badge lives inline in the text flow so it hugs the final word even
              when the name wraps, instead of drifting to the line's far edge. */}
          <h1 className="text-balance font-display text-[26px] font-bold leading-tight tracking-tight sm:text-3xl">
            {org.name}
            {org.verified ? (
              <VerifiedBadge size="md" className="ml-1.5 inline-block translate-y-0.5" />
            ) : (
              <ShieldQuestion
                className="ml-1.5 inline-block size-5 translate-y-0.5 text-muted-foreground/50"
                aria-label="Not yet verified"
              />
            )}
          </h1>

          {/* Metadata: type · reach on one line, location beneath — subtle
              separators instead of a stack of pills. */}
          <div className="flex flex-col items-center gap-1.5 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="font-medium text-foreground/90">{org.categoryLabel}</span>
              <span aria-hidden className="text-muted-foreground/40">
                ·
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Globe className="size-4 opacity-70" />
                {org.reachLabel}
              </span>
            </div>
            {org.locationLabel && (
              <div className="inline-flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="size-4 opacity-70" />
                <span className="text-pretty">{org.locationLabel}</span>
              </div>
            )}
          </div>
        </div>

        {/* Description as a short editorial statement */}
        {org.description && <HeroDescription text={org.description} />}

        {/* Primary actions */}
        <div className="mt-6 flex w-full flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-2 delay-100 duration-500">
          {org.isOwner ? (
            <div className="flex w-full max-w-[380px] flex-col items-stretch gap-2.5">
              {/* Primary owner entry point into the integrated admin console. */}
              <Link
                href={`/org/${org.handle}/admin`}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
              >
                <LayoutDashboard className="size-4 shrink-0" />
                Admin console
              </Link>
              <div className="flex items-center justify-center gap-2.5">
                <div className="flex flex-1">
                  <OrgManageSheet org={org} />
                </div>
                {websiteHost && <WebsiteButton href={org.website!} host={websiteHost} iconOnly />}
                {!org.verified && (
                  <div className="flex flex-1">
                    <OrgVerifyButton organizationId={org.id} status={org.verificationStatus} verified={org.verified} />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex w-full max-w-[360px] items-center justify-center gap-2.5">
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

          {org.subscriberCount > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{formatCount(org.subscriberCount)}</span>{" "}
              {org.subscriberCount === 1 ? "subscriber" : "subscribers"}
            </p>
          )}
        </div>
      </div>
    </header>
  )
}

/** Blurred-logo cover that fades into the page — or an ambient glow if no logo. */
function CinematicCover({ org }: { org: OrganizationView }) {
  const coverSrc = org.cover ?? org.logo

  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-52 overflow-hidden sm:h-60">
      {coverSrc ? (
        <>
          {/* A dedicated cover renders crisp and photographic; a logo-derived
              fallback stays heavily blurred so it reads as ambient art. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverSrc || "/placeholder.svg"}
            alt=""
            className={cn(
              "h-full w-full object-cover",
              org.cover ? "scale-105 opacity-90 saturate-110" : "scale-125 opacity-40 blur-2xl saturate-125",
            )}
          />
          {/* Darken + fade to the page background at the bottom. */}
          <div
            className={cn(
              "absolute inset-0 bg-gradient-to-b to-background",
              org.cover ? "from-background/20 via-background/40" : "from-background/50 via-background/30",
            )}
          />
          {/* Edge vignette so the cover melts into the page rather than sitting
              as a rectangular banner. */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(120% 90% at 50% 0%, transparent 45%, color-mix(in oklab, var(--background) 92%, transparent) 100%)",
            }}
          />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(120% 80% at 50% 0%, color-mix(in oklab, var(--primary) 24%, transparent) 0%, transparent 68%)",
          }}
        />
      )}
    </div>
  )
}

/** Large, softly-raised avatar with the verification badge tucked into it. */
function OrgAvatar({ org }: { org: OrganizationView }) {
  return (
    <div className="relative">
      <div className="rounded-[26px] bg-background/60 p-1 shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur-sm">
        <span
          className={cn(
            "flex size-24 items-center justify-center overflow-hidden rounded-[22px] text-3xl font-bold text-white sm:size-28",
            !org.logo && org.color,
          )}
        >
          {org.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logo || "/placeholder.svg"} alt={org.name} className="size-full object-cover" />
          ) : (
            org.initials
          )}
        </span>
      </div>
      {org.verified && (
        <span className="absolute -bottom-1 -right-1 rounded-full bg-background p-0.5 shadow-lg">
          <VerifiedBadge size="lg" />
        </span>
      )}
    </div>
  )
}

/** Description with a graceful clamp + Read more toggle for long statements. */
function HeroDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const long = text.length > 160

  return (
    <div className="mt-4 max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
      <p
        className={cn(
          "text-pretty text-[15px] leading-relaxed text-muted-foreground transition-all",
          long && !expanded && "line-clamp-3",
        )}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[13px] font-semibold text-primary transition-opacity hover:opacity-80"
          aria-expanded={expanded}
        >
          {expanded ? "Read less" : "Read more"}
        </button>
      )}
    </div>
  )
}

function WebsiteButton({
  href,
  host,
  full = false,
  iconOnly = false,
}: {
  href: string
  host: string
  full?: boolean
  iconOnly?: boolean
}) {
  const url = /^https?:\/\//.test(href) ? href : `https://${href}`
  return (
    <Link
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border/70 bg-secondary/40 text-sm font-semibold text-foreground shadow-sm transition-all hover:bg-secondary active:scale-[0.98]",
        iconOnly ? "w-10 shrink-0" : "px-4",
        !iconOnly && (full ? "w-full" : "shrink-0"),
      )}
      title={`Visit ${host}`}
      aria-label={iconOnly ? `Visit ${host}` : undefined}
    >
      <Globe className="size-4 shrink-0 opacity-80" />
      {!iconOnly && <span className="truncate">Website</span>}
    </Link>
  )
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`
  return String(n)
}
