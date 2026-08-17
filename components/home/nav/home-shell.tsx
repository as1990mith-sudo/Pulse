"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "motion/react"
import {
  Bell,
  Calendar,
  Home as HomeIcon,
  MessagesSquare,
  Radio,
  Rss,
  Settings2,
  Users2,
  type LucideIcon,
} from "lucide-react"
import type { HomeView } from "@/lib/home/types"
import { homeAccentStyle, normalizeHex, DEFAULT_HOME_ACCENT } from "@/lib/home/accent"
import { PoweredByFrequency } from "@/components/home/powered-by-frequency"
import { cn } from "@/lib/utils"
import { HomeBottomNav } from "./home-bottom-nav"
import { SpaceSwitcher, type SpaceLink } from "./space-switcher"

type NavItem = { key: string; label: string; icon: LucideIcon; sub: string }

const NAV: NavItem[] = [
  { key: "dashboard", label: "Home", icon: HomeIcon, sub: "" },
  { key: "feed", label: "Feed", icon: Rss, sub: "feed" },
  { key: "community", label: "Community", icon: MessagesSquare, sub: "community" },
  { key: "rooms", label: "Rooms", icon: Users2, sub: "rooms" },
  { key: "events", label: "Events", icon: Calendar, sub: "events" },
  { key: "live", label: "Live", icon: Radio, sub: "live" },
]

export type HomeViewer = {
  id: string
  name: string
  image: string | null
  initials: string
  roleLabel: string
}

/**
 * The org-branded chrome wrapping every private Home surface. Provides the
 * desktop sidebar, the mobile top bar + bottom nav, the space switcher, and the
 * accent-tinted context. Children render only their page content (no header /
 * main of their own) so the shell owns the layout.
 */
export function HomeShell({
  home,
  viewer,
  spaces,
  canManage,
  children,
}: {
  home: HomeView
  viewer: HomeViewer
  spaces: SpaceLink[]
  canManage: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const base = `/home/${home.handle}`
  const accent = normalizeHex(home.accentColor) ?? DEFAULT_HOME_ACCENT

  const current: SpaceLink = {
    handle: home.handle,
    name: home.name,
    logo: home.orgLogo,
    initials: home.orgInitials,
    accent,
  }

  function isActive(sub: string): boolean {
    if (sub === "") return pathname === base
    return pathname === `${base}/${sub}` || pathname.startsWith(`${base}/${sub}/`)
  }

  const notificationsActive = isActive("notifications")

  return (
    <div className="min-h-svh bg-background" style={homeAccentStyle(home)}>
      <div className="mx-auto flex w-full max-w-6xl">
        {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
        <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-border/60 px-3 py-4 md:flex">
          <SpaceSwitcher current={current} spaces={spaces} />

          <nav aria-label="Home" className="mt-4 flex flex-1 flex-col gap-1">
            {NAV.map((item) => {
              const active = isActive(item.sub)
              const Icon = item.icon
              return (
                <Link
                  key={item.key}
                  href={item.sub ? `${base}/${item.sub}` : base}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                  style={
                    active
                      ? { backgroundColor: "color-mix(in oklab, var(--home-accent) 14%, transparent)", color: accent }
                      : undefined
                  }
                >
                  <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.4 : 2} />
                  {item.label}
                </Link>
              )
            })}

            <Link
              href={`${base}/notifications`}
              aria-current={notificationsActive ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                notificationsActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
              style={
                notificationsActive
                  ? { backgroundColor: "color-mix(in oklab, var(--home-accent) 14%, transparent)", color: accent }
                  : undefined
              }
            >
              <Bell className="size-[18px] shrink-0" strokeWidth={notificationsActive ? 2.4 : 2} />
              Notifications
            </Link>

            {canManage && (
              <Link
                href={`/org/${home.handle}/admin`}
                className="group mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              >
                <Settings2 className="size-[18px] shrink-0" />
                Manage home
              </Link>
            )}
          </nav>

          {/* Member identity card — the single Frequency identity, shown with
              its contextual role inside this Home. */}
          <Link
            href={`/u/${viewer.id}`}
            className="mt-2 flex items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-3 py-2.5 transition-colors hover:bg-card"
          >
            <span
              className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: accent }}
            >
              {viewer.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={viewer.image || "/placeholder.svg"} alt="" className="size-full object-cover" />
              ) : (
                viewer.initials
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">{viewer.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {home.orgName} · {viewer.roleLabel}
              </span>
            </span>
          </Link>
          <div className="mt-2 px-2">
            <PoweredByFrequency />
          </div>
        </aside>

        {/* ── Main column ─────────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 px-4 py-2.5 backdrop-blur-xl md:hidden">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <SpaceSwitcher current={current} spaces={spaces} />
              </div>
              <Link
                href={`${base}/notifications`}
                aria-label="Notifications"
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full border border-border/60 transition-colors",
                  notificationsActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                style={notificationsActive ? { color: accent } : undefined}
              >
                <Bell className="size-5" />
              </Link>
            </div>
          </header>

          <motion.main
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="min-h-svh pb-28 md:pb-10"
          >
            {children}
          </motion.main>
        </div>
      </div>

      <HomeBottomNav handle={home.handle} accent={accent} />
    </div>
  )
}
