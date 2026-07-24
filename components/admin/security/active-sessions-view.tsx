"use client"

import { useState, useTransition } from "react"
import { MonitorSmartphone, Monitor, Smartphone, ShieldX } from "lucide-react"
import { toast } from "sonner"
import { PageHeader, StatCard, EmptyState } from "@/components/admin/kit"
import { Button } from "@/components/ui/button"
import { revokeSession } from "@/app/actions/admin-security"
import type { ActiveSessionRow } from "@/lib/admin/security"

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

function expiresIn(iso: string) {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return "expired"
  const days = Math.floor(ms / 86400000)
  if (days >= 1) return `${days}d left`
  const hours = Math.floor(ms / 3600000)
  if (hours >= 1) return `${hours}h left`
  return `${Math.max(1, Math.floor(ms / 60000))}m left`
}

export function ActiveSessionsView({
  initialRows,
  canRevoke,
}: {
  initialRows: ActiveSessionRow[]
  canRevoke: boolean
}) {
  const [rows, setRows] = useState(initialRows)
  const [pending, startTransition] = useTransition()
  const [revoking, setRevoking] = useState<string | null>(null)

  function revoke(id: string) {
    setRevoking(id)
    startTransition(async () => {
      try {
        await revokeSession(id)
        setRows((prev) => prev.filter((r) => r.id !== id))
        toast.success("Session revoked")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not revoke session")
      } finally {
        setRevoking(null)
      }
    })
  }

  const uniqueUsers = new Set(rows.map((r) => r.userId)).size

  return (
    <div className="space-y-6">
      <PageHeader
        title="Active Sessions"
        description="Live sessions currently authenticated across Frequency. Revoke any to force sign-out."
        icon={MonitorSmartphone}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={MonitorSmartphone} label="Active sessions" value={rows.length} accent="primary" />
        <StatCard icon={Monitor} label="Signed-in members" value={uniqueUsers} />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={MonitorSmartphone} title="No active sessions" description="Authenticated sessions will appear here." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Device</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">IP</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                {canRevoke && <th className="px-4 py-3 text-right font-medium">Action</th>}
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
                    <td className="px-4 py-3 text-muted-foreground">{expiresIn(r.expiresAt)}</td>
                    {canRevoke && (
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={pending && revoking === r.id}
                          onClick={() => revoke(r.id)}
                        >
                          <ShieldX className="h-4 w-4" />
                          {pending && revoking === r.id ? "Revoking…" : "Revoke"}
                        </Button>
                      </td>
                    )}
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
