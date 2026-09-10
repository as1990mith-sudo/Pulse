"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArchiveRestore, ArrowLeft, Clock, MessageSquare, MoreVertical, Pin, Radio, Trash2 } from "lucide-react"
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
import { getMyBroadcastInboxItems, type BroadcastInboxItem } from "@/app/actions/home-broadcast"
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

  // Home Broadcast threads (one per Home the user belongs to that has ever
  // broadcast). Fetched separately so the DM query stays untouched; merged into
  // the same visual list below with unread ones pinned above all chats.
  const { data: broadcastData } = useSWR(["broadcast-inbox"], () => getMyBroadcastInboxItems(), {
    refreshInterval: 5000,
    revalidateOnFocus: true,
  })
  const broadcasts = broadcastData ?? []

  // Status currently being viewed (lazily loaded when a ring is tapped).
  const [viewing, setViewing] = useState<StatusGroup | null>(null)
  // Whether we're looking at the main inbox or the "Respond later" list.
  const [showArchived, setShowArchived] = useState(false)

  const list = data ?? conversations
  const inboxList = list.filter((c) => !c.archived)
  const archivedList = list.filter((c) => c.archived)
  const archivedCount = archivedList.length

  // Whether any broadcast thread is currently unread — used to force those rows
  // to the very top of the inbox, ahead of every ordinary chat.
  const hasUnreadBroadcast = broadcasts.some((b) => b.unreadCount > 0)

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

  // Unified row model for the main inbox: chats + broadcast threads merged into
  // one time-sorted list, with UNREAD broadcasts force-pinned above everything.
  type InboxRow =
    | { kind: "chat"; sortAt: string; pinned: boolean; chat: DmConversationSummary }
    | { kind: "broadcast"; sortAt: string; pinned: boolean; broadcast: BroadcastInboxItem }

  const mergedRows: InboxRow[] = [
    ...inboxList.map(
      (c): InboxRow => ({ kind: "chat", sortAt: c.sortAt, pinned: c.priority, chat: c }),
    ),
    ...broadcasts.map(
      (b): InboxRow => ({ kind: "broadcast", sortAt: b.lastSentAt, pinned: b.unreadCount > 0, broadcast: b }),
    ),
  ].sort((a, b) => {
    // Pinned (unread broadcast / priority) rows always precede unpinned ones;
    // within each group, newest activity first.
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime()
  })

  // Fully empty inbox (no active threads, nothing archived, no broadcasts).
  if (list.length === 0 && broadcasts.length === 0) {
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

  // Archived view shows only chats (broadcasts are never archived). The main
  // view uses the merged chat+broadcast rows.
  const hasVisibleRows = showArchived ? archivedList.length > 0 : mergedRows.length > 0

  return (
    <>
      {/* "Respond later" header when viewing the archive, or the entry row on
          the main inbox (only shown once something has been archived). Styled as
          a premium pill to match the conversation cards below. */}
      {showArchived ? (
        <button
          type="button"
          onClick={() => setShowArchived(false)}
          className="mb-1 flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-secondary/40 active:scale-[0.99]"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary/70 text-foreground">
            <ArrowLeft className="size-5" />
          </span>
          <span className="font-semibold tracking-tight">Respond later</span>
          <span className="ml-auto rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            {archivedCount}
          </span>
        </button>
      ) : (
        archivedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived(true)}
            className="mb-1 flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-secondary/40 active:scale-[0.99]"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary/70 text-muted-foreground">
              <Clock className="size-[18px]" />
            </span>
            <span className="font-medium tracking-tight">Respond later</span>
            <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {archivedCount}
            </span>
          </button>
        )
      )}

      {!hasVisibleRows ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-16 text-center">
          <p className="text-pretty text-sm text-muted-foreground">
            {showArchived
              ? "Nothing here. Chats you move to Respond later will show up in this list."
              : "Your inbox is empty. New conversations will appear here."}
          </p>
        </div>
      ) : (
        // Immersive, edge-to-edge conversation list. Rows have no card border or
        // shadow — they read as one continuous surface separated by subtle
        // hairline dividers, with a soft rounded highlight on hover the way
        // iMessage/Telegram feel. Priority threads get a subtle primary tint +
        // left accent bar instead of a heavy box.
        <ul className="[&>li:not(:last-child)]:border-b [&>li:not(:last-child)]:border-border/40">
          {showArchived
            ? archivedList.map((c) => renderChatRow(c))
            : mergedRows.map((row) =>
                row.kind === "broadcast" ? renderBroadcastRow(row.broadcast) : renderChatRow(row.chat),
              )}
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

  // ── Row renderers ────────────────────────────────────────────────────────

  function renderBroadcastRow(b: BroadcastInboxItem) {
    const unread = b.unreadCount > 0
    return (
      <li key={`broadcast-${b.homeId}`} className="relative">
        <Link
          href={`/messages/broadcast/${b.homeId}`}
          className={cn(
            "group relative flex items-center gap-3 rounded-xl py-3 pl-2 pr-4 transition-colors hover:bg-secondary/40 active:scale-[0.99]",
            unread &&
              "bg-primary/[0.05] before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-primary/70 hover:bg-primary/[0.09]",
          )}
        >
          <span className="relative shrink-0">
            <Avatar className="size-12 ring-2 ring-border/60 transition-transform duration-200 group-hover:scale-105">
              {b.image && <AvatarImage src={b.image || "/placeholder.svg"} alt={b.homeName} />}
              <AvatarFallback className={cn("text-sm", b.color)}>{b.initials}</AvatarFallback>
            </Avatar>
            {/* Small broadcast glyph badge to distinguish the Home identity. */}
            <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
              <Radio className="size-3" />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={cn("truncate text-base font-semibold tracking-tight")}>Home Broadcast</span>
              </span>
              {unread && (
                <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  New
                </span>
              )}
            </div>
            <p className="truncate text-xs font-medium text-muted-foreground">{b.homeName}</p>
            <p className={cn("mt-0.5 truncate text-sm text-muted-foreground", unread && "font-medium text-foreground")}>
              {b.lastMessage}
            </p>
          </div>
        </Link>
      </li>
    )
  }

  function renderChatRow(c: DmConversationSummary) {
    return (
            <li key={c.id} className="relative">
              <Link
                href={`/messages/${c.id}`}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl py-3 pl-2 pr-14 transition-colors hover:bg-secondary/40 active:scale-[0.99]",
                  c.priority &&
                    "bg-primary/[0.05] before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-primary/70 hover:bg-primary/[0.09]",
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
    )
  }
}
