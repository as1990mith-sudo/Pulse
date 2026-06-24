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
        "group relative flex size-9 items-center justify-center rounded-2xl outline-none transition-all duration-300 ease-out hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
        active
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <MessageSquare className="size-[18px] transition-transform duration-300 group-hover:scale-110" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" aria-hidden="true" />
          <span className="relative inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground ring-2 ring-background">
            {count > 9 ? "9+" : count}
          </span>
        </span>
      )}
    </Link>
  )
}
