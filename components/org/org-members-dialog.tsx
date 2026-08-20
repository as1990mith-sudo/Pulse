"use client"

import { useState } from "react"
import { Users } from "lucide-react"
import type { HomeRosterMember } from "@/lib/home/access"
import { homeRoleLabel } from "@/lib/home/roles"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/**
 * The org hero's "Members" affordance: a count that reads as a link and opens a
 * popup listing the organisation's Home members (owner first). Public-safe — it
 * shows names, avatars and roles only, never emails. Renders nothing when the
 * organisation has no members yet, so the hero stays clean for brand-new Homes.
 */
export function OrgMembersDialog({ members }: { members: HomeRosterMember[] }) {
  const [open, setOpen] = useState(false)
  if (members.length === 0) return null

  const count = members.length

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-1 rounded-full px-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`View ${count} ${count === 1 ? "member" : "members"}`}
      >
        <span className="font-semibold text-foreground">{formatCount(count)}</span>
        <span className="underline-offset-2 group-hover:underline">{count === 1 ? "member" : "members"}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-muted-foreground" />
              Members
              <span className="ml-auto text-sm font-normal tabular-nums text-muted-foreground">{count}</span>
            </DialogTitle>
          </DialogHeader>

          <ul className="max-h-[60vh] overflow-y-auto p-2">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted/50">
                {m.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image || "/placeholder.svg"} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: m.color }}
                  >
                    {m.initials}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{homeRoleLabel(m.role)}</span>
                </span>
                {m.isOwner && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    Owner
                  </span>
                )}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`
  return String(n)
}
