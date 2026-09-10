"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { getMembersDirectory } from "@/app/actions/home-members"
import {
  DEFAULT_FILTERS,
  MEMBER_TIMEFRAMES,
  type LeaderboardRanking,
  type MemberDirectoryQuery,
  type MemberDirectoryResult,
  type MemberFilters,
  type MemberSort,
  type MemberTimeframe,
} from "@/lib/home/members"
import { Segmented } from "./shared"
import { Snapshot } from "./snapshot"
import { Leaderboard } from "./leaderboard"
import { Toolbar } from "./toolbar"
import { Directory } from "./directory"
import { DetailDrawer } from "./detail-drawer"
import { MembersSkeleton } from "./skeletons"

const TIMEFRAME_OPTIONS = MEMBER_TIMEFRAMES.map((t) => ({ id: t.id, label: t.label }))

export function MembersCommandCentre({
  handle,
  initialQuery,
  initialData,
  canManage,
}: {
  handle: string
  initialQuery: MemberDirectoryQuery
  initialData: MemberDirectoryResult
  canManage: boolean
}) {
  const [query, setQuery] = useState<MemberDirectoryQuery>(initialQuery)
  const [searchInput, setSearchInput] = useState(initialQuery.search)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["home-members-directory", handle, query],
    () => getMembersDirectory(handle, query),
    { fallbackData: initialData, keepPreviousData: true },
  )

  // Debounce the search box into the query (and reset to page 1).
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery((q) => (q.search === searchInput ? q : { ...q, search: searchInput, page: 1 }))
    }, 250)
    return () => clearTimeout(id)
  }, [searchInput])

  const patch = (p: Partial<MemberDirectoryQuery>) => setQuery((q) => ({ ...q, ...p }))

  const result = data ?? initialData

  if (!result) return <MembersSkeleton />

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight lg:text-2xl">Members</h1>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {result.snapshot.total.toLocaleString()} members
          </p>
        </div>
        <Segmented
          ariaLabel="Activity timeframe"
          options={TIMEFRAME_OPTIONS}
          value={query.timeframe}
          onChange={(tf: MemberTimeframe) => patch({ timeframe: tf, page: 1 })}
        />
      </header>

      <Snapshot snapshot={result.snapshot} />

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-card/40 px-6 py-12 text-center">
          <p className="text-sm font-medium">Something went wrong</p>
          <button
            type="button"
            onClick={() => mutate()}
            className="tap-scale rounded-lg px-4 py-2 text-xs font-semibold text-white"
            style={{ backgroundColor: "var(--home-accent)" }}
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="order-2 space-y-3 xl:order-1">
            <Toolbar
              handle={handle}
              query={query}
              searchValue={searchInput}
              onSearchChange={setSearchInput}
              onSort={(s: MemberSort) => patch({ sort: s, page: 1 })}
              onFilters={(f: MemberFilters) => patch({ filters: f, page: 1 })}
              onClearFilters={() => patch({ filters: { ...DEFAULT_FILTERS }, page: 1 })}
            />
            <Directory
              rows={result.rows}
              total={result.total}
              page={result.page}
              pageSize={result.pageSize}
              loading={isLoading || isValidating}
              onSelect={setSelectedId}
              onPage={(p) => patch({ page: p })}
            />
          </div>

          <div className="order-1 xl:order-2">
            <div className="xl:sticky xl:top-20">
              <Leaderboard
                leaders={result.leaders}
                ranking={query.ranking}
                onRankingChange={(r: LeaderboardRanking) => patch({ ranking: r })}
                onSelect={setSelectedId}
              />
            </div>
          </div>
        </div>
      )}

      {selectedId && (
        <DetailDrawer
          key={selectedId}
          handle={handle}
          membershipId={selectedId}
          timeframe={query.timeframe}
          canManage={canManage}
          onClose={() => setSelectedId(null)}
          onChanged={() => mutate()}
        />
      )}
    </div>
  )
}
