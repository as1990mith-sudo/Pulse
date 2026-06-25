"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArchiveRestore, ArrowLeft, Clock, MessageSquare, MoreVertical, Pin, Trash2 } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  deleteConversation,
  getConversations,
  setConversationArchived,
  type DmConversationSummary,
} from "@/app/actions/dm"
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
  const { data, mutate } = useSWR(["dm-conversations"], () => getConversations(), {
    fallbackData: conversations,
    refreshInterval: 5000,
    revalidateOnFocus: true,
  })

  // Status currently being viewed (lazily loaded when a ring is tapped).
  const [viewing, setViewing] = useState<StatusGroup | null>(null)
  // Whether we're looking at the main inbox or the "Respond later" list.
  const [showArchived, setShowArchived] = useState(false)

  const list = data ?? conversations
  const inboxList = list.filter((c) => !c.archived)
  const archivedList = list.filter((c) => c.archived)
  const archivedCount = archivedList.length

  async function openStatus(userId: string) {
    const group = await getActiveStatusForUser(userId)
    if (group && group.items.length > 0) setViewing(group)
  }

  // Optimistically flip a thread's archived flag, then persist + revalidate.
  async function toggleArchive(c: DmConversationSummary) {
    const next = !c.archived
    await mutate(
      async () => {
        await setConversationArchived(c.id, next)
        return getConversations()
      },
      {
        optimisticData: list.map((x) => (x.id === c.id ? { ...x, archived: next } : x)),
        rollbackOnError: true,
        revalidate: false,
      },
    )
  }

  // Remove a thread from this user's inbox (WhatsApp-style delete chat).
  async function removeChat(c: DmConversationSummary) {
    const ok = window.confirm(`Delete your chat with ${c.otherUserName}? This only removes it for you.`)
    if (!ok) return
    await mutate(
      async () => {
        await deleteConversation(c.id)
        return getConversations()
      },
      {
        optimisticData: list.filter((x) => x.id !== c.id),
        rollbackOnError: true,
        revalidate: false,
      },
    )
  }

  // Fully empty inbox (no active threads and nothing archived).
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

  const visibleList = showArchived ? archivedList : inboxList

  return (
    <>
      {/* "Respond later" header when viewing the archive, or the entry row on
          the main inbox (only shown once something has been archived). */}
      {showArchived ? (
        <button
          type="button"
          onClick={() => setShowArchived(false)}
          className="flex w-full items-center gap-3 border-y border-border/60 px-4 py-3 text-left transition-colors hover:bg-secondary/40 sm:px-5"
        >
          <ArrowLeft className="size-5 shrink-0 text-muted-foreground" />
          <span className="font-semibold">Respond later</span>
          <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {archivedCount}
          </span>
        </button>
      ) : (
        archivedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived(true)}
            className="flex w-full items-center gap-3 border-y border-border/60 px-4 py-3 text-left transition-colors hover:bg-secondary/40 sm:px-5"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Clock className="size-4" />
            </span>
            <span className="font-medium">Respond later</span>
            <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {archivedCount}
            </span>
          </button>
        )
      )}

      {visibleList.length === 0 ? (
        <div className="px-4 py-16 text-center sm:px-6">
          <p className="text-pretty text-sm text-muted-foreground">
            {showArchived
              ? "Nothing here. Chats you move to Respond later will show up in this list."
              : "Your inbox is empty. New conversations will appear here."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 border-y border-border/60">
          {visibleList.map((c) => (
            <li key={c.id} className="relative">
              <Link
                href={`/messages/${c.id}`}
                className={cn(
                  "flex items-center gap-3 py-4 pl-4 pr-12 transition-colors hover:bg-secondary/40 sm:pl-5",
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

              {/* Per-chat menu: archive (Respond later) / unarchive + delete. */}
              <div className="absolute right-1 top-1/2 -translate-y-1/2">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Options for chat with ${c.otherUserName}`}
                    className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <MoreVertical className="size-5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => void toggleArchive(c)}>
                      {c.archived ? (
                        <>
                          <ArchiveRestore className="size-4" />
                          Move to inbox
                        </>
                      ) : (
                        <>
                          <Clock className="size-4" />
                          Move to respond later
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => void removeChat(c)}>
                      <Trash2 className="size-4" />
                      Delete chat
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      )}

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
