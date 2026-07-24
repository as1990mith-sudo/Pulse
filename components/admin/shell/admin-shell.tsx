"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import type { AdminActor } from "@/lib/admin-auth"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Toaster } from "@/components/ui/sonner"
import { AdminSidebar } from "@/components/admin/shell/sidebar"
import { AdminTopbar } from "@/components/admin/shell/topbar"
import { CommandPalette } from "@/components/admin/shell/command-palette"

export function AdminShell({
  actor,
  children,
}: {
  actor: AdminActor
  children: React.ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const pathname = usePathname()

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // ⌘K / Ctrl+K opens the command palette.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const openMobile = useCallback(() => setMobileOpen(true), [])

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border/70 bg-sidebar/80 backdrop-blur-xl lg:block">
        <AdminSidebar role={actor.role} />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 border-border/70 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <AdminSidebar role={actor.role} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Content column */}
      <div className="lg:pl-64">
        <AdminTopbar actor={actor} onMenuClick={openMobile} onSearchClick={openPalette} />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} role={actor.role} />
      <Toaster position="top-center" richColors />
    </div>
  )
}
