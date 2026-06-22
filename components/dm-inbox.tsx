"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MessageSquare, Pin } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { getConversations, type DmConversationSummary } from "@/app/actions/dm"
import { getActiveStatusForUser, type StatusGroup } from "@/app/actions/status"
import { StatusViewer } from "@/components/status-bar"
import type { CurrentUser } from "@/lib/session"

export function DmInbox({
  conversations,
  currentUser = null,
}: {
  conversations: DmConversationSummary[]
  currentUser?: CurrentUser | null
}) {
  const router = useRouter()
  // Keep the inbox live so new messages and read state stay in sync.
  const { data } = useSWR(["dm-conversations"], () => getConversations(), {
    fallbackData: conversations,
    refreshInterval: 5000,
    revalidateOnFocus: true,
  })

  // Status currently being viewed (lazily loaded when a ring is tapped).
  const [viewing, setViewing] = useState<StatusGroup | null>(null)

  const list = data ?? conversations

  async function openStatus(userId: string) {
    const group = await getActiveStatusForUser(userId)
    if (group && group.items.length > 0) setViewing(group)
  }

  if (list.length === 0) {
    return (
      <div className="mx-4 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center sm:mx-6">
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
    <>
      <ul className="divide-y divide-border/60 border-y border-border/60">
        {list.map((c) => (
          <li key={c.id}>
            <Link
              href={`/messages/${c.id}`}
              className={cn(
                "flex items-center gap-3 px-4 py-4 transition-colors hover:bg-secondary/40 sm:px-5",
                c.priority && "bg-primary/5 hover:bg-primary/10",
              )}
            >
              {c.hasActiveStatus ? (
                // Tappable story ring (Instagram/WhatsApp style). Tapping opens
                // the status without navigating to the conversation.
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    void openStatus(c.otherUserId)
                  }}
                  aria-label={`View ${c.otherUserName}'s status`}
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-full p-[2px] transition-transform hover:scale-[1.04]",
                    c.statusAllViewed && "bg-border",
                  )}
                  style={c.statusAllViewed ? undefined : { backgroundImage: "var(--skin-ring)" }}
                >
                  <span className="rounded-full border-2 border-card p-[1px]">
                    <Avatar className="size-10">
                      {c.image && <AvatarImage src={c.image || "/placeholder.svg"} alt={c.otherUserName} />}
                      <AvatarFallback className={cn("text-sm", c.color)}>{c.initials}</AvatarFallback>
                    </Avatar>
                  </span>
                </button>
              ) : (
                <Avatar className="size-11 shrink-0">
                  {c.image && <AvatarImage src={c.image || "/placeholder.svg"} alt={c.otherUserName} />}
                  <AvatarFallback className={cn("text-sm", c.color)}>{c.initials}</AvatarFallback>
                </Avatar>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {c.priority && (
                      <Pin className="size-3.5 shrink-0 -rotate-45 fill-primary text-primary" aria-label="Priority" />
                    )}
                    <span className={cn("truncate font-medium", c.unread && "font-semibold")}>{c.otherUserName}</span>
                  </span>
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

      {viewing && (
        <StatusViewer
          groups={[viewing]}
          startIndex={0}
          currentUser={currentUser}
          onClose={() => setViewing(null)}
          onDelete={() => {
            setViewing(null)
            router.refresh()
          }}
        />
      )}
    </>
  )
}
