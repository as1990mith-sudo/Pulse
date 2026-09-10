"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import * as XLSX from "xlsx"
import { ChevronRight, Download, Loader2, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  listEventRegistrations,
  type GenderFilter,
  type RegistrationCounts,
  type RegistrationFilter,
  type RegistrationRow,
} from "@/app/actions/event-admin"
import { EYEBROW, formatDay, genderLabel, MemberBadge } from "./shared"

const FILTERS: { key: RegistrationFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "members", label: "Members" },
  { key: "non_members", label: "Guests" },
]

const GENDER_FILTERS: { key: GenderFilter; label: string }[] = [
  { key: "all", label: "All gender" },
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
  { key: "other", label: "Other" },
]

/** Splits a full name so the export can offer separate first/last columns. */
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length <= 1) return { first: parts[0] ?? "", last: "" }
  return { first: parts[0], last: parts.slice(1).join(" ") }
}

/**
 * Builds and downloads a real .xlsx of the given registrations. Every row
 * carries Member Status and Gender exactly as snapshotted at registration —
 * this is a record of who REGISTERED, never who attended.
 */
function exportRegistrations(rows: RegistrationRow[], eventTitle: string) {
  const data = rows.map((r) => {
    const { first, last } = splitName(r.fullName)
    return {
      Name: r.fullName,
      "First Name": first,
      "Last Name": last,
      Email: r.email,
      Phone: r.phone ?? "",
      "Member Status": r.isMember ? "Member" : "Non-member",
      Gender: genderLabel(r.gender),
      "Registration Date": formatDay(r.createdAt),
    }
  })
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Registrants")
  const safe =
    eventTitle
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "event"
  XLSX.writeFile(wb, `Frequency-${safe}-registrants.xlsx`)
}

/**
 * The registrant list for one event, with search and filter applied
 * server-side. Each row links to that registrant's dedicated page rather than
 * expanding in place — a full-page transition, matching the members console.
 */
export function EventRegistrationList({
  handle,
  eventId,
  eventTitle,
}: {
  handle: string
  eventId: number
  eventTitle: string
}) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<RegistrationFilter>("all")
  const [gender, setGender] = useState<GenderFilter>("all")
  const [rows, setRows] = useState<RegistrationRow[]>([])
  const [counts, setCounts] = useState<RegistrationCounts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)

  // Guards against a slow earlier request overwriting a newer one's results,
  // which would show the wrong rows for what is currently typed.
  const reqId = useRef(0)

  const load = useCallback(
    async (q: string, f: RegistrationFilter, g: GenderFilter) => {
      const mine = ++reqId.current
      setLoading(true)
      setError(null)
      try {
        const res = await listEventRegistrations({ handle, announcementId: eventId, query: q, filter: f, gender: g })
        if (mine !== reqId.current) return
        setRows(res.rows)
        setCounts(res.counts)
      } catch (e) {
        if (mine !== reqId.current) return
        setError(e instanceof Error ? e.message : "Could not load registrations.")
      } finally {
        if (mine === reqId.current) setLoading(false)
      }
    },
    [handle, eventId],
  )

  // Debounced so typing a name does not fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => void load(query, filter, gender), query ? 250 : 0)
    return () => clearTimeout(t)
  }, [query, filter, gender, load])

  const filtersActive = filter !== "all" || gender !== "all" || query.trim().length > 0

  async function handleExport(scope: "all" | "filtered") {
    let data = rows
    if (scope === "all") {
      const res = await listEventRegistrations({ handle, announcementId: eventId })
      data = res.rows
    }
    exportRegistrations(data, eventTitle)
    setExportOpen(false)
  }

  return (
    <div>
      <div className="flex flex-col gap-3">
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search registrations for {eventTitle}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or mobile"
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2"
            style={{ ["--tw-ring-color" as string]: "var(--home-accent)" }}
          />
        </label>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter registrations">
          {FILTERS.map((f) => {
            const active = filter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                className={cn(
                  "tap-scale rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors",
                  active ? "text-white" : "border border-border/60 text-muted-foreground hover:bg-muted/60",
                )}
                style={active ? { backgroundColor: "var(--home-accent)", boxShadow: "0 0 14px -6px var(--home-accent)" } : undefined}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <label className="relative flex-1 sm:max-w-[10rem]">
            <span className="sr-only">Filter by gender</span>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as GenderFilter)}
              className="w-full appearance-none rounded-lg border border-border/60 bg-background py-1.5 pl-3 pr-8 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground outline-none focus-visible:ring-2"
              style={{ ["--tw-ring-color" as string]: "var(--home-accent)" }}
            >
              {GENDER_FILTERS.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
            <ChevronRight className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 rotate-90 text-muted-foreground" aria-hidden="true" />
          </label>

          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              aria-expanded={exportOpen}
              disabled={!counts || counts.total === 0}
              className="tap-scale inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-muted/60 disabled:opacity-50"
            >
              <Download className="size-3.5" aria-hidden="true" /> Export
            </button>
            {exportOpen ? (
              <ExportMenu
                total={counts?.total ?? 0}
                filtered={rows.length}
                filtersActive={filtersActive}
                onClose={() => setExportOpen(false)}
                onExport={handleExport}
              />
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="pt-4 text-sm text-destructive">
          {error}
        </p>
      ) : loading ? (
        <ul className="mt-4 divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/50 bg-card/50 backdrop-blur-xl">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3.5 w-40 animate-pulse rounded bg-foreground/[0.06]" />
                <div className="h-3 w-24 animate-pulse rounded bg-foreground/[0.06]" />
              </div>
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="pt-6 text-center text-sm text-muted-foreground">
          {filtersActive ? "Nobody matches those filters." : "No registrations yet."}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/50 bg-card/50 backdrop-blur-xl">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/org/${handle}/admin/event/${eventId}/registrant/${r.id}`}
                className="tap-scale flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-foreground/[0.04]"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{r.fullName}</span>
                    <MemberBadge isMember={r.isMember} />
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {r.isMember ? "Member" : "Non-member"} · {genderLabel(r.gender)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground/80">
                    {r.email}
                    {r.guests > 1 ? ` · party of ${r.guests}` : ""}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The export chooser: all registrants vs the current filtered view. Defaults to
 * "filtered" only when filters are actually narrowing the list, otherwise "all".
 */
function ExportMenu({
  total,
  filtered,
  filtersActive,
  onClose,
  onExport,
}: {
  total: number
  filtered: number
  filtersActive: boolean
  onClose: () => void
  onExport: (scope: "all" | "filtered") => void | Promise<void>
}) {
  const [scope, setScope] = useState<"all" | "filtered">(filtersActive ? "filtered" : "all")
  const [busy, setBusy] = useState(false)

  async function download() {
    setBusy(true)
    try {
      await onExport(scope)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Export registrants"
        className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-border bg-popover p-3 shadow-lg"
      >
        <p className={cn(EYEBROW, "text-muted-foreground")}>Export registrants</p>
        <div className="mt-2 flex flex-col gap-1.5">
          <ScopeOption checked={scope === "all"} onSelect={() => setScope("all")} label="All registrants" count={total} />
          <ScopeOption
            checked={scope === "filtered"}
            onSelect={() => setScope("filtered")}
            label="Current filtered results"
            count={filtered}
            disabled={!filtersActive}
          />
        </div>
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="tap-scale mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--home-accent)" }}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          Download spreadsheet
        </button>
      </div>
    </>
  )
}

function ScopeOption({
  checked,
  onSelect,
  label,
  count,
  disabled,
}: {
  checked: boolean
  onSelect: () => void
  label: string
  count: number
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors disabled:opacity-40",
        checked ? "border-[color:var(--home-accent)]/50 bg-[color:var(--home-accent)]/5" : "border-border hover:bg-muted/50",
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn(
            "grid size-3.5 place-items-center rounded-full border",
            checked ? "border-transparent" : "border-muted-foreground/50",
          )}
          style={checked ? { backgroundColor: "var(--home-accent)" } : undefined}
        >
          {checked ? <span className="size-1.5 rounded-full bg-white" /> : null}
        </span>
        <span className="text-foreground">{label}</span>
      </span>
      <span className="tabular-nums text-muted-foreground">{count}</span>
    </button>
  )
}
