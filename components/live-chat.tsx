"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import useSWR from "swr"
import { Send } from "lucide-react"
import type { CurrentUser } from "@/lib/session"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { getLiveChat, getCallState, sendLiveChat, type LiveChatMessageView } from "@/app/actions/live"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

/**
 * Real live-stream chat backed by the database. Messages are polled every two
 * seconds via SWR so everyone in the room sees new messages in near real time.
 */
export function LiveChat({
  asHost = false,
  currentUser = null,
  roomName,
  bgUrl = null,
  bgEffect = "none",
}: {
  asHost?: boolean
  currentUser?: CurrentUser | null
  roomName?: string
  // Host-controlled chat background (image URL + blur/dim treatment).
  bgUrl?: string | null
  bgEffect?: "none" | "blur" | "dim"
}) {
  const [draft, setDraft] = useState("")
  const [isPending, startTransition] = useTransition()
  const scrollRef = useRef<HTMLUListElement>(null)

  const { data: messages = [], mutate } = useSWR<LiveChatMessageView[]>(
    roomName ? ["live-chat", roomName] : null,
    () => getLiveChat({ roomName: roomName! }),
    { refreshInterval: 2000, revalidateOnFocus: true },
  )

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const canSend = (asHost || currentUser) && roomName

  function send(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !roomName) return
    setDraft("")
    // Optimistically append, then revalidate from the server.
    const optimistic: LiveChatMessageView = {
      id: -Date.now(),
      userId: currentUser?.id ?? "me",
      userName: asHost ? `${currentUser?.name ?? "Host"}` : (currentUser?.name ?? "You"),
      isHost: asHost,
      body: text,
    }
    mutate([...messages, optimistic], { revalidate: false })
    startTransition(async () => {
      await sendLiveChat({ roomName, body: text })
      mutate()
    })
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Host-controlled background image sits behind the messages. */}
      {bgUrl && (
        <>
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 bg-cover bg-center",
              bgEffect === "blur" && "blur-sm scale-105",
            )}
            style={{ backgroundImage: `url(${bgUrl})` }}
          />
          {/* Scrim keeps text legible over any image (stronger when dimmed). */}
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0",
              bgEffect === "dim" ? "bg-background/80" : "bg-background/55",
            )}
          />
        </>
      )}
      <ScrollArea className="relative flex-1">
        <ul ref={scrollRef} className="flex flex-col gap-5 p-4">
          {messages.length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">
              No messages yet. Say hello to the room.
            </li>
          )}
          {messages.map((m) => (
            <li key={m.id} className="flex gap-3">
              <Avatar className="size-9 shrink-0">
                <AvatarFallback className={getAvatarColor(m.userName)}>{getInitials(m.userName)}</AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm font-medium", m.isHost && "text-primary")}>{m.userName}</span>
                  {m.isHost && (
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      Host
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">{m.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </ScrollArea>

      {canSend ? (
        <form onSubmit={send} className="relative space-y-3 border-t border-border/60 bg-card/80 p-3 backdrop-blur">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send(e)
              }
            }}
            placeholder={asHost ? "Say something to the room…" : `Chat as ${currentUser?.name}…`}
            className="min-h-16 resize-none"
            aria-label="Chat message"
          />
          <div className="flex justify-end">
            <Button type="submit" className="gap-2" disabled={!draft.trim() || isPending}>
              <Send className="size-4" /> Send
            </Button>
          </div>
        </form>
      ) : (
        <div className="border-t border-border/60 p-3 text-center text-sm text-muted-foreground">
          {roomName ? (
            <>
              <Link href="/sign-in" className="font-medium text-primary hover:underline">
                Sign in
              </Link>{" "}
              to join the chat.
            </>
          ) : (
            "Go live to open the chat."
          )}
        </div>
      )}
    </div>
  )
}
