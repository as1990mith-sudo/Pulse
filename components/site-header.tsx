"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpen, Radio } from "lucide-react"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { UserMenu } from "@/components/user-menu"
import { UserSearch } from "@/components/user-search"
import { MessagesBell } from "@/components/messages-bell"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/", label: "Devotional" },
  { href: "/feed", label: "Post" },
  { href: "/live", label: "Live" },
  { href: "/chatrooms", label: "Chatroom" },
]

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
        "sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl transition-[transform,opacity] duration-300 ease-out",
        hidden ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100",
      )}
    >
      <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Radio className="size-4" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Frequency</span>
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative rounded-md px-3 py-1.5 text-sm font-medium transition-[color,transform] duration-200 active:scale-95",
                isActive(item.href) ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {isActive(item.href) && (
                <span className="nav-pill-active absolute inset-0 -z-10 rounded-md bg-secondary" aria-hidden="true" />
              )}
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/bible"
            aria-label="Read the Bible"
            className={cn(
              "relative flex size-9 items-center justify-center rounded-full outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
              isActive("/bible") ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <BookOpen className="size-[18px]" />
          </Link>
          <MessagesBell />
          <UserSearch />
          <ThemeSwitcher />
          <UserMenu />
        </div>
      </div>

      <nav className="flex items-center justify-center gap-1 border-t border-border/60 px-4 py-2 md:hidden">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative rounded-md px-3 py-1.5 text-sm font-medium transition-[color,transform] duration-200 active:scale-95",
              isActive(item.href) ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {isActive(item.href) && (
              <span className="nav-pill-active absolute inset-0 -z-10 rounded-md bg-secondary" aria-hidden="true" />
            )}
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
