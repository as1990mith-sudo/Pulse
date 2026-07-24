"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import {
  Search,
  ShieldCheck,
  BadgeCheck,
  Ban,
  Clock,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { PageHeader, StatusBadge, EmptyState } from "@/components/admin/kit"
import { UserProfileDrawer } from "./user-profile-drawer"
import { fetchUsers } from "@/app/actions/admin-users-read"
import type { AdminUserRow } from "@/lib/admin/users"

type Props = {
  initialRows: AdminUserRow[]
  total: number
  canModerate: boolean
  canManageRoles: boolean
}

const statusTone: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  active: "success",
  warned: "warning",
  suspended: "warning",
  banned: "danger",
}

export function UserManagement({ initialRows, total, canModerate, canManageRoles }: Props) {
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Debounce the search query and reset to the first page on every change.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(query)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const { data, isLoading } = useSWR(
    ["admin-users", debounced, page],
    () => fetchUsers(debounced, page),
    {
      fallbackData: debounced === "" && page === 0 ? { rows: initialRows, total } : undefined,
      keepPreviousData: true,
    },
  )

  const rows = data?.rows ?? []
  const totalCount = data?.total ?? total
  const pageSize = 20
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize))

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Search, review, and moderate every account on Frequency."
      />

      {/* Search bar */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
          aria-label="Search users"
        />
        {isLoading && (
          <Loader2 className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Results */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3 text-xs text-muted-foreground">
          <span>{totalCount.toLocaleString()} users</span>
          <span>
            Page {page + 1} of {pageCount}
          </span>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Search}
            title={debounced ? "No users found" : "No users yet"}
            description={debounced ? `Nothing matches “${debounced}”.` : "Users will appear here as they register."}
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((u) => (
              <li key={u.id}>
                <button
                  onClick={() => setSelectedId(u.id)}
                  className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-muted/40"
                >
                  <div className="relative">
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ backgroundColor: u.color }}
                    >
                      {u.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.image || "/placeholder.svg"} alt="" className="size-10 rounded-full object-cover" />
                      ) : (
                        u.initials
                      )}
                    </span>
                    {u.online && (
                      <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-emerald-500" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">{u.name}</span>
                      {u.verified && <BadgeCheck className="size-3.5 shrink-0 text-sky-400" />}
                      {u.role && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          <ShieldCheck className="size-3" />
                          {u.role.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    {u.warnings > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-500">
                        <AlertTriangle className="size-3.5" />
                        {u.warnings}
                      </span>
                    )}
                    {u.status === "banned" && <Ban className="size-4 text-red-500" />}
                    {u.status === "suspended" && <Clock className="size-4 text-amber-500" />}
                    <StatusBadge tone={statusTone[u.status] ?? "neutral"}>{u.status}</StatusBadge>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <UserProfileDrawer
        userId={selectedId}
        onClose={() => setSelectedId(null)}
        canModerate={canModerate}
        canManageRoles={canManageRoles}
      />
    </div>
  )
}
