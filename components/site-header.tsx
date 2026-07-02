"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Radio, Search } from "lucide-react"
import { AppMenu } from "@/components/app-menu"
import { UserMenu } from "@/components/user-menu"
import { MessagesBell } from "@/components/messages-bell"
import { NotificationBell } from "@/components/notification-bell"
import { cn } from "@/lib/utils"

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
    </header>
  )
}
