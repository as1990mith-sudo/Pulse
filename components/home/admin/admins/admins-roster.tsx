import Image from "next/image"
import { ShieldCheck } from "lucide-react"
import type { HomeAdminRosterRow } from "@/app/actions/home-members"

/**
 * Read-only roster of the people who run a Home — reached from the ADMINS stat
 * card on the console overview. It deliberately shows only current admins and
 * their assigned roles (never the full membership), in the same visual language
 * as the Members command centre: a clean bordered list of avatar rows with a
 * role badge, elevated roles (owner / administrator) tinted with the Home accent.
 */
export function AdminsRoster({ admins }: { admins: HomeAdminRosterRow[] }) {
  if (admins.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 px-6 py-14 text-center">
        <ShieldCheck className="size-8 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">No admins yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Assign a role to a member to see them here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {admins.length} {admins.length === 1 ? "person helps" : "people help"} run this Home.
      </p>
      <ul className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
        {admins.map((a) => {
          const elevated = a.role === "owner" || a.role === "administrator"
          return (
            <li
              key={a.id}
              className="flex items-center gap-3 border-b border-border/40 px-4 py-3.5 last:border-b-0"
            >
              <span
                className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold text-white"
                style={{ backgroundColor: a.color }}
                aria-hidden={!!a.image}
              >
                {a.image ? (
                  <Image src={a.image || "/placeholder.svg"} alt={a.name} fill className="object-cover" sizes="44px" />
                ) : (
                  a.initials
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                  <span className="truncate">{a.name}</span>
                  {a.isViewer && (
                    <span className="shrink-0 rounded-full bg-secondary/70 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      You
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{a.email}</p>
              </div>

              <span
                className={
                  elevated
                    ? "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    : "inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary/60 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
                }
                style={
                  elevated
                    ? {
                        backgroundColor: "color-mix(in oklab, var(--home-accent) 16%, transparent)",
                        color: "var(--home-accent)",
                      }
                    : undefined
                }
              >
                {elevated && <ShieldCheck className="size-3" />}
                {a.roleLabel}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
