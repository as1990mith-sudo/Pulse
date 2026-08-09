"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import useSWR from "swr"
import { Compass, MapPin, Search, SlidersHorizontal, Sparkles, X } from "lucide-react"
import {
  discoverOrganizations,
  updateMyLocation,
  type DiscoverBucket,
  type DiscoverOrganizationView,
  type DiscoverParams,
} from "@/app/actions/organizations"
import { ORG_CATEGORIES, ORG_REACH, type OrgCategory, type OrgReach } from "@/lib/org-types"
import { VerifiedBadge } from "@/components/org/verified-badge"
import { OrgSubscribeButton } from "@/components/org/org-subscribe-button"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const BUCKET_META: Record<DiscoverBucket, { label: string; hint: string }> = {
  subscribed: { label: "Your subscriptions", hint: "Ministries you follow" },
  nearby: { label: "Near you", hint: "Based on your location" },
  featured: { label: "Featured", hint: "Curated by Frequency" },
  new: { label: "More ministries", hint: "" },
}

const BUCKET_ORDER: DiscoverBucket[] = ["subscribed", "nearby", "featured", "new"]

// Buckets rendered as horizontally scrollable rails vs. vertical editorial lists.
const RAIL_BUCKETS = new Set<DiscoverBucket>(["subscribed", "featured"])

// Compact discovery filter chips shown under the search field. Each maps onto
// the existing category / reach filters so behaviour is unchanged.
type FilterChip = { label: string; category?: OrgCategory; reach?: OrgReach }
const FILTER_CHIPS: FilterChip[] = [
  { label: "Churches", category: "church" },
  { label: "Ministries", category: "ministry" },
  { label: "Prayer", category: "prayer_ministry" },
  { label: "Missions", category: "mission" },
  { label: "Youth", category: "youth_group" },
  { label: "Teaching", category: "bible_teaching" },
  { label: "Media", category: "christian_media" },
  { label: "Online", reach: "online_only" },
]

// Shared hidden-scrollbar treatment for the horizontal rails / chip rows.
const NO_SCROLLBAR = "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"

export function DiscoverBrowser({
  initial,
  hasLocation,
  location,
}: {
  initial: DiscoverOrganizationView[]
  hasLocation: boolean
  location: { country: string | null; city: string | null; region: string | null }
}) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<OrgCategory | "all">("all")
  const [reach, setReach] = useState<OrgReach | "all">("all")
  const [scope, setScope] = useState<"all" | "nearby">("all")
  const [showFilters, setShowFilters] = useState(false)

  const params: DiscoverParams = useMemo(
    () => ({ query: query.trim() || undefined, category, reach, scope }),
    [query, category, reach, scope],
  )

  const key = ["discover", params.query ?? "", params.category, params.reach, params.scope]
  const { data, isLoading } = useSWR<DiscoverOrganizationView[]>(key, () => discoverOrganizations(params), {
    fallbackData: initial,
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  const orgs = data ?? []
  const grouped = useMemo(() => {
    const map = new Map<DiscoverBucket, DiscoverOrganizationView[]>()
    for (const o of orgs) {
      const list = map.get(o.bucket) ?? []
      list.push(o)
      map.set(o.bucket, list)
    }
    return BUCKET_ORDER.map((b) => [b, map.get(b) ?? []] as const).filter(([, l]) => l.length > 0)
  }, [orgs])

  const activeFilterCount = (category !== "all" ? 1 : 0) + (reach !== "all" ? 1 : 0) + (scope !== "all" ? 1 : 0)

  function selectChip(chip: FilterChip) {
    if (chip.category) {
      setCategory((c) => (c === chip.category ? "all" : (chip.category as OrgCategory)))
    } else if (chip.reach) {
      setReach((r) => (r === chip.reach ? "all" : (chip.reach as OrgReach)))
    }
  }

  function resetChips() {
    setCategory("all")
    setReach("all")
  }

  const isChipActive = (chip: FilterChip) =>
    (chip.category && category === chip.category) || (chip.reach && reach === chip.reach)

  return (
    <div className="relative flex flex-col gap-5">
      {/* ── Search + filter — a single elevated glass surface, not a plain pill. */}
      <div className="flex items-center gap-2.5">
        <div className="group relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ministries, churches, cities…"
            aria-label="Search organisations"
            className={cn(
              "h-13 w-full rounded-2xl border border-white/[0.06] bg-card/70 pl-11 pr-10 text-sm text-foreground shadow-elevated outline-none backdrop-blur-xl transition-all duration-300",
              "placeholder:text-muted-foreground focus:border-primary/40 focus:bg-card focus:shadow-[0_0_0_4px_oklch(0.72_0.18_55/0.12)]",
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-pressed={showFilters}
          aria-label="Filters"
          className={cn(
            "relative flex size-13 shrink-0 items-center justify-center rounded-2xl border shadow-elevated backdrop-blur-xl transition-all duration-200 active:scale-95",
            showFilters || activeFilterCount > 0
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-white/[0.06] bg-card/70 text-muted-foreground hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="size-[18px]" />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground shadow-soft">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Category discovery — horizontally scrollable compact chips. */}
      <div className={cn("-mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0", NO_SCROLLBAR)}>
        <button
          type="button"
          onClick={resetChips}
          aria-pressed={category === "all" && reach === "all"}
          className={cn(
            "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 active:scale-95",
            category === "all" && reach === "all"
              ? "bg-primary text-primary-foreground shadow-soft"
              : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.07] hover:text-foreground",
          )}
        >
          All
        </button>
        {FILTER_CHIPS.map((chip) => {
          const active = isChipActive(chip)
          return (
            <button
              key={chip.label}
              type="button"
              onClick={() => selectChip(chip)}
              aria-pressed={!!active}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 active:scale-95",
                active
                  ? "bg-primary text-primary-foreground shadow-soft"
                  : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.07] hover:text-foreground",
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* ── Advanced filters (reach + location) — kept behind the filter button. */}
      {showFilters && (
        <div className="flex animate-in flex-col gap-4 rounded-2xl bg-card/70 p-4 shadow-elevated backdrop-blur-xl duration-200 fade-in slide-in-from-top-1">
          <FilterRow label="Reach">
            <ChipList>
              <Chip active={reach === "all"} onClick={() => setReach("all")}>
                All
              </Chip>
              {ORG_REACH.map((r) => (
                <Chip key={r.id} active={reach === r.id} onClick={() => setReach(r.id)}>
                  {r.label}
                </Chip>
              ))}
            </ChipList>
          </FilterRow>

          <FilterRow label="Location">
            <LocationControl hasLocation={hasLocation} location={location} scope={scope} onScope={setScope} />
          </FilterRow>
        </div>
      )}

      {/* ── Results */}
      {isLoading && orgs.length === 0 ? (
        <ResultsSkeleton />
      ) : orgs.length === 0 ? (
        <EmptyResults query={query} />
      ) : (
        <div className="flex flex-col gap-8">
          {grouped.map(([bucket, list], i) => (
            <section
              key={bucket}
              className="animate-in fade-in slide-in-from-bottom-3 duration-500"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
            >
              <SectionHeader bucket={bucket} />
              {RAIL_BUCKETS.has(bucket) ? (
                <div className={cn("-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0", NO_SCROLLBAR)}>
                  {list.map((org) =>
                    bucket === "featured" ? (
                      <FeaturedCard key={org.id} org={org} />
                    ) : (
                      <SubscriptionCard key={org.id} org={org} />
                    ),
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {list.map((org) => (
                    <MinistryRow key={org.id} org={org} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function SectionHeader({ bucket }: { bucket: DiscoverBucket }) {
  const meta = BUCKET_META[bucket]
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        {bucket === "featured" && <Sparkles className="size-4 text-primary" />}
        {meta.label}
      </h2>
      {meta.hint && <span className="shrink-0 text-xs text-muted-foreground">{meta.hint}</span>}
    </div>
  )
}

/** Renders an org's logo as artwork, falling back to its colour + initials. */
function Artwork({
  org,
  className,
  textClassName,
}: {
  org: DiscoverOrganizationView
  className?: string
  textClassName?: string
}) {
  if (org.logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={org.logo || "/placeholder.svg"}
        alt=""
        className={cn("size-full object-cover transition-transform duration-500", className)}
      />
    )
  }
  return (
    <div className={cn("flex size-full items-center justify-center font-bold text-white/90", org.color, textClassName)}>
      {org.initials}
    </div>
  )
}

/** Primary media-style discovery row used for nearby / more-ministries lists. */
function MinistryRow({ org }: { org: DiscoverOrganizationView }) {
  return (
    <article className="group relative flex items-start gap-3.5 rounded-2xl p-2.5 transition-colors duration-200 hover:bg-white/[0.03]">
      <Link href={`/org/${org.handle}`} aria-label={org.name} className="shrink-0">
        <div className="relative size-16 overflow-hidden rounded-2xl shadow-soft ring-1 ring-white/[0.06] transition-transform duration-300 group-hover:-translate-y-0.5">
          <Artwork org={org} className="group-hover:scale-105" textClassName="text-lg" />
        </div>
      </Link>

      <div className="min-w-0 flex-1">
        <Link href={`/org/${org.handle}`} className="block">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-semibold leading-tight">{org.name}</p>
            {org.verified && <VerifiedBadge size="sm" className="shrink-0" />}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {org.categoryLabel}
            {" · "}
            {org.reachLabel}
            {org.locationLabel ? ` · ${org.locationLabel}` : ""}
          </p>
        </Link>
        {org.description && (
          <p className="mt-1.5 line-clamp-2 text-pretty text-sm leading-relaxed text-muted-foreground">
            {org.description}
          </p>
        )}
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {org.subscriberCount.toLocaleString()} {org.subscriberCount === 1 ? "subscriber" : "subscribers"}
          </span>
          {org.isOwner ? (
            <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              Your ministry
            </span>
          ) : (
            <div className="w-[132px] shrink-0">
              <OrgSubscribeButton
                organizationId={org.id}
                initialSubscribed={org.isSubscribed}
                initialNotify={org.notify}
                showNotify={false}
                compact
              />
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

/** Rich, streaming-style artwork card for the Featured rail. */
function FeaturedCard({ org }: { org: DiscoverOrganizationView }) {
  return (
    <article className="group relative w-[220px] shrink-0 snap-start overflow-hidden rounded-3xl shadow-elevated ring-1 ring-white/[0.06]">
      <div className="relative aspect-[3/4]">
        <Artwork org={org} className="group-hover:scale-105" textClassName="text-5xl" />
        {/* Dark scrim so the overlaid text stays legible over any artwork. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />

        {/* Full-card tap target sits beneath the interactive controls. */}
        <Link href={`/org/${org.handle}`} aria-label={org.name} className="absolute inset-0 z-0" />

        {org.verified && (
          <div className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-1 backdrop-blur-md">
            <VerifiedBadge size="md" />
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 p-3.5">
          <div>
            <p className="line-clamp-2 font-display text-base font-bold leading-tight tracking-tight text-white text-balance">
              {org.name}
            </p>
            <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-wider text-white/70">
              {org.categoryLabel}
              {org.onlineOnly ? " · Online" : org.locationLabel ? ` · ${org.locationLabel}` : ""}
            </p>
            <p className="mt-1 text-[11px] text-white/60">
              {org.subscriberCount.toLocaleString()} {org.subscriberCount === 1 ? "subscriber" : "subscribers"}
            </p>
          </div>
          {!org.isOwner && (
            <div className="pointer-events-auto">
              <OrgSubscribeButton
                organizationId={org.id}
                initialSubscribed={org.isSubscribed}
                initialNotify={org.notify}
                showNotify={false}
                compact
              />
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

/** Compact square-artwork card for the Your subscriptions rail. */
function SubscriptionCard({ org }: { org: DiscoverOrganizationView }) {
  return (
    <article className="group w-[150px] shrink-0 snap-start">
      <Link href={`/org/${org.handle}`} aria-label={org.name} className="block">
        <div className="relative aspect-square overflow-hidden rounded-2xl shadow-soft ring-1 ring-white/[0.06] transition-transform duration-300 group-hover:-translate-y-0.5">
          <Artwork org={org} className="group-hover:scale-105" textClassName="text-3xl" />
        </div>
        <div className="mt-2.5">
          <div className="flex items-center gap-1">
            <p className="truncate text-sm font-semibold leading-tight">{org.name}</p>
            {org.verified && <VerifiedBadge size="sm" className="shrink-0" />}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{org.categoryLabel}</p>
        </div>
      </Link>
      {!org.isOwner && (
        <div className="mt-2.5">
          <OrgSubscribeButton
            organizationId={org.id}
            initialSubscribed={org.isSubscribed}
            initialNotify={org.notify}
            showNotify={false}
            compact
          />
        </div>
      )}
    </article>
  )
}

function LocationControl({
  hasLocation,
  location,
  scope,
  onScope,
}: {
  hasLocation: boolean
  location: { country: string | null; city: string | null; region: string | null }
  scope: "all" | "nearby"
  onScope: (v: "all" | "nearby") => void
}) {
  const [editing, setEditing] = useState(false)
  const [city, setCity] = useState(location.city ?? "")
  const [country, setCountry] = useState(location.country ?? "")
  const [saved, setSaved] = useState(hasLocation)
  const [pending, startTransition] = useTransition()

  const label = [location.city, location.country].filter(Boolean).join(", ")

  function save() {
    startTransition(async () => {
      await updateMyLocation({ city, country })
      setSaved(!!(city.trim() || country.trim()))
      setEditing(false)
    })
  }

  if (editing || (!saved && !hasLocation)) {
    return (
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
            className="h-9"
            aria-label="Your city"
          />
          <Input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="Country"
            className="h-9"
            aria-label="Your country"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={save} disabled={pending} className="h-8 rounded-full">
            {pending ? "Saving..." : "Save location"}
          </Button>
          {(saved || hasLocation) && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <MapPin className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-muted-foreground">{label || "No location set"}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="ml-auto shrink-0 text-xs font-medium text-primary hover:underline"
        >
          Change
        </button>
      </div>
      <ChipList>
        <Chip active={scope === "all"} onClick={() => onScope("all")}>
          Everywhere
        </Chip>
        <Chip active={scope === "nearby"} onClick={() => onScope("nearby")}>
          Near me
        </Chip>
      </ChipList>
    </div>
  )
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function ChipList({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95",
        active
          ? "bg-primary text-primary-foreground shadow-soft"
          : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.07] hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      {/* Rail skeleton */}
      <div>
        <div className="mb-3 h-5 w-40 animate-pulse rounded bg-white/[0.06]" />
        <div className="-mx-4 flex gap-3 overflow-hidden px-4 sm:mx-0 sm:px-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-[150px] shrink-0">
              <div className="aspect-square animate-pulse rounded-2xl bg-white/[0.05]" />
              <div className="mt-2.5 h-4 w-3/4 animate-pulse rounded bg-white/[0.05]" />
              <div className="mt-2 h-8 w-full animate-pulse rounded-full bg-white/[0.05]" />
            </div>
          ))}
        </div>
      </div>
      {/* List skeleton */}
      <div>
        <div className="mb-3 h-5 w-32 animate-pulse rounded bg-white/[0.06]" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3.5 p-2.5">
              <div className="size-16 shrink-0 animate-pulse rounded-2xl bg-white/[0.05]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/2 animate-pulse rounded bg-white/[0.05]" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-white/[0.05]" />
                <div className="h-8 w-32 animate-pulse rounded-full bg-white/[0.05]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EmptyResults({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <span className="relative flex size-16 items-center justify-center rounded-3xl bg-card/70 text-muted-foreground shadow-elevated ring-1 ring-white/[0.06]">
        <span className="absolute inset-0 -z-0 rounded-3xl bg-primary/10 blur-xl" />
        <Compass className="relative size-7" />
      </span>
      <div className="space-y-1.5">
        <p className="text-base font-semibold">Nothing found</p>
        <p className="mx-auto max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
          {query
            ? `Nothing matched “${query}”. Try a broader search or clear your filters.`
            : "Try broadening your filters to discover more ministries."}
        </p>
      </div>
    </div>
  )
}
