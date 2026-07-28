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
          the main inbox (only shown once something has been archived). Styled as
          a premium pill to match the conversation cards below. */}
      {showArchived ? (
        <button
          type="button"
          onClick={() => setShowArchived(false)}
          className="mb-2.5 flex w-full items-center gap-3 rounded-2xl border-2 border-border bg-card px-3.5 py-3 text-left shadow-lg shadow-black/20 transition-all hover:border-foreground/30 hover:bg-secondary/40 active:scale-[0.99]"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <ArrowLeft className="size-5" />
          </span>
          <span className="font-semibold">Respond later</span>
          <span className="ml-auto rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            {archivedCount}
          </span>
        </button>
      ) : (
        archivedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived(true)}
            className="mb-2.5 flex w-full items-center gap-3 rounded-2xl border-2 border-border bg-card px-3.5 py-3 text-left shadow-lg shadow-black/20 transition-all hover:border-foreground/30 hover:bg-secondary/40 active:scale-[0.99]"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Clock className="size-4" />
            </span>
            <span className="font-medium">Respond later</span>
            <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {archivedCount}
            </span>
          </button>
        )
      )}

      {visibleList.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-16 text-center">
          <p className="text-pretty text-sm text-muted-foreground">
            {showArchived
              ? "Nothing here. Chats you move to Respond later will show up in this list."
              : "Your inbox is empty. New conversations will appear here."}
          </p>
        </div>
      ) : (
        // Each private conversation is rendered with the exact same premium
        // rounded pill card used by the standalone Chatrooms "My rooms" list
        // (rounded-xl, border-2, bg-card, soft shadow, hover scale) for a
        // consistent design language across the app.
        <ul className="space-y-2">
          {visibleList.map((c) => (
            <li key={c.id} className="relative">
              <Link
                href={`/messages/${c.id}`}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border-2 border-border bg-card py-3 pl-4 pr-14 shadow-lg shadow-black/20 transition-all hover:border-foreground/30 hover:bg-secondary/40 hover:shadow-black/30 active:scale-[0.99] sm:pl-5",
                  c.priority && "border-primary/40 bg-primary/[0.06] hover:border-primary/60 hover:bg-primary/10",
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
                      "flex shrink-0 items-center justify-center rounded-full p-[2px] transition-transform hover:scale-[1.06] group-hover:scale-105",
                      c.statusAllViewed && "bg-border",
                    )}
                    style={c.statusAllViewed ? undefined : { backgroundImage: "var(--skin-ring)" }}
                  >
                    <span className="rounded-full border-2 border-card p-[1px]">
                      <Avatar className="size-11">
                        {c.image && <AvatarImage src={c.image || "/placeholder.svg"} alt={c.otherUserName} />}
                        <AvatarFallback className={cn("text-sm", c.color)}>{c.initials}</AvatarFallback>
                      </Avatar>
                    </span>
                  </button>
                ) : (
                  <Avatar className="size-12 shrink-0 ring-2 ring-border/60 transition-transform duration-200 group-hover:scale-105">
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
                      <span className={cn("truncate text-base font-semibold tracking-tight", !c.unread && "font-medium")}>
                        {c.otherUserName}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">{c.lastMessageAt}</span>
                  </div>
                  <p
                    className={cn(
                      "mt-0.5 truncate text-sm text-muted-foreground",
                      c.unread && "font-medium text-foreground",
                    )}
                  >
                    {c.lastMessage}
                  </p>
                </div>
                {c.unread && (
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-sm shadow-primary/40"
                    aria-label="Unread messages"
                  >
                    <span className="size-2 rounded-full bg-primary-foreground" />
                  </span>
                )}
              </Link>

              {/* Per-chat menu: archive (Respond later) / unarchive + delete. */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
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
