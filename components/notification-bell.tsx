"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import useSWR from "swr"
import { Bell } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { getUnreadCount } from "@/app/actions/notifications"
import { cn } from "@/lib/utils"

export function NotificationBell() {
  const pathname = usePathname()
  const { data: session } = authClient.useSession()
  const signedIn = !!session?.user

  const { data: unread } = useSWR(signedIn ? "notifications-unread" : null, () => getUnreadCount(), {
    refreshInterval: 20000,
  })

  if (!signedIn) return null

  const count = unread ?? 0
  const active = pathname.startsWith("/notifications")

  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
      className={cn(
        "relative flex size-11 items-center justify-center rounded-2xl border border-border/50 bg-secondary/40 shadow-soft outline-none backdrop-blur-md transition-all duration-200 hover:bg-secondary/70 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Bell className="size-[22px]" strokeWidth={2} />
      {count > 0 && (
        <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  )
}
