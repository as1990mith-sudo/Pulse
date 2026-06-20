"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpen, Radio } from "lucide-react"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { UserMenu } from "@/components/user-menu"
import { NotificationBell } from "@/components/notification-bell"
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

  function isActive(href: string) {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
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
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
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
          <NotificationBell />
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
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive(item.href) ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
