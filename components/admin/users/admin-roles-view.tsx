"use client"

import { useState, useTransition } from "react"
import useSWR from "swr"
import { ShieldCheck, UserPlus, Trash2, Search } from "lucide-react"
import { toast } from "sonner"
import { PageHeader, StatCard, EmptyState, Avatar } from "@/components/admin/kit"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { fetchUsers } from "@/app/actions/admin-users-read"
import { setAdminRole } from "@/app/actions/admin-users"
import { ADMIN_ROLES, ROLE_META, type AdminRole } from "@/lib/rbac"
import type { AdminTeamRow } from "@/lib/admin/users"

// Roles an admin can assign here (super_admin is intentionally not assignable via UI).
const ASSIGNABLE: AdminRole[] = ADMIN_ROLES.map((r) => r.id).filter((r) => r !== "super_admin")

export function AdminRolesView({
  initialTeam,
  canManage,
  actorId,
}: {
  initialTeam: AdminTeamRow[]
  canManage: boolean
  actorId: string
}) {
  const [team, setTeam] = useState(initialTeam)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [q, setQ] = useState("")

  // Search for users to promote (only non-admins are shown as candidates).
  const { data: search } = useSWR(q.trim().length >= 2 ? ["promote-search", q] : null, () => fetchUsers(q.trim(), 0), {
    keepPreviousData: true,
  })
  const teamIds = new Set(team.map((t) => t.userId))
  const candidates = (search?.rows ?? []).filter((u) => !teamIds.has(u.id)).slice(0, 6)

  function changeRole(userId: string, role: AdminRole | null, name: string) {
    setBusy(userId)
    startTransition(async () => {
      try {
        await setAdminRole(userId, role)
        if (role === null) {
          setTeam((prev) => prev.filter((t) => t.userId !== userId))
          toast.success(`Removed ${name} from the admin team`)
        } else {
          setTeam((prev) => {
            const existing = prev.find((t) => t.userId === userId)
            if (existing) return prev.map((t) => (t.userId === userId ? { ...t, role } : t))
            const u = search?.rows.find((r) => r.id === userId)
            return [
              {
                userId,
                name: u?.name ?? name,
                email: u?.email ?? "",
                image: u?.image ?? null,
                initials: u?.initials ?? name.slice(0, 2).toUpperCase(),
                color: u?.color ?? "hsl(var(--primary))",
                role,
                createdAt: new Date().toISOString(),
              },
              ...prev,
            ]
          })
          toast.success(`${name} is now ${ROLE_META[role].label}`)
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not update role")
      } finally {
        setBusy(null)
      }
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Roles"
        description="Assign platform roles and manage who has access to the admin console."
        icon={ShieldCheck}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={ShieldCheck} label="Admin team" value={team.length} accent="primary" />
        <StatCard
          icon={ShieldCheck}
          label="Super admins"
          value={team.filter((t) => t.role === "super_admin").length}
        />
      </div>

      {canManage && (
        <div className="rounded-2xl border border-border/70 bg-card/70 p-5 shadow-soft backdrop-blur-xl">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <UserPlus className="h-4 w-4 text-primary" /> Grant admin access
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search members by name or email…"
              className="pl-9"
            />
          </div>
          {candidates.length > 0 && (
            <ul className="mt-3 space-y-2">
              {candidates.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} src={u.image} initials={u.initials} color={u.color} />
                    <div>
                      <div className="text-sm font-medium text-foreground">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                  </div>
                  <select
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                    defaultValue=""
                    disabled={pending && busy === u.id}
                    onChange={(e) => e.target.value && changeRole(u.id, e.target.value as AdminRole, u.name)}
                  >
                    <option value="" disabled>
                      Assign role…
                    </option>
                    {ASSIGNABLE.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_META[r].label}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {team.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No admins yet" description="Grant admin access to build your team." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Role</th>
                {canManage && <th className="px-4 py-3 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {team.map((m) => {
                const isSelf = m.userId === actorId
                const isSuper = m.role === "super_admin"
                return (
                  <tr key={m.userId} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.name} src={m.image} initials={m.initials} color={m.color} />
                        <div>
                          <div className="font-medium text-foreground">{m.name}</div>
                          <div className="text-xs text-muted-foreground">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {canManage && !isSuper && !isSelf ? (
                        <select
                          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                          value={m.role}
                          disabled={pending && busy === m.userId}
                          onChange={(e) => changeRole(m.userId, e.target.value as AdminRole, m.name)}
                        >
                          {ASSIGNABLE.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_META[r].label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-foreground">{ROLE_META[m.role].label}</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        {!isSuper && !isSelf ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={pending && busy === m.userId}
                            onClick={() => changeRole(m.userId, null, m.name)}
                          >
                            <Trash2 className="h-4 w-4" /> Remove
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">{isSelf ? "You" : "Protected"}</span>
                        )}
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
