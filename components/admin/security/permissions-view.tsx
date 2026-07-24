"use client"

import { Fragment, useMemo } from "react"
import { Check, Minus, ShieldCheck } from "lucide-react"
import { PageHeader } from "@/components/admin/kit"
import { ADMIN_ROLES, PERMISSION_META, roleHasPermission, type Permission } from "@/lib/rbac"

export function PermissionsView() {
  // Group permissions by their functional area for a readable matrix.
  const groups = useMemo(() => {
    const map = new Map<string, Permission[]>()
    for (const perm of Object.keys(PERMISSION_META) as Permission[]) {
      const g = PERMISSION_META[perm].group
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(perm)
    }
    return Array.from(map.entries())
  }, [])

  const roles = ADMIN_ROLES

  return (
    <div className="space-y-6">
      <PageHeader
        title="Permissions"
        description="How each admin role maps to platform capabilities. Roles are assigned in Admin Roles."
        icon={ShieldCheck}
      />

      <div className="overflow-x-auto rounded-2xl border border-border/70">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 bg-muted/40 px-4 py-3 font-medium">Capability</th>
              {roles.map((role) => (
                <th key={role.id} className="px-3 py-3 text-center font-medium">
                  {role.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {groups.map(([group, perms]) => (
              <Fragment key={group}>
                <tr className="bg-muted/20">
                  <td
                    colSpan={roles.length + 1}
                    className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {group}
                  </td>
                </tr>
                {perms.map((perm) => (
                  <tr key={perm} className="transition-colors hover:bg-muted/30">
                    <td className="sticky left-0 z-10 bg-card px-4 py-3 font-medium text-foreground">
                      {PERMISSION_META[perm].label}
                    </td>
                    {roles.map((role) => (
                      <td key={role.id} className="px-3 py-3 text-center">
                        {roleHasPermission(role.id, perm) ? (
                          <Check className="mx-auto h-4 w-4 text-primary" aria-label="Granted" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" aria-label="Not granted" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
