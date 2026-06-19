"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { Bell, Radio, MessageCircle } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { getNotifications, markNotificationsRead } from "@/app/actions/notifications"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export function NotificationBell() {
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const signedIn = !!session?.user

  const { data, mutate } = useSWR(signedIn ? "notifications" : null, () => getNotifications(), {
    refreshInterval: 20000,
  })

  if (!signedIn) return null

  const notifications = data ?? []
  const unread = notifications.filter((n) => !n.read).length

  async function onOpenChange(open: boolean) {
    if (open && unread > 0) {
      await markNotificationsRead()
      mutate()
      router.refresh()
    }
  }

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
            className="relative flex size-9 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            <p>No notifications yet.</p>
            <p className="mt-1 text-xs">Follow people to hear when they post or go live.</p>
          </div>
        ) : (
          notifications.map((n) => (
            <DropdownMenuItem
              key={n.id}
              render={<Link href={n.link} />}
              className={cn("flex items-start gap-2.5 py-2.5", !n.read && "bg-primary/5")}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                  n.type === "live" ? "bg-live/15 text-live" : "bg-secondary text-foreground",
                )}
              >
                {n.type === "live" ? <Radio className="size-3.5" /> : <MessageCircle className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-snug">
                  <span className="font-semibold">{n.actorName}</span>{" "}
                  <span className="text-muted-foreground">
                    {n.type === "live" ? "is live" : "posted"}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{n.message}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{n.postedAt}</span>
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
