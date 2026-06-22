"use client"

import { useEffect } from "react"
import Link from "next/link"
import useSWR, { useSWRConfig } from "swr"
import { Bell, Heart, MessageCircle, Radio, UserPlus, Megaphone } from "lucide-react"
import {
  getNotifications,
  markNotificationsRead,
  type NotificationType,
  type NotificationView,
} from "@/app/actions/notifications"
import { cn } from "@/lib/utils"

const ICONS: Record<NotificationType, typeof Bell> = {
  like: Heart,
  comment: MessageCircle,
  live: Radio,
  post: Megaphone,
  follow: UserPlus,
}

function verb(type: NotificationType) {
  switch (type) {
    case "like":
      return "liked your post"
    case "comment":
      return "replied to your post"
    case "live":
      return "is live now"
    case "post":
      return "posted"
    case "follow":
      return "followed you"
  }
}

export function NotificationsList({ initial }: { initial: NotificationView[] }) {
  const { mutate } = useSWRConfig()
  const { data } = useSWR("notifications-page", () => getNotifications(), {
    fallbackData: initial,
    refreshInterval: 20000,
  })

  // Opening the page marks everything read. Done here (client, post-mount) so
  // the underlying revalidatePath() runs outside of render, and the unread
  // badge in the header clears immediately.
  useEffect(() => {
    void markNotificationsRead().then(() => mutate("notifications-unread"))
  }, [mutate])

  const notifications = data ?? []

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Bell className="size-6" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">You&apos;re all caught up</p>
          <p className="text-sm text-muted-foreground">
            When people like or reply to your posts — or someone you follow goes live — it&apos;ll show up here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {notifications.map((n) => {
        const Icon = ICONS[n.type] ?? Bell
        return (
          <li key={n.id}>
            <Link
              href={n.link}
              className={cn(
                "flex items-start gap-3 rounded-xl border border-border/60 p-3 transition-colors hover:bg-secondary/60",
                !n.read && "bg-primary/5",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
                  n.type === "live"
                    ? "bg-live/15 text-live"
                    : n.type === "like"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-secondary text-foreground",
                )}
              >
                <Icon className={cn("size-4", n.type === "like" && "fill-current")} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-snug">
                  <span className="font-semibold">{n.actorName}</span>{" "}
                  <span className="text-muted-foreground">{verb(n.type)}</span>
                </span>
                {n.message && (
                  <span className="mt-0.5 block truncate text-sm text-muted-foreground">{n.message}</span>
                )}
                <span className="mt-0.5 block text-xs text-muted-foreground">{n.postedAt}</span>
              </span>
              {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
