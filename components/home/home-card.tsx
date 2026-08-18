"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Users } from "lucide-react"
import type { HomeView } from "@/lib/home/types"
import { homeAccentStyle } from "@/lib/home/accent"
import { setActiveHome } from "@/app/actions/home"

// Compact Home tile for the hub. Leads with the organisation's colour + logo.
// Selecting it makes this Home the active context and lands the member in the
// main Frequency interface (the Home IS the main interface) — never the old
// reduced /home/[handle] shell.
export function HomeCard({ home }: { home: HomeView }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function enter() {
    startTransition(async () => {
      await setActiveHome(home.handle)
      router.push("/")
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={enter}
      disabled={pending}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-70"
      style={homeAccentStyle(home)}
    >
      <div className="h-16 w-full" style={{ backgroundColor: "color-mix(in oklab, var(--home-accent) 22%, transparent)" }}>
        {home.orgCover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={home.orgCover || "/placeholder.svg"} alt="" className="size-full object-cover" />
        )}
      </div>
      <div className="flex items-start gap-3 px-4 pb-4">
        <div
          className="-mt-6 flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-base font-bold text-white shadow-sm ring-2 ring-card"
          style={{ backgroundColor: "var(--home-accent)" }}
        >
          {home.orgLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={home.orgLogo || "/placeholder.svg"} alt={home.orgName} className="size-full object-cover" />
          ) : (
            home.orgInitials
          )}
        </div>
        <div className="min-w-0 pt-2">
          <p className="truncate text-sm font-bold tracking-tight">{home.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3" /> {home.memberCount} {home.memberCount === 1 ? "member" : "members"}
          </p>
        </div>
      </div>
    </button>
  )
}
