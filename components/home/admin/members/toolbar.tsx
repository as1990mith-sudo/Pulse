"use client"

import { ArrowUpDown, Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  ACTIVITY_OPTIONS,
  GENDER_OPTIONS,
  JOINED_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  countActiveFilters,
  type MemberDirectoryQuery,
  type MemberFilters,
  type MemberSort,
} from "@/lib/home/members"
import { Popover } from "./shared"
import { ExportMenu } from "./export-menu"

export function Toolbar({
  handle,
  query,
  searchValue,
  onSearchChange,
  onSort,
  onFilters,
  onClearFilters,
}: {
  handle: string
  query: MemberDirectoryQuery
  searchValue: string
  onSearchChange: (v: string) => void
  onSort: (s: MemberSort) => void
  onFilters: (f: MemberFilters) => void
  onClearFilters: () => void
}) {
  const filterCount = countActiveFilters(query.filters)
  const sortLabel = SORT_OPTIONS.find((s) => s.id === query.sort)?.label ?? "Sort"

  const setFilter = <K extends keyof MemberFilters>(key: K, value: MemberFilters[K]) =>
    onFilters({ ...query.filters, [key]: value })

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            inputMode="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search members…"
            className="h-9 w-full rounded-xl border border-border/60 bg-card/50 pl-9 pr-3 text-sm backdrop-blur placeholder:text-muted-foreground/70 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--home-accent)]"
            aria-label="Search members"
          />
        </div>

        {/* Filter */}
        <Popover
          title="Filter members"
          button={() => (
            <span
              className={cn(
                "tap-scale relative inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium backdrop-blur transition-colors",
                filterCount > 0
                  ? "border-[var(--home-accent)]/50 text-foreground"
                  : "border-border/60 bg-card/50 text-muted-foreground hover:text-foreground",
              )}
            >
              <SlidersHorizontal className="size-3.5" />
              <span className="hidden sm:inline">Filter</span>
              {filterCount > 0 && (
                <span
                  className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
                  style={{ backgroundColor: "var(--home-accent)" }}
                >
                  {filterCount}
                </span>
              )}
            </span>
          )}
        >
          {() => (
            <div className="max-h-[70dvh] overflow-y-auto p-3 sm:max-h-none">
              <FilterGroup label="Status">
                {STATUS_OPTIONS.map((o) => (
                  <Chip key={o.id} active={query.filters.status === o.id} onClick={() => setFilter("status", o.id)}>
                    {o.label}
                  </Chip>
                ))}
              </FilterGroup>
              <FilterGroup label="Gender">
                {GENDER_OPTIONS.map((o) => (
                  <Chip key={o.id} active={query.filters.gender === o.id} onClick={() => setFilter("gender", o.id)}>
                    {o.label}
                  </Chip>
                ))}
              </FilterGroup>
              <FilterGroup label="Activity">
                {ACTIVITY_OPTIONS.map((o) => (
                  <Chip key={o.id} active={query.filters.activity === o.id} onClick={() => setFilter("activity", o.id)}>
                    {o.label}
                  </Chip>
                ))}
              </FilterGroup>
              <FilterGroup label="Joined">
                {JOINED_OPTIONS.map((o) => (
                  <Chip key={o.id} active={query.filters.joined === o.id} onClick={() => setFilter("joined", o.id)}>
                    {o.label}
                  </Chip>
                ))}
              </FilterGroup>
              {filterCount > 0 && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="tap-scale mt-1 w-full rounded-xl border border-border/60 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </Popover>

        {/* Sort */}
        <Popover
          title="Sort by"
          panelClassName="sm:w-56"
          button={() => (
            <span className="tap-scale inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-card/50 px-2.5 text-xs font-medium text-muted-foreground backdrop-blur transition-colors hover:text-foreground">
              <ArrowUpDown className="size-3.5" />
              <span className="hidden max-w-[7rem] truncate sm:inline">{sortLabel}</span>
              <ChevronDown className="size-3.5 opacity-60" />
            </span>
          )}
        >
          {(close) => (
            <div className="p-1.5">
              {SORT_OPTIONS.map((o) => {
                const active = query.sort === o.id
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      onSort(o.id)
                      close()
                    }}
                    className={cn(
                      "tap-scale flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-foreground/[0.05]",
                      active && "font-medium",
                    )}
                  >
                    {o.label}
                    {active && <Check className="size-4" style={{ color: "var(--home-accent)" }} />}
                  </button>
                )
              })}
            </div>
          )}
        </Popover>

        <ExportMenu handle={handle} query={query} />
      </div>

      <ActiveChips filters={query.filters} onFilters={onFilters} onClearFilters={onClearFilters} />
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-1">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "tap-scale rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "border-transparent text-white" : "border-border/60 text-muted-foreground hover:text-foreground",
      )}
      style={active ? { backgroundColor: "var(--home-accent)" } : undefined}
    >
      {children}
    </button>
  )
}

const CHIP_LABELS: Record<keyof MemberFilters, (v: string) => string> = {
  status: (v) => STATUS_OPTIONS.find((o) => o.id === v)?.label ?? v,
  gender: (v) => GENDER_OPTIONS.find((o) => o.id === v)?.label ?? v,
  activity: (v) => ACTIVITY_OPTIONS.find((o) => o.id === v)?.label ?? v,
  joined: (v) => JOINED_OPTIONS.find((o) => o.id === v)?.label ?? v,
}

function ActiveChips({
  filters,
  onFilters,
  onClearFilters,
}: {
  filters: MemberFilters
  onFilters: (f: MemberFilters) => void
  onClearFilters: () => void
}) {
  const active = (Object.keys(filters) as (keyof MemberFilters)[]).filter((k) => filters[k] !== "all")
  if (active.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {active.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onFilters({ ...filters, [k]: "all" })}
          className="tap-scale inline-flex items-center gap-1 rounded-lg bg-foreground/[0.06] py-1 pl-2.5 pr-1.5 text-[11px] font-medium transition-colors hover:bg-foreground/[0.1]"
        >
          {CHIP_LABELS[k](filters[k])}
          <X className="size-3 text-muted-foreground" />
        </button>
      ))}
      {active.length > 1 && (
        <button
          type="button"
          onClick={onClearFilters}
          className="tap-scale rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Clear all
        </button>
      )}
    </div>
  )
}
