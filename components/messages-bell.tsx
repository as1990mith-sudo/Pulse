"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import useSWR from "swr"
import { MessageSquare } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { getUnreadDmCount } from "@/app/actions/dm"
import { cn } from "@/lib/utils"

/**
 * Direct-messages icon with an unread badge. Polls the unread conversation
 * count so the user knows when a message is awaiting them.
 */
export function MessagesBell() {
  const pathname = usePathname()
  const { data: session } = authClient.useSession()
  const signedIn = !!session?.user

  const { data: unread } = useSWR(signedIn ? "dm-unread" : null, () => getUnreadDmCount(), {
    refreshInterval: 20000,
  })

  const count = signedIn ? unread ?? 0 : 0
  const active = pathname.startsWith("/messages")

  return (
    <Link
      href="/messages"
      aria-label={count > 0 ? `Direct messages, ${count} unread` : "Direct messages"}
      className={cn(
        "relative flex size-11 items-center justify-center rounded-2xl border border-border/50 bg-secondary/40 shadow-soft outline-none backdrop-blur-md transition-all duration-200 hover:bg-secondary/70 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <MessageSquare className="size-[22px]" strokeWidth={2} />
      {count > 0 && (
        <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  )
}
