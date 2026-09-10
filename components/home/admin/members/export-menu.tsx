"use client"

import { useState } from "react"
import { Download, Loader2, ListFilter, Users } from "lucide-react"
import * as XLSX from "xlsx"
import { getMembersForExport } from "@/app/actions/home-members"
import { countActiveFilters, DEFAULT_FILTERS, type MemberDirectoryQuery } from "@/lib/home/members"
import { Popover } from "./shared"

// Exports member data to a real .xlsx workbook, downloaded straight to the
// admin's device. "Export filtered" honours the live search + filters; "Export
// all" ignores them. The server action re-checks permission and only returns
// fields the caller is authorised to read.
export function ExportMenu({ handle, query }: { handle: string; query: MemberDirectoryQuery }) {
  const [busy, setBusy] = useState<null | "all" | "filtered">(null)
  const activeFilters = countActiveFilters(query.filters) + (query.search.trim() ? 1 : 0)

  async function run(scope: "all" | "filtered", close: () => void) {
    setBusy(scope)
    try {
      const q: MemberDirectoryQuery =
        scope === "all" ? { ...query, search: "", filters: { ...DEFAULT_FILTERS } } : query
      const data = await getMembersForExport(handle, q)
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Members")
      const today = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(wb, `Frequency-Home-Members-${today}.xlsx`)
      close()
    } catch {
      // Swallow — never surface a raw backend error to the admin.
    } finally {
      setBusy(null)
    }
  }

  return (
    <Popover
      title="Export members"
      button={() => (
        <span className="tap-scale inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-card/50 px-2.5 text-xs font-medium text-muted-foreground backdrop-blur transition-colors hover:text-foreground">
          <Download className="size-3.5" />
          <span className="hidden sm:inline">Export</span>
        </span>
      )}
    >
      {(close) => (
        <div className="p-1.5">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("filtered", close)}
            className="tap-scale flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-foreground/[0.05] disabled:opacity-60"
          >
            {busy === "filtered" ? (
              <Loader2 className="size-4 shrink-0 animate-spin" />
            ) : (
              <ListFilter className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="flex-1">
              <span className="block font-medium">Export filtered</span>
              <span className="block text-[11px] text-muted-foreground">
                {activeFilters > 0 ? `${activeFilters} active filter${activeFilters > 1 ? "s" : ""}` : "No filters applied"}
              </span>
            </span>
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("all", close)}
            className="tap-scale flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-foreground/[0.05] disabled:opacity-60"
          >
            {busy === "all" ? (
              <Loader2 className="size-4 shrink-0 animate-spin" />
            ) : (
              <Users className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="flex-1">
              <span className="block font-medium">Export all</span>
              <span className="block text-[11px] text-muted-foreground">Every member (.xlsx)</span>
            </span>
          </button>
        </div>
      )}
    </Popover>
  )
}
