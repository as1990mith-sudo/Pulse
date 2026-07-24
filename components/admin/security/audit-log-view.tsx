"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { Search, ShieldAlert, ShieldCheck, ScrollText } from "lucide-react"
import { PageHeader, StatCard, StatusBadge, EmptyState, Spinner } from "@/components/admin/kit"
import { Input } from "@/components/ui/input"
import { fetchAuditLogs } from "@/app/actions/admin-security"
import type { AuditLogRow } from "@/lib/admin/security"

type Stats = { totalAudit: number; failures24h: number }

function relativeTime(iso: string) {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function formatAction(action: string) {
  return action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export function AuditLogView({
  initialRows,
  total,
  stats,
}: {
  initialRows: AuditLogRow[]
  total: number
  stats: Stats
}) {
  const [q, setQ] = useState("")
  const [debounced, setDebounced] = useState("")
  const [result, setResult] = useState<"all" | "success" | "failure">("all")

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const { data, isLoading } = useSWR(
    ["audit", debounced, result],
    () => fetchAuditLogs({ q: debounced, result }, 0),
    { fallbackData: { rows: initialRows, total }, revalidateOnFocus: false, keepPreviousData: true },
  )
  const rows = data?.rows ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="A permanent, tamper-evident record of every administrative action."
        icon={ScrollText}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard icon={ScrollText} label="Total events" value={stats.totalAudit} />
        <StatCard icon={ShieldAlert} label="Failures (24h)" value={stats.failures24h} accent={stats.failures24h > 0 ? "warning" : undefined} />
        <StatCard icon={ShieldCheck} label="Showing" value={data?.total ?? total} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by action, target type or id…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-border/70 p-1">
          {(["all", "success", "failure"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setResult(r)}
              className={`rounded-md px-3 py-1.5 text-sm capitalize transition-colors ${
                result === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {isLoading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit events" description="Administrative actions will be recorded here." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Admin</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Target</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">IP</th>
                <th className="px-4 py-3 font-medium">Result</th>
                <th className="px-4 py-3 text-right font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">{formatAction(r.action)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.adminName ?? r.adminId}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {r.targetType ? (
                      <span>
                        {r.targetType}
                        {r.targetId ? <span className="text-muted-foreground/60"> · {r.targetId.slice(0, 12)}</span> : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground lg:table-cell">
                    {r.ipAddress ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={r.result === "failure" ? "danger" : "success"}>{r.result}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{relativeTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
