"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { ArrowLeft, ChevronRight, Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { HOME_ADMIN_GROUPS, HOME_ADMIN_SECTIONS, type HomeAdminSection } from "@/lib/home/admin-nav"
import { homeRoleHasPermission, type HomeRole } from "@/lib/home/roles"
import type { HomeView } from "@/lib/home/types"

/**
 * Chrome for the Frequency Home Admin Console — a compact, mobile-first command
 * surface. Mobile leads: a slim top bar for identity with a menu button placed
 * right before the Home logo that opens a grouped left side drawer holding every
 * destination. Desktop expands the same system into a compact grouped rail.
 * Sections gate on the viewer's Home role, so lower roles see a smaller console.
 * Nothing here is speculative — every destination is a live capability of the
 * product.
 */
export function HomeAdminShell({
  home,
  role,
  children,
}: {
  home: HomeView
  role: HomeRole
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const base = `/org/${home.handle}/admin`
  const accent = home.accentColor || home.orgColor
  const accentSoft = `color-mix(in oklab, ${accent} 14%, transparent)`
  const planFull = `Frequency Home ${home.plan === "premium_pro" ? "Premium" : "Basic"}`

  const visible = HOME_ADMIN_SECTIONS.filter((s) => !s.permission || homeRoleHasPermission(role, s.permission))
  const overview = visible.find((s) => s.slug === "overview")

  const hrefFor = (s: HomeAdminSection) => (s.slug === "overview" ? base : `${base}/${s.slug}`)
  const isActive = (s: HomeAdminSection) => {
    const href = hrefFor(s)
    return s.slug === "overview" ? pathname === base : pathname === href || pathname.startsWith(`${href}/`)
  }

  // Grouped, permission-filtered sections for the rail and the side menu.
  const grouped = HOME_ADMIN_GROUPS.map((g) => ({
    ...g,
    items: visible.filter((s) => s.group === g.id),
  })).filter((g) => g.items.length > 0)

  // Close the side menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  // Hide the global bottom nav while the mobile drawer is open so the footer
  // never shows through beneath it. Reuses the same `nav:suppress` beacon the
  // BottomNav listens for; always clears the flag on close/unmount.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("nav:suppress", { detail: menuOpen }))
    return () => {
      window.dispatchEvent(new CustomEvent("nav:suppress", { detail: false }))
    }
  }, [menuOpen])

  return (
    <div
      className="flex min-h-dvh bg-background text-foreground"
      style={{
        ["--home-accent" as string]: accent,
        // Ambient accent wash for the whole console. A background-image always
        // paints behind content, so this tints the surface without ever sitting
        // over text — two soft pools (top-centre + lower-left) keep it premium
        // rather than a flat tint.
        backgroundImage: `radial-gradient(90% 55% at 50% -8%, color-mix(in oklab, ${accent} 10%, transparent), transparent 60%), radial-gradient(70% 50% at 0% 100%, color-mix(in oklab, ${accent} 7%, transparent), transparent 55%)`,
        backgroundAttachment: "fixed",
      }}
    >
      {/* ── Desktop rail ─────────────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border/50 bg-card/40 backdrop-blur-xl lg:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <HomeLogo home={home} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-semibold leading-tight tracking-tight">{home.orgName}</p>
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Admin Console
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-2" data-scroll>
          {overview && <RailItem section={overview} href={hrefFor(overview)} active={isActive(overview)} accent={accent} />}
          {grouped.map((g) => (
            <div key={g.id} className="space-y-0.5">
              <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                {g.label}
              </p>
              {g.items.map((s) => (
                <RailItem key={s.slug} section={s} href={hrefFor(s)} active={isActive(s)} accent={accent} />
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-border/50 px-4 py-3">
          <Link
            href={`/org/${home.handle}`}
            className="tap-scale flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to organisation
          </Link>
        </div>
      </aside>

      {/* ── Main column ──────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/50 bg-background/70 px-4 py-2.5 backdrop-blur-xl lg:px-8 lg:py-3">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="tap-scale flex size-9 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-secondary/60 lg:hidden"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
          >
            <Menu className="size-5" />
          </button>
          <span className="lg:hidden">
            <HomeLogo home={home} size="sm" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] font-semibold tracking-tight lg:text-base">{home.name}</p>
          </div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ backgroundColor: accentSoft, color: accent }}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
            {planFull}
          </span>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 lg:px-8 lg:py-9 lg:pb-12">{children}</main>
      </div>

      {/* ── Mobile side menu (grouped full nav) ──────────────────────── */}
      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in lg:hidden"
        />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-hidden={!menuOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col border-r border-border/60 bg-card shadow-elevated transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:hidden",
          menuOpen ? "translate-x-0" : "-translate-x-full",
        )}
        data-scroll
      >
        <div className="flex items-center gap-2.5 border-b border-border/50 px-4 py-3.5 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
          <HomeLogo home={home} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-semibold leading-tight tracking-tight">{home.orgName}</p>
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Admin Console
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="tap-scale flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4" data-scroll>
          {overview && (
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-background/40">
              <DrawerItem section={overview} href={hrefFor(overview)} active={isActive(overview)} accent={accent} />
            </div>
          )}
          {grouped.map((g) => (
            <div key={g.id} className="space-y-1">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                {g.label}
              </p>
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-background/40">
                {g.items.map((s) => (
                  <DrawerItem key={s.slug} section={s} href={hrefFor(s)} active={isActive(s)} accent={accent} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border/50 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <Link
            href={`/org/${home.handle}`}
            className="tap-scale flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to organisation
          </Link>
        </div>
      </div>
    </div>
  )
}

function DrawerItem({
  section,
  href,
  active,
  accent,
}: {
  section: HomeAdminSection
  href: string
  active: boolean
  accent: string
}) {
  const Icon = section.icon
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="tap-scale flex items-center gap-3 border-b border-border/40 px-3.5 py-3 text-sm font-medium last:border-b-0"
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg"
        style={
          active
            ? { backgroundColor: accent, color: "#fff" }
            : { backgroundColor: "color-mix(in oklab, var(--foreground) 6%, transparent)" }
        }
      >
        <Icon className="size-[17px]" />
      </span>
      <span className="flex-1 truncate">{section.label}</span>
      <ChevronRight className="size-4 text-muted-foreground/40" />
    </Link>
  )
}

function RailItem({
  section,
  href,
  active,
  accent,
}: {
  section: HomeAdminSection
  href: string
  active: boolean
  accent: string
}) {
  const Icon = section.icon
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "tap-scale group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
        active ? "text-white shadow-soft" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
      style={active ? { backgroundColor: accent } : undefined}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
          active ? "bg-white/15" : "bg-secondary/50 text-muted-foreground group-hover:text-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="flex-1 truncate">{section.label}</span>
    </Link>
  )
}


function HomeLogo({ home, size = "md" }: { home: HomeView; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "size-8" : "size-10"
  const radius = size === "sm" ? "rounded-xl" : "rounded-2xl"
  if (home.orgLogo) {
    return (
      <div className={cn("relative shrink-0 overflow-hidden shadow-soft ring-1 ring-border/60", dim, radius)}>
        <Image src={home.orgLogo || "/placeholder.svg"} alt={home.orgName} fill className="object-cover" sizes="40px" />
      </div>
    )
  }
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center text-sm font-bold text-white shadow-soft", dim, radius)}
      style={{ backgroundColor: home.accentColor || home.orgColor }}
    >
      {home.orgInitials}
    </div>
  )
}
