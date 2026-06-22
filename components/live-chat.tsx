"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import useSWR from "swr"
import { Pin, PinOff, Send, Smile } from "lucide-react"
import type { CurrentUser } from "@/lib/session"
import { getAvatarColor, getInitials } from "@/lib/identity"
import {
  getLiveChat,
  getCallState,
  pinLiveChat,
  sendLiveChat,
  type LiveChatMessageView,
} from "@/app/actions/live"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

// A compact, curated set of emojis for the inline chat picker.
const CHAT_EMOJIS = [
  "😀", "😂", "🥰", "😍", "😎", "🤔", "😮", "😢",
  "👍", "👏", "🙌", "🙏", "🔥", "💯", "❤️", "✨",
  "🎉", "🕊️", "✝️", "📖", "🎶", "💪", "😇", "🤝",
] as const

/** Renders message text with @mentions highlighted in the accent color. */
function MentionText({ body, accent = false }: { body: string; accent?: boolean }) {
  const parts = body.split(/(@[a-zA-Z0-9_.]+)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") && part.length > 1 ? (
          <span
            key={i}
            className={cn("font-semibold", accent ? "text-primary-foreground underline" : "text-primary")}
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

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
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const scrollRef = useRef<HTMLUListElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Insert an emoji into the message at the end and keep the composer focused.
  function insertEmoji(emoji: string) {
    setDraft((d) => d + emoji)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const { data: messages = [], mutate } = useSWR<LiveChatMessageView[]>(
    roomName ? ["live-chat", roomName] : null,
    () => getLiveChat({ roomName: roomName! }),
    { refreshInterval: 2000, revalidateOnFocus: true },
  )

  // Keep the host-controlled background + pinned comment in sync for the room.
  const { data: bg, mutate: mutateBg } = useSWR(
    roomName ? ["live-chat-bg", roomName] : null,
    async () => {
      const s = await getCallState({ roomName: roomName! })
      return { url: s.chatBgUrl, effect: s.chatBgEffect, pinnedChatId: s.pinnedChatId }
    },
    { refreshInterval: 5000, fallbackData: { url: bgUrl, effect: bgEffect, pinnedChatId: null } },
  )
  const activeBgUrl = bg?.url ?? bgUrl
  const activeBgEffect = bg?.effect ?? bgEffect
  const pinnedChatId = bg?.pinnedChatId ?? null
  const pinnedMessage = pinnedChatId != null ? messages.find((m) => m.id === pinnedChatId) ?? null : null

  async function togglePin(id: number) {
    if (!roomName) return
    const next = pinnedChatId === id ? null : id
    void mutateBg((cur) => (cur ? { ...cur, pinnedChatId: next } : cur), { revalidate: false })
    await pinLiveChat({ roomName, chatId: next }).catch(() => {})
    void mutateBg()
  }

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
      {activeBgUrl && (
        <>
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 bg-cover bg-center",
              activeBgEffect === "blur" && "blur-sm scale-105",
            )}
            style={{ backgroundImage: `url(${activeBgUrl})` }}
          />
          {/* Scrim keeps text legible over any image (stronger when dimmed). */}
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0",
              activeBgEffect === "dim" ? "bg-background/80" : "bg-background/55",
            )}
          />
        </>
      )}
      {/* Host-pinned comment, surfaced at the top of the room for everyone. */}
      {pinnedMessage && (
        <div className="relative flex items-start gap-2 border-b border-border/60 bg-primary/10 px-4 py-2.5">
          <Pin className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              Pinned · {pinnedMessage.userName}
            </p>
            <p className="truncate text-sm text-foreground/90">
              <MentionText body={pinnedMessage.body} />
            </p>
          </div>
          {asHost && (
            <button
              type="button"
              onClick={() => void togglePin(pinnedMessage.id)}
              aria-label="Unpin comment"
              className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <PinOff className="size-3.5" />
            </button>
          )}
        </div>
      )}

      <ScrollArea className="relative flex-1">
        <ul ref={scrollRef} className="flex flex-col gap-5 p-4">
          {messages.length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">
              No messages yet. Say hello to the room.
            </li>
          )}
          {messages.map((m) => {
            // The viewer's own messages sit on the right; everyone else's on the left.
            const isMine = currentUser ? m.userId === currentUser.id : false
            return (
              <li key={m.id} className={cn("flex gap-3", isMine && "flex-row-reverse")}>
                <Avatar className="size-9 shrink-0">
                  <AvatarFallback className={getAvatarColor(m.userName)}>{getInitials(m.userName)}</AvatarFallback>
                </Avatar>
                <div className={cn("group flex max-w-[78%] flex-col gap-1", isMine && "items-end")}>
                  <div className={cn("flex items-center gap-2", isMine && "flex-row-reverse")}>
                    <span className={cn("text-sm font-medium", m.isHost && "text-primary")}>
                      {isMine ? "You" : m.userName}
                    </span>
                    {m.isHost && (
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Host
                      </span>
                    )}
                    {/* Host can pin any real (already-persisted) message. */}
                    {asHost && m.id > 0 && (
                      <button
                        type="button"
                        onClick={() => void togglePin(m.id)}
                        aria-label={pinnedChatId === m.id ? "Unpin comment" : "Pin comment"}
                        className={cn(
                          "rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100",
                          pinnedChatId === m.id && "text-primary sm:opacity-100",
                        )}
                      >
                        <Pin className="size-3" />
                      </button>
                    )}
                  </div>
                  <p
                    className={cn(
                      "rounded-2xl px-3 py-2 text-sm leading-relaxed",
                      isMine
                        ? "rounded-tr-sm bg-primary text-primary-foreground"
                        : "rounded-tl-sm bg-secondary text-foreground/90",
                      pinnedChatId === m.id && "ring-1 ring-primary/40",
                    )}
                  >
                    <MentionText body={m.body} accent={isMine} />
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      </ScrollArea>

      {canSend ? (
        <form onSubmit={send} className="relative border-t border-border/60 bg-card/80 p-3 backdrop-blur">
          {/* Inline emoji picker — taps insert the emoji into the message. */}
          {emojiOpen && (
            <div className="mb-2 grid grid-cols-8 gap-1 rounded-xl border border-border/60 bg-popover p-2 shadow-lg">
              {CHAT_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => insertEmoji(emoji)}
                  className="flex size-8 items-center justify-center rounded-lg text-lg transition-transform hover:scale-110 hover:bg-secondary active:scale-95"
                  aria-label={`Insert ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setEmojiOpen((o) => !o)}
              aria-label="Insert emoji"
              aria-pressed={emojiOpen}
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground",
                emojiOpen && "bg-primary/15 text-primary",
              )}
            >
              <Smile className="size-5" />
            </button>
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send(e)
                }
              }}
              placeholder={asHost ? "Say something to the room…" : `Chat as ${currentUser?.name}…`}
              rows={1}
              className="max-h-32 min-h-10 flex-1 resize-none py-2.5"
              aria-label="Chat message"
            />
            <Button
              type="submit"
              size="icon"
              className="size-10 shrink-0 rounded-full"
              disabled={!draft.trim() || isPending}
              aria-label="Send message"
            >
              <Send className="size-4" />
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
