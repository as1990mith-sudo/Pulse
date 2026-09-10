"use client"

import { cn } from "@/lib/utils"
import type { MemberSnapshot } from "@/lib/home/members"

// Compact, horizontally-scrollable membership snapshot. Data points separated by
// hairline dividers on a single glass surface — deliberately not a row of cards.
export function Snapshot({ snapshot }: { snapshot: MemberSnapshot }) {
  const points: { label: string; value: number; accent?: boolean; dot?: string }[] = [
    { label: "Members", value: snapshot.total },
    { label: "Active", value: snapshot.active, dot: "bg-emerald-400" },
    { label: "New", value: snapshot.new, dot: "bg-sky-400" },
    { label: "Inactive", value: snapshot.inactive, dot: "bg-muted-foreground/50" },
    { label: "Admins", value: snapshot.admins, accent: true },
  ]
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:px-0">
      <div className="flex min-w-max items-stretch divide-x divide-border/50 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-xl">
        {points.map((p) => (
          <div key={p.label} className="flex min-w-[5.5rem] flex-col gap-0.5 px-4 py-3 first:pl-5 last:pr-5">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {p.dot && <span className={cn("size-1.5 rounded-full", p.dot)} aria-hidden />}
              {p.label}
            </span>
            <span
              className="font-display text-xl font-semibold tabular-nums tracking-tight lg:text-2xl"
              style={p.accent ? { color: "var(--home-accent)" } : undefined}
            >
              {p.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
