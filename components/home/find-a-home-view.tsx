"use client"

import { useDeferredValue, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { ChevronLeft, Compass, Loader2, Search, Users, X } from "lucide-react"
import { getDiscoverableHomes, type DiscoverHomeCard } from "@/app/actions/discovery"
import { cn } from "@/lib/utils"

/**
 * "Find a Home" — the discovery surface reached from My Homes → + → Find a Home.
 * Mobile-first: a sticky search field over a compact card directory. Search is
 * client-side over the full discoverable set (a single fetch), so typing filters
 * instantly with no round-trips or reloads — the perceived-performance win the
 * brief asks for. Only discoverable Homes are ever returned by the action, so
 * private Homes can never appear here or in the search results.
 */
export function FindAHomeView() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  // Defer filtering off the keystroke so the input never feels laggy while the
  // list re-renders underneath it.
  const deferredQuery = useDeferredValue(query)

  const { data, isLoading } = useSWR("discoverable-homes", () => getDiscoverableHomes(), {
    revalidateOnFocus: false,
  })
  const homes = data ?? []

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!q) return homes
    return homes.filter((h) => h.name.toLowerCase().includes(q))
  }, [homes, deferredQuery])

  return (
    <div className="flex flex-col">
      {/* Sticky header + search. Kept minimal per the brief — a title and a
          single premium search field, nothing more. */}
      <div className="sticky top-0 z-10 -mx-4 bg-background/80 px-4 pb-3 backdrop-blur-xl">
        <header className="relative flex h-12 items-center">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Back"
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-secondary/60 hover:text-foreground active:scale-90"
          >
            <ChevronLeft className="size-5" />
          </button>
          <h1 className="ml-1 text-base font-semibold tracking-tight text-foreground">Find a Home</h1>
        </header>

        <div className="relative mt-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Homes"
            aria-label="Search Homes by name"
            className="h-11 w-full rounded-2xl border border-border/70 bg-card/60 pl-10 pr-10 text-[15px] text-foreground shadow-sm outline-none backdrop-blur-xl transition-colors placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("")
                inputRef.current?.focus()
              }}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-secondary/60 hover:text-foreground active:scale-90"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <DirectorySkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState hasQuery={deferredQuery.trim().length > 0} />
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {filtered.map((home) => (
            <HomeCard key={home.handle} home={home} />
          ))}
        </div>
      )}
    </div>
  )
}

function HomeCard({ home }: { home: DiscoverHomeCard }) {
  const relationLabel =
    home.relation === "owner"
      ? "You own this"
      : home.relation === "member"
        ? "Member"
        : home.relation === "pending"
          ? "Requested"
          : home.joinPolicy === "auto"
            ? "Open to join"
            : "Approval needed"

  return (
    <Link
      href={`/org/${home.handle}`}
      className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-3 backdrop-blur-xl transition-all hover:border-border hover:bg-card active:scale-[0.98]"
      style={{ ["--home-accent" as string]: home.accent }}
    >
      {/* Identity: logo or generated monogram. */}
      {home.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={home.logo || "/placeholder.svg"}
          alt=""
          className="size-12 shrink-0 rounded-xl object-cover"
          crossOrigin="anonymous"
        />
      ) : (
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: home.color }}
          aria-hidden
        >
          {home.initials}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-semibold leading-tight text-foreground">
          {home.name}
        </span>
        <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">{home.categoryLabel}</span>
          {home.memberCount > 0 && (
            <>
              <span aria-hidden className="opacity-40">
                ·
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
                <Users className="size-3" />
                {home.memberCount}
              </span>
            </>
          )}
        </span>
      </span>

      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium",
          home.relation !== "none" && "bg-secondary/70 text-muted-foreground",
        )}
        style={
          home.relation === "none"
            ? {
                backgroundColor: "color-mix(in oklch, var(--home-accent) 14%, transparent)",
                color: "var(--home-accent)",
              }
            : undefined
        }
      >
        {relationLabel}
      </span>
    </Link>
  )
}

function DirectorySkeleton() {
  return (
    <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card/40 p-3">
          <div className="size-12 shrink-0 animate-pulse rounded-xl bg-secondary/70" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/3 animate-pulse rounded-full bg-secondary/70" />
            <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-secondary/50" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-secondary/60 text-muted-foreground">
        <Compass className="size-6" />
      </span>
      <p className="text-[15px] font-semibold text-foreground">No Homes found</p>
      <p className="max-w-[15rem] text-sm text-muted-foreground">
        {hasQuery ? "Try a different name." : "No discoverable Homes yet. Check back soon."}
      </p>
    </div>
  )
}
