"use client"

import { useState, useTransition } from "react"
import Image from "next/image"
import { Loader2, Trash2, UserCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { approveMember, removeMember, updateMemberRole } from "@/app/actions/home"
import { HOME_ROLES, type HomeRole } from "@/lib/home/roles"

const ROLE_LABEL = Object.fromEntries(HOME_ROLES.map((r) => [r.id, r.label])) as Record<HomeRole, string>
import type { HomeMemberRow } from "@/lib/home/types"

export function MembersManager({
  handle,
  initialMembers,
  canManage,
}: {
  handle: string
  initialMembers: HomeMemberRow[]
  canManage: boolean
}) {
  const [members, setMembers] = useState(initialMembers)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const pending = members.filter((m) => m.status === "pending")
  const active = members.filter((m) => m.status === "active")

  function approve(id: string) {
    setPendingId(id)
    startTransition(async () => {
      await approveMember(handle, id)
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, status: "active" } : m)))
      setPendingId(null)
    })
  }

  function remove(id: string) {
    setPendingId(id)
    startTransition(async () => {
      await removeMember(handle, id)
      setMembers((prev) => prev.filter((m) => m.id !== id))
      setPendingId(null)
    })
  }

  function changeRole(id: string, role: HomeRole) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)))
    startTransition(() => updateMemberRole(handle, id, role))
  }

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">
            Pending approval <span className="text-muted-foreground">({pending.length})</span>
          </h3>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {pending.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-4">
                <MemberAvatar member={m} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => approve(m.id)}
                      disabled={pendingId === m.id}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      style={{ backgroundColor: "var(--home-accent)" }}
                    >
                      {pendingId === m.id ? <Loader2 className="size-3.5 animate-spin" /> : <UserCheck className="size-3.5" />}
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(m.id)}
                      disabled={pendingId === m.id}
                      className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-60"
                      aria-label="Decline"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-sm font-semibold">
          Members <span className="text-muted-foreground">({active.length})</span>
        </h3>
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {active.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 p-4">
              <MemberAvatar member={m} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name}
                  {m.isViewer && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              {canManage && m.role !== "owner" && !m.isViewer ? (
                <select
                  value={m.role}
                  onChange={(e) => changeRole(m.id, e.target.value as HomeRole)}
                  className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring [&>option]:bg-background"
                >
                  {HOME_ROLES.filter((r) => r.id !== "owner").map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    m.role === "owner" ? "text-white" : "bg-muted text-muted-foreground",
                  )}
                  style={m.role === "owner" ? { backgroundColor: "var(--home-accent)" } : undefined}
                >
                  {ROLE_LABEL[m.role]}
                </span>
              )}
              {canManage && m.role !== "owner" && !m.isViewer && (
                <button
                  type="button"
                  onClick={() => remove(m.id)}
                  disabled={pendingId === m.id}
                  className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-60"
                  aria-label={`Remove ${m.name}`}
                >
                  {pendingId === m.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function MemberAvatar({ member }: { member: HomeMemberRow }) {
  if (member.image) {
    return (
      <div className="relative size-10 shrink-0 overflow-hidden rounded-full">
        <Image src={member.image || "/placeholder.svg"} alt={member.name} fill className="object-cover" sizes="40px" />
      </div>
    )
  }
  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
      style={{ backgroundColor: member.color }}
    >
      {member.initials}
    </div>
  )
}
