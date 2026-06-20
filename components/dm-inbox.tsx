"use client"

import useSWR from "swr"
import Link from "next/link"
import { MessageSquare } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { getConversations, type DmConversationSummary } from "@/app/actions/dm"

export function DmInbox({ conversations }: { conversations: DmConversationSummary[] }) {
  // Keep the inbox live so new messages and read state stay in sync.
  const { data } = useSWR(["dm-conversations"], () => getConversations(), {
    fallbackData: conversations,
    refreshInterval: 5000,
    revalidateOnFocus: true,
  })

  const list = data ?? conversations

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <MessageSquare className="size-6" />
        </span>
        <p className="font-medium">No conversations yet</p>
        <p className="max-w-sm text-pretty text-sm text-muted-foreground">
          Visit someone&apos;s profile and tap Message to start a private conversation.
        </p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card/40">
      {list.map((c) => (
        <li key={c.id}>
          <Link
            href={`/messages/${c.id}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/60"
          >
            <Avatar className="size-11 shrink-0">
              {c.image && <AvatarImage src={c.image || "/placeholder.svg"} alt={c.otherUserName} />}
              <AvatarFallback className={cn("text-sm", c.color)}>{c.initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className={cn("truncate font-medium", c.unread && "font-semibold")}>{c.otherUserName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{c.lastMessageAt}</span>
              </div>
              <p className={cn("truncate text-sm text-muted-foreground", c.unread && "font-medium text-foreground")}>
                {c.lastMessage}
              </p>
            </div>
            {c.unread && <span className="size-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
          </Link>
        </li>
      ))}
    </ul>
  )
}
