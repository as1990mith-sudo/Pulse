"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { Check, ChevronRight, Building2, Plus, Loader2 } from "lucide-react"
import { getMyHomeMemberships, setActiveHome } from "@/app/actions/home"
import { isHomeAdminRole } from "@/lib/home/roles"
import { cn } from "@/lib/utils"

/**
 * Full-page "My Homes" view (opened from the drawer). Lists every Home the
 * member belongs to and lets them switch the active organisation context, then
 * offers the "Join another Home" and "Set up a new Home" actions. This replaces
 * the old inline drawer section so the options are seen cleanly on their own
 * page. Admin management is intentionally not here — admins manage a Home from
 * its organisation profile.
 */
export function MyHomesView() {
  const router = useRouter()
  const { data, mutate, isLoading } = useSWR("my-homes-page", () => getMyHomeMemberships(), {
    revalidateOnFocus: false,
  })
  const homes = data ?? []
  const [switching, setSwitching] = useState<string | null>(null)

  // Switch the active Home context. The interface stays identical — only the
  // organisation's data changes — so we land back at the root of the same UI.
  async function handleSwitch(handle: string, isActive: boolean) {
    if (isActive) {
      router.push("/")
      return
    }
    setSwitching(handle)
    await setActiveHome(handle)
    await mutate()
    router.push("/")
    router.refresh()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {homes.length > 0 && (
        <section>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Your Homes
          </p>
          <div className="flex flex-col gap-2">
            {homes.map((h) => {
              const roleLabel = isHomeAdminRole(h.role) ? "Admin" : "Member"
              const busy = switching === h.handle
              return (
                <button
                  key={h.handle}
                  type="button"
                  onClick={() => handleSwitch(h.handle, h.isActive)}
                  disabled={!!switching}
                  className={cn(
                    "group flex min-h-[68px] w-full items-center gap-4 rounded-2xl border bg-card px-4 text-left transition-colors",
                    h.isActive ? "border-primary/60" : "border-border hover:bg-secondary/50",
                    switching && !busy && "opacity-50",
                  )}
                >
                  <span
                    className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-base font-bold text-white"
                    style={{ backgroundColor: h.accent }}
                  >
                    {h.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.logo || "/placeholder.svg"} alt="" className="size-full object-cover" />
                    ) : (
                      h.initials
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-foreground">{h.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {h.isActive ? `${roleLabel} · Current Home` : roleLabel}
                      {typeof h.memberCount === "number" ? ` · ${h.memberCount} members` : ""}
                    </span>
                  </span>
                  {busy ? (
                    <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
                  ) : h.isActive ? (
                    <Check className="size-5 shrink-0 text-primary" />
                  ) : (
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground/60" />
                  )}
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {homes.length > 0 ? "Add another" : "Get started"}
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href="/home/join"
            className="group flex min-h-[68px] items-center gap-4 rounded-2xl border border-border bg-card px-4 transition-colors hover:bg-secondary/50"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
              <Plus className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-foreground">Join another Home</span>
              <span className="block truncate text-sm text-muted-foreground">
                Enter an organisation&apos;s Home key to join.
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground/60" />
          </Link>

          <Link
            href="/sign-up/home"
            className="group flex min-h-[68px] items-center gap-4 rounded-2xl border border-border bg-card px-4 transition-colors hover:bg-secondary/50"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
              <Building2 className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-foreground">Set up a new Home</span>
              <span className="block truncate text-sm text-muted-foreground">
                Create a Home for your church, charity or organisation.
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground/60" />
          </Link>
        </div>
      </section>
    </div>
  )
}
