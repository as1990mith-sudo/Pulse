"use client"

import { History, Monitor, Smartphone } from "lucide-react"
import { PageHeader, StatusBadge, EmptyState } from "@/components/admin/kit"
import type { LoginRow } from "@/lib/admin/security"

function device(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: "Unknown device", mobile: false }
  const mobile = /mobile|iphone|android/i.test(ua)
  let browser = "Browser"
  if (/edg/i.test(ua)) browser = "Edge"
  else if (/chrome/i.test(ua)) browser = "Chrome"
  else if (/safari/i.test(ua)) browser = "Safari"
  else if (/firefox/i.test(ua)) browser = "Firefox"
  let os = ""
  if (/windows/i.test(ua)) os = "Windows"
  else if (/mac os|macintosh/i.test(ua)) os = "macOS"
  else if (/iphone|ipad|ios/i.test(ua)) os = "iOS"
  else if (/android/i.test(ua)) os = "Android"
  else if (/linux/i.test(ua)) os = "Linux"
  return { label: os ? `${browser} · ${os}` : browser, mobile }
}

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function LoginHistoryView({ rows }: { rows: LoginRow[] }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Login History"
        description="Every sign-in across the platform, with device and network details."
        icon={History}
      />

      {rows.length === 0 ? (
        <EmptyState icon={History} title="No sign-ins yet" description="Login records will appear here." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Device</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">IP</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Signed in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((r) => {
                const d = device(r.userAgent)
                return (
                  <tr key={r.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{r.userName ?? "Unknown"}</div>
                      <div className="text-xs text-muted-foreground">{r.userEmail ?? r.userId}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        {d.mobile ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                        {d.label}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground lg:table-cell">
                      {r.ipAddress ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={r.active ? "success" : "neutral"}>{r.active ? "active" : "expired"}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{when(r.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
