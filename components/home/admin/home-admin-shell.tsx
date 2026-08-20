"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { ArrowLeft, Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { HOME_ADMIN_SECTIONS } from "@/lib/home/admin-nav"
import { homeRoleHasPermission, type HomeRole } from "@/lib/home/roles"
import type { HomeView } from "@/lib/home/types"

/**
 * Branded chrome for the Frequency Home Admin Console, redrawn to match the
 * editorial Articles surface: a soft accent-lit sidebar, a quiet glass header,
 * font-display headings and premium rounded surfaces. Mobile leads — the nav is
 * a native slide-over and the header stays tappable and uncluttered. Sections
 * gate on the viewer's Home role so lower roles see a reduced console.
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const base = `/org/${home.handle}/admin`
  const accent = home.accentColor || home.orgColor
  const accentSoft = `color-mix(in oklab, ${accent} 14%, transparent)`
  const planLabel = home.plan === "premium_pro" ? "Premium Pro" : "Premium"

  const sections = HOME_ADMIN_SECTIONS.filter((s) => !s.permission || homeRoleHasPermission(role, s.permission))

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" data-scroll>
      {sections.map((s) => {
        const href = s.slug === "overview" ? base : `${base}/${s.slug}`
        const isActive =
          s.slug === "overview" ? pathname === base : pathname === href || pathname.startsWith(`${href}/`)
        const Icon = s.icon
        return (
          <Link
            key={s.slug}
            href={href}
            onClick={() => setMobileOpen(false)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "tap-scale group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              isActive ? "text-white shadow-soft" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
            style={isActive ? { backgroundColor: accent } : undefined}
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                isActive ? "bg-white/15" : "bg-secondary/50 text-muted-foreground group-hover:text-foreground",
              )}
            >
              <Icon className="size-[17px]" />
            </span>
            <span className="flex-1 truncate">{s.label}</span>
            {!s.ready && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]",
                  isActive ? "bg-white/20 text-white" : "bg-secondary text-muted-foreground",
                )}
              >
                Soon
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )

  const sidebarBody = (
    <>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <HomeLogo home={home} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-semibold leading-tight tracking-tight">{home.orgName}</p>
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Admin Console
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="tap-scale -mr-1 flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground lg:hidden"
          aria-label="Close menu"
        >
          <X className="size-5" />
        </button>
      </div>

      {nav}

      {/* Footer */}
      <div className="border-t border-border/50 px-5 py-4">
        <Link
          href={`/org/${home.handle}`}
          className="tap-scale flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to organisation
        </Link>
        <p className="mt-3 text-[11px] text-muted-foreground/70">
          Powered by <span className="font-semibold text-muted-foreground">Frequency</span>
        </p>
      </div>
    </>
  )

  return (
    <div className="flex min-h-dvh bg-background text-foreground" style={{ ["--home-accent" as string]: accent }}>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-border/50 bg-card/40 backdrop-blur-xl lg:flex">
        {sidebarBody}
      </aside>

      {/* Mobile slide-over */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border/60 bg-card transition-transform duration-300 ease-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {sidebarBody}
      </aside>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu overlay"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-in fade-in lg:hidden"
        />
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-72">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/50 bg-background/70 px-4 py-3 backdrop-blur-xl lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="tap-scale flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] font-semibold tracking-tight lg:text-base">{home.name}</p>
          </div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ring-inset"
            style={{ backgroundColor: accentSoft, color: accent, borderColor: "transparent" }}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
            {planLabel}
          </span>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 lg:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  )
}

function HomeLogo({ home }: { home: HomeView }) {
  if (home.orgLogo) {
    return (
      <div className="relative size-10 shrink-0 overflow-hidden rounded-2xl shadow-soft ring-1 ring-border/60">
        <Image src={home.orgLogo || "/placeholder.svg"} alt={home.orgName} fill className="object-cover" sizes="40px" />
      </div>
    )
  }
  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-soft"
      style={{ backgroundColor: home.accentColor || home.orgColor }}
    >
      {home.orgInitials}
    </div>
  )
}
