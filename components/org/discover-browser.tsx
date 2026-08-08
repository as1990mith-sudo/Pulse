"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import useSWR from "swr"
import { MapPin, Search, SlidersHorizontal, X } from "lucide-react"
import {
  discoverOrganizations,
  updateMyLocation,
  type DiscoverBucket,
  type DiscoverOrganizationView,
  type DiscoverParams,
} from "@/app/actions/organizations"
import { ORG_CATEGORIES, ORG_REACH, type OrgCategory, type OrgReach } from "@/lib/org-types"
import { AvatarWithBadge } from "@/components/org/verified-badge"
import { OrgSubscribeButton } from "@/components/org/org-subscribe-button"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const BUCKET_META: Record<DiscoverBucket, { label: string; hint: string }> = {
  subscribed: { label: "Your subscriptions", hint: "Ministries you already follow" },
  nearby: { label: "Near you", hint: "Based on your location" },
  featured: { label: "Featured", hint: "Verified on Frequency" },
  new: { label: "More to explore", hint: "" },
}

const BUCKET_ORDER: DiscoverBucket[] = ["subscribed", "nearby", "featured", "new"]

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
  const { data, isLoading } = useSWR<DiscoverOrganizationView[]>(
    key,
    () => discoverOrganizations(params),
    { fallbackData: initial, keepPreviousData: true, revalidateOnFocus: false },
  )

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

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ministries, cities, categories"
            className="h-11 rounded-full pl-9 pr-9"
            aria-label="Search organisations"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
            "relative flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors",
            showFilters || activeFilterCount > 0
              ? "border-primary bg-primary/10 text-primary"
              : "border-border/60 text-muted-foreground hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="size-[18px]" />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="animate-in fade-in slide-in-from-top-1 flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 duration-200">
          <FilterRow label="Category">
            <ChipList>
              <Chip active={category === "all"} onClick={() => setCategory("all")}>
                All
              </Chip>
              {ORG_CATEGORIES.map((c) => (
                <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
                  {c.label}
                </Chip>
              ))}
            </ChipList>
          </FilterRow>

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
            <LocationControl
              hasLocation={hasLocation}
              location={location}
              scope={scope}
              onScope={setScope}
            />
          </FilterRow>
        </div>
      )}

      {/* Results */}
      {isLoading && orgs.length === 0 ? (
        <ResultsSkeleton />
      ) : orgs.length === 0 ? (
        <EmptyResults query={query} />
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map(([bucket, list]) => (
            <section key={bucket}>
              <div className="mb-2 flex items-baseline justify-between px-0.5">
                <h2 className="text-sm font-semibold uppercase tracking-wider">{BUCKET_META[bucket].label}</h2>
                {BUCKET_META[bucket].hint && (
                  <span className="text-xs text-muted-foreground">{BUCKET_META[bucket].hint}</span>
                )}
              </div>
              <div className="flex flex-col gap-3">
                {list.map((org) => (
                  <OrgDiscoverCard key={org.id} org={org} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function OrgDiscoverCard({ org }: { org: DiscoverOrganizationView }) {
  return (
    <article className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-4">
      <Link href={`/org/${org.handle}`} aria-label={org.name}>
        <AvatarWithBadge verified={org.verified} badgeSize="sm">
          <span
            className={cn(
              "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-base font-semibold",
              !org.logo && org.color,
            )}
          >
            {org.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logo || "/placeholder.svg"} alt="" className="size-full object-cover" />
            ) : (
              org.initials
            )}
          </span>
        </AvatarWithBadge>
      </Link>

      <div className="min-w-0 flex-1">
        <Link href={`/org/${org.handle}`} className="block">
          <p className="truncate font-semibold leading-tight">{org.name}</p>
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
        <div className="mt-2.5 flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {org.subscriberCount.toLocaleString()} {org.subscriberCount === 1 ? "subscriber" : "subscribers"}
          </span>
        </div>
        {!org.isOwner && (
          <div className="mt-2.5 max-w-[240px]">
            <OrgSubscribeButton
              organizationId={org.id}
              initialSubscribed={org.isSubscribed}
              initialNotify={org.notify}
              showNotify={false}
            />
          </div>
        )}
      </div>
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
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="h-9" aria-label="Your city" />
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
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-4">
          <div className="size-12 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-8 w-32 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyResults({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Search className="size-6" />
      </span>
      <p className="font-medium">No ministries found</p>
      <p className="max-w-sm text-pretty text-sm text-muted-foreground">
        {query
          ? `Nothing matched “${query}”. Try a different search or clear your filters.`
          : "Try adjusting your filters to see more organisations."}
      </p>
    </div>
  )
}
