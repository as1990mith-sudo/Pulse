"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Calendar, Home, MessagesSquare, Radio, Rss, type LucideIcon } from "lucide-react"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

type Item = { key: string; label: string; icon: LucideIcon; sub: string }

// The five primary Home surfaces on mobile. Rooms + Notifications + Profile are
// reachable from the dashboard and top bar so the bar stays uncluttered.
const ITEMS: Item[] = [
  { key: "", label: "Home", icon: Home, sub: "" },
  { key: "feed", label: "Feed", icon: Rss, sub: "feed" },
  { key: "community", label: "Community", icon: MessagesSquare, sub: "community" },
  { key: "events", label: "Events", icon: Calendar, sub: "events" },
  { key: "live", label: "Live", icon: Radio, sub: "live" },
]

/** Org-branded bottom navigation shown inside a Home on mobile. */
export function HomeBottomNav({ handle, accent }: { handle: string; accent: string }) {
  const pathname = usePathname()
  const base = `/home/${handle}`

  function isActive(sub: string): boolean {
    if (sub === "") return pathname === base
    return pathname === `${base}/${sub}` || pathname.startsWith(`${base}/${sub}/`)
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] md:hidden">
      <nav
        aria-label="Home"
        className="pointer-events-auto flex w-full items-stretch justify-around gap-1 rounded-2xl border border-border/50 bg-background/70 p-1.5 shadow-[0_6px_24px_rgba(0,0,0,0.18)] ring-1 ring-white/5 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55"
      >
        {ITEMS.map((item) => {
          const active = isActive(item.sub)
          const Icon = item.icon
          return (
            <Link
              key={item.key || "home"}
              href={item.sub ? `${base}/${item.sub}` : base}
              onClick={() => haptic("select")}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 outline-none transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              style={active ? { color: accent } : undefined}
            >
              <Icon
                className={cn("size-[22px] shrink-0 transition-transform duration-300", active && "scale-110")}
                strokeWidth={active ? 2.4 : 2}
              />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
