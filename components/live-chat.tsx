"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import useSWR from "swr"
import { ChevronDown, Pin, PinOff, Send, Smile } from "lucide-react"
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ProfilePreview } from "@/components/profile-preview"
import { cn } from "@/lib/utils"
import { renderMessageBody } from "@/lib/rich-text"

// A compact, curated set of emojis for the inline chat picker.
const CHAT_EMOJIS = [
  "😀", "😂", "🥰", "😍", "😎", "🤔", "😮", "😢",
  "👍", "👏", "🙌", "🙏", "🔥", "💯", "❤️", "✨",
  "🎉", "🕊️", "✝️", "📖", "🎶", "💪", "😇", "🤝",
] as const

/** Renders message text with @mentions highlighted in the accent color. */
function MentionText({ body, accent = false }: { body: string; accent?: boolean }) {
  // Highlights @mentions and supports WhatsApp-style **bold** / __italic__.
  return (
    <>
      {renderMessageBody(body, {
        mention: true,
        mentionClassName: cn("font-semibold", accent ? "text-primary-foreground underline" : "text-primary"),
      })}
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
  immersive = false,
}: {
  asHost?: boolean
  currentUser?: CurrentUser | null
  roomName?: string
  // Host-controlled chat background (image URL + blur/dim treatment).
  bgUrl?: string | null
  bgEffect?: "none" | "blur" | "dim"
  // When true, the chat renders transparent on a dark room (white text, glass
  // bubbles) so it reads as one with the immersive stage rather than a card.
  immersive?: boolean
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

  // Scroll priority: only auto-stick to the newest message when the viewer is
  // already near the bottom. If they've scrolled up to read history, incoming
  // messages won't yank them down — they stay where they are until they scroll
  // back down. A "jump to latest" pill appears while they're scrolled away.
  const atBottomRef = useRef(true)
  const [showJump, setShowJump] = useState(false)

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
  }

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    const near = distance < 80
    atBottomRef.current = near
    setShowJump(!near)
  }

  useEffect(() => {
    if (atBottomRef.current) scrollToBottom()
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
      userImage: currentUser?.image ?? null,
      isHost: asHost,
      kind: "message",
      body: text,
    }
    mutate([...messages, optimistic], { revalidate: false })
    // Sending always sticks the viewer to the bottom.
    atBottomRef.current = true
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
        <div
          className={cn(
            "relative flex items-start gap-2 border-b px-4 py-2.5",
            immersive ? "border-white/10 bg-primary/15" : "border-border/60 bg-primary/10",
          )}
        >
          <Pin className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              Pinned · {pinnedMessage.userName}
            </p>
            <p className={cn("truncate text-sm", immersive ? "text-white/90" : "text-foreground/90")}>
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
        <ul
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex h-full flex-col gap-2 overflow-y-auto overscroll-contain p-4"
        >
          {messages.length === 0 && (
            <li className={cn("py-8 text-center text-sm", immersive ? "text-white/50" : "text-muted-foreground")}>
              No messages yet. Say hello to the room.
            </li>
          )}
          {messages.map((m) => {
            // System notices (e.g. "<name> entered the room") render centered.
            if (m.kind === "system") {
              return (
                <li key={m.id} className="flex justify-center py-0.5">
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-[11px] font-medium",
                      immersive ? "bg-white/10 text-white/70" : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {m.body}
                  </span>
                </li>
              )
            }
            // The viewer's own messages sit on the right; everyone else's on the left.
            const isMine = currentUser ? m.userId === currentUser.id : false
            const canPreview = !isMine && m.id > 0
            return (
              <li key={m.id} className={cn("flex gap-2.5", isMine && "flex-row-reverse")}>
                <ProfilePreview userId={m.userId} disabled={!canPreview} className="shrink-0">
                  <Avatar className="size-8 shrink-0">
                    {m.userImage ? <AvatarImage src={m.userImage} alt={m.userName} /> : null}
                    <AvatarFallback className={getAvatarColor(m.userId)}>{getInitials(m.userName)}</AvatarFallback>
                  </Avatar>
                </ProfilePreview>
                <div className={cn("group flex max-w-[80%] flex-col gap-0.5", isMine && "items-end")}>
                  <div className={cn("flex items-center gap-2", isMine && "flex-row-reverse")}>
                    <ProfilePreview
                      userId={m.userId}
                      disabled={!canPreview}
                      className={cn(
                        "text-sm font-medium",
                        m.isHost ? "text-primary" : immersive && "text-white",
                        canPreview && "hover:underline",
                      )}
                    >
                      {isMine ? "You" : m.userName}
                    </ProfilePreview>
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
                      "rounded-2xl px-3 py-1.5 text-sm leading-snug shadow-sm [overflow-wrap:anywhere]",
                      isMine
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : immersive
                          ? "rounded-bl-md bg-white/10 text-white/90 ring-1 ring-inset ring-white/10 backdrop-blur-md"
                          : "rounded-bl-md bg-secondary text-foreground/90 ring-1 ring-inset ring-border/50",
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
        {showJump && (
          <button
            type="button"
            onClick={() => {
              atBottomRef.current = true
              setShowJump(false)
              scrollToBottom("smooth")
            }}
            className={cn(
              "absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg ring-1 ring-inset transition-colors",
              immersive
                ? "bg-primary/90 text-primary-foreground ring-white/10"
                : "bg-primary text-primary-foreground ring-primary/30",
            )}
          >
            <ChevronDown className="size-3.5" />
            Jump to latest
          </button>
        )}
      </ScrollArea>

      {canSend ? (
        <form
          onSubmit={send}
          className={cn(
            "relative border-t p-3",
            immersive ? "border-white/10 bg-white/5 backdrop-blur-xl" : "border-border/60 bg-card/80 backdrop-blur",
          )}
        >
          {/* Inline emoji picker — taps insert the emoji into the message. */}
          {emojiOpen && (
            <div
              className={cn(
                "mb-2 grid grid-cols-8 gap-1 rounded-xl border p-2 shadow-lg",
                immersive ? "border-white/10 bg-zinc-900/95 backdrop-blur-xl" : "border-border/60 bg-popover",
              )}
            >
              {CHAT_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => insertEmoji(emoji)}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg text-lg transition-transform hover:scale-110 active:scale-95",
                    immersive ? "hover:bg-white/10" : "hover:bg-secondary",
                  )}
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
                "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
                immersive
                  ? "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
                emojiOpen && (immersive ? "bg-primary/25 text-primary" : "bg-primary/15 text-primary"),
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
              className={cn(
                "max-h-32 min-h-10 flex-1 resize-none py-2.5",
                immersive &&
                  "border-white/15 bg-white/10 text-white placeholder:text-white/40 focus-visible:border-primary/60 focus-visible:ring-primary/30",
              )}
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
        <div
          className={cn(
            "border-t p-3 text-center text-sm",
            immersive ? "border-white/10 text-white/60" : "border-border/60 text-muted-foreground",
          )}
        >
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
