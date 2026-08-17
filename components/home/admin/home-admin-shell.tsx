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
 * Branded chrome for the Frequency Home Admin Console. The organisation's logo
 * and accent lead the identity; Frequency stays a quiet "Powered by" footnote.
 * Sections gate on the viewer's Home role so lower roles see a reduced console.
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

  const sections = HOME_ADMIN_SECTIONS.filter(
    (s) => !s.permission || homeRoleHasPermission(role, s.permission),
  )

  return (
    <div
      className="flex min-h-dvh bg-background text-foreground"
      style={{ ["--home-accent" as string]: accent }}
    >
      {/* Sidebar — desktop persistent, mobile slide-over */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <HomeLogo home={home} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{home.orgName}</p>
            <p className="truncate text-xs text-muted-foreground">Admin Console</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
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
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                style={isActive ? { backgroundColor: accent } : undefined}
              >
                <Icon className="size-[18px] shrink-0" />
                <span className="flex-1 truncate">{s.label}</span>
                {!s.ready && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      isActive ? "bg-white/20 text-white" : "bg-muted text-muted-foreground",
                    )}
                  >
                    Soon
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-border px-5 py-4">
          <Link
            href={`/org/${home.handle}`}
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to organisation
          </Link>
          <p className="mt-3 text-[11px] text-muted-foreground/70">
            Powered by <span className="font-semibold text-muted-foreground">Frequency</span>
          </p>
        </div>
      </aside>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu overlay"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold lg:text-base">{home.name}</p>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white"
            style={{ backgroundColor: accent }}
          >
            {home.plan === "premium_pro" ? "Premium Pro" : "Premium"}
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
      <div className="relative size-9 shrink-0 overflow-hidden rounded-xl ring-1 ring-border">
        <Image src={home.orgLogo || "/placeholder.svg"} alt={home.orgName} fill className="object-cover" sizes="36px" />
      </div>
    )
  }
  return (
    <div
      className="flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
      style={{ backgroundColor: home.accentColor || home.orgColor }}
    >
      {home.orgInitials}
    </div>
  )
}
