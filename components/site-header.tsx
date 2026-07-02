"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Radio, Sparkles, SquarePen, Podcast, MessagesSquare, Search, type LucideIcon } from "lucide-react"
import { AppMenu } from "@/components/app-menu"
import { UserMenu } from "@/components/user-menu"
import { MessagesBell } from "@/components/messages-bell"
import { NotificationBell } from "@/components/notification-bell"
import { cn } from "@/lib/utils"

type NavItem = { href: string; label: string; icon: LucideIcon }

const navItems: NavItem[] = [
  { href: "/", label: "Devotional", icon: Sparkles },
  { href: "/feed", label: "Feed", icon: SquarePen },
  { href: "/live", label: "Live", icon: Podcast },
  { href: "/chatrooms", label: "Chatroom", icon: MessagesSquare },
]

/**
 * Modern segmented nav. On desktop every tab shows its icon + label; on mobile
 * (compact) inactive tabs collapse to an icon and the active tab expands to
 * reveal its label, giving an immersive "pill that slides" feel. The active
 * pill is filled with the current skin's primary color.
 */
function NavTabs({
  isActive,
  compact = false,
}: {
  isActive: (href: string) => boolean
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-full border border-border/60 bg-secondary/40 p-1 backdrop-blur-sm",
        compact && "w-full justify-between",
      )}
    >
      {navItems.map((item) => {
        const active = isActive(item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-300 ease-out active:scale-95",
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <span
                className="nav-pill-active absolute inset-0 -z-10 rounded-full bg-primary shadow-lg shadow-primary/30"
                aria-hidden="true"
              />
            )}
            <Icon className="size-4 shrink-0" />
            {/* On mobile, only the active tab shows its label (expanding pill). */}
            <span className={cn(compact && !active && "sr-only")}>{item.label}</span>
          </Link>
        )
      })}
    </div>
  )
}

export function SiteHeader() {
  const pathname = usePathname()
  // Hide the header when scrolling down, reveal it when scrolling back up.
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)

  useEffect(() => {
    lastY.current = window.scrollY
    let frame = 0
    function onScroll() {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const y = window.scrollY
        const delta = y - lastY.current
        // Ignore tiny jitters; always show near the very top.
        if (Math.abs(delta) > 6) {
          setHidden(delta > 0 && y > 72)
          lastY.current = y
        } else if (y <= 72) {
          setHidden(false)
        }
      })
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  function isActive(href: string) {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-border/60 bg-background/80 pt-safe backdrop-blur-xl transition-[transform,opacity] duration-300 ease-out",
        hidden ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100",
      )}
    >
      <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] sm:pl-[max(2rem,env(safe-area-inset-left))] sm:pr-[max(2rem,env(safe-area-inset-right))]">
        {/* Left: floating hamburger + brand (icon left of text), tightly aligned. */}
        <div className="flex items-center gap-2.5">
          <AppMenu />
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Radio className="size-4" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Frequency</span>
          </Link>
        </div>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center md:flex">
          <NavTabs isActive={isActive} />
        </nav>

        {/* Right, iOS-aligned: Search · Notifications · Messages · Profile. */}
        <div className="flex items-center gap-1">
          <Link
            href="/search"
            aria-label="Search"
            className={cn(
              "relative flex size-9 items-center justify-center rounded-full outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
              isActive("/search") ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Search className="size-[18px]" />
          </Link>
          <NotificationBell />
          <MessagesBell />
          <UserMenu />
        </div>
      </div>

      <nav className="border-t border-border/60 py-2 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] md:hidden">
        <NavTabs isActive={isActive} compact />
      </nav>
    </header>
  )
}
