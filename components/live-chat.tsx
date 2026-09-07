"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { AlertCircle, BookOpen, ChevronDown, Loader2, Pin, PinOff, RotateCw, Send } from "lucide-react"
import type { CurrentUser } from "@/lib/session"
import { getAvatarColor, getInitials } from "@/lib/identity"
import {
  getLiveChat,
  getCallState,
  pinLiveChat,
  sendLiveChat,
  type LiveChatMessageView,
  type LiveChatMessageMeta,
} from "@/app/actions/live"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ProfilePreview } from "@/components/profile-preview"
import { cn } from "@/lib/utils"
import { renderMessageBody } from "@/lib/rich-text"
import { useLiveResourcesOptional } from "@/components/live/resource/resource-context"

/** Formats an epoch-millis timestamp as a short local clock time (e.g. 2:32 PM). */
function formatClockTime(ms?: number): string {
  if (!ms) return ""
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

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

// A message the viewer has sent that hasn't been confirmed by the server yet.
// Kept in its own state (never the SWR cache) so a routine poll can't drop it.
type Pending = {
  tempId: number
  body: string
  meta: LiveChatMessageMeta | null
  kind: "message" | "bible"
  status: "sending" | "failed"
  createdAtMs: number
}

type RenderMessage = LiveChatMessageView & { pending?: boolean; failed?: boolean }

/** Appends a server message to the cache in id order, ignoring any duplicate. */
function mergeById(list: LiveChatMessageView[], incoming: LiveChatMessageView): LiveChatMessageView[] {
  if (list.some((m) => m.id === incoming.id)) return list
  return [...list, incoming].sort((a, b) => a.id - b.id)
}

/** A shared Bible verse, rendered as a distinct, tappable card within the chat. */
function BibleVerseCard({
  meta,
  onOpen,
  immersive,
}: {
  meta: LiveChatMessageMeta
  onOpen?: () => void
  immersive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex w-full flex-col gap-1 rounded-2xl border border-primary/30 px-3 py-2.5 text-left transition-colors",
        immersive ? "bg-primary/10 backdrop-blur-md hover:bg-primary/20" : "bg-primary/5 hover:bg-primary/10",
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary">
        <BookOpen className="size-3.5" />
        {meta.reference}
        {meta.translation ? <span className="font-semibold text-primary/60">· {meta.translation}</span> : null}
      </span>
      <span className={cn("font-serif text-[15px] leading-relaxed", immersive ? "text-white/90" : "text-foreground/90")}>
        {"\u201C"}
        {meta.text}
        {"\u201D"}
      </span>
      <span className={cn("text-[10px] font-medium", immersive ? "text-white/40 group-hover:text-white/60" : "text-muted-foreground")}>
        Tap to open in the Bible
      </span>
    </button>
  )
}

/**
 * Real live-stream chat backed by the database. Messages are polled every two
 * seconds via SWR so everyone in the room sees new messages in near real time.
 */
export function LiveChat({
  asHost = false,
  currentUser = null,
  guestName = null,
  roomName,
  bgUrl = null,
  bgEffect = "none",
  immersive = false,
  leadingSlot = null,
  placeholder,
  showResourceButton = false,
  flatText = false,
  feed = false,
}: {
  asHost?: boolean
  currentUser?: CurrentUser | null
  // Display name of a signed-OUT guest who joined a public live via its link.
  // The server already accepts guest chat (it resolves a guest actor from the
  // room cookie); this is purely so the composer knows an identity exists and
  // stays enabled instead of showing the "Sign in" prompt.
  guestName?: string | null
  roomName?: string
  // Host-controlled chat background (image URL + blur/dim treatment).
  bgUrl?: string | null
  bgEffect?: "none" | "blur" | "dim"
  // When true, the chat renders transparent on a dark room (white text, glass
  // bubbles) so it reads as one with the immersive stage rather than a card.
  immersive?: boolean
  // Optional element rendered at the far left of the composer row (e.g. the
  // grid meeting's control menu). Sits where the emoji button normally lives.
  leadingSlot?: React.ReactNode
  // Which side the emoji button sits on. "right" places it just left of Send,
  // freeing the left for `leadingSlot`.
  // Overrides the composer placeholder. Pass "" to show no placeholder text.
  placeholder?: string
  // When true, renders the study-resources trigger in the composer, just left of
  // the Send button. Used by the audio podcast interfaces, which have no control
  // dock — the resource icon lives inline next to the message box instead.
  showResourceButton?: boolean
  // TikTok-style presentation for video broadcasts: message text renders with no
  // bubble (no background/ring/shadow/padding) and avatars are smaller, so the
  // chat reads as lightweight text floating over the video rather than a stack of
  // chat cards. Only affects the message rows — the chatroom shell, composer, and
  // pinned/system rows are unchanged.
  flatText?: boolean
  // Dense, bubble-free "message feed" presentation for the immersive audio-live
  // interfaces: small round avatar, a semibold name with a subtle send time,
  // clean text underneath, and tight vertical rhythm — so the chat reads as one
  // continuous conversation rather than a stack of chat cards. Left-aligned for
  // everyone (the viewer's own messages are not pushed to the right).
  feed?: boolean
}) {
  const [draft, setDraft] = useState("")
  const scrollRef = useRef<HTMLUListElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
  // Identity of the newest message we've already auto-scrolled for. SWR hands
  // back a brand-new array reference on every 2s poll even when nothing changed,
  // so keying the auto-scroll off the array itself snapped the viewer to the
  // exact bottom every tick — the source of the "glitchy" scrolling. We only
  // stick to the bottom when the newest message actually changes.
  const lastMessageIdRef = useRef<number | null>(null)

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
    const last = messages[messages.length - 1]
    const lastId = last ? last.id : null
    const changed = lastId !== lastMessageIdRef.current
    lastMessageIdRef.current = lastId
    // Only auto-stick when a genuinely new message arrived — not on every
    // identical poll — so a viewer near the bottom isn't yanked repeatedly.
    if (changed && atBottomRef.current) scrollToBottom()
  }, [messages])

  // A named guest counts as an identity: the room link is the invitation, so a
  // guest who's already in the conversation can talk in it without an account.
  const canSend = (asHost || currentUser || guestName) && roomName
  // Name to show on this viewer's own optimistic messages before the poll
  // returns the server's authoritative copy.
  const myName = asHost ? (currentUser?.name ?? "Host") : (currentUser?.name ?? guestName ?? "You")

  // Bubble-free presentation covers both the video "flatText" style and the new
  // audio "feed" style �� both drop the message background/ring/padding.
  const bare = flatText || feed

  // ── Reliable send (outbox) ────────────────────────────────────────────────
  // Pending messages live in their OWN state, separate from the SWR cache, so a
  // routine 2s poll can never wipe an in-flight message (the old bug where a
  // send appeared to be swallowed once a room got busy). Each send retries
  // automatically with a steady backoff and again the moment connectivity
  // returns; a failure stays visible and tappable to retry. The chat transport
  // is plain server actions + polling, wholly independent of the realtime audio
  // connection — so reconnecting audio, using the Bible/resource panels, or a
  // long-running room never disconnects chat.
  const [outbox, setOutbox] = useState<Pending[]>([])
  const outboxRef = useRef<Pending[]>([])
  useEffect(() => {
    outboxRef.current = outbox
  }, [outbox])

  const attemptSend = useCallback(
    async (item: Pending) => {
      if (!roomName) return
      setOutbox((o) => o.map((x) => (x.tempId === item.tempId ? { ...x, status: "sending" } : x)))
      try {
        const saved = await sendLiveChat({ roomName, body: item.body, kind: item.kind, meta: item.meta })
        // Delivered — drop the pending copy and fold the stored message straight
        // into the cache so it doesn't flicker out before the next poll.
        setOutbox((o) => o.filter((x) => x.tempId !== item.tempId))
        if (saved) void mutate((cur) => mergeById(cur ?? [], saved), { revalidate: false })
        else void mutate()
      } catch {
        // Keep the message and surface a retryable failed state — never discard.
        setOutbox((o) => o.map((x) => (x.tempId === item.tempId ? { ...x, status: "failed" } : x)))
      }
    },
    [roomName, mutate],
  )

  const enqueue = useCallback(
    (body: string, meta: LiveChatMessageMeta | null = null) => {
      const text = body.trim()
      if (!text || !roomName) return
      const item: Pending = {
        tempId: -Date.now() - Math.floor(Math.random() * 1000),
        body: text,
        meta,
        kind: meta?.kind === "bible" ? "bible" : "message",
        status: "sending",
        createdAtMs: Date.now(),
      }
      setOutbox((o) => [...o, item])
      atBottomRef.current = true
      void attemptSend(item)
    },
    [roomName, attemptSend],
  )

  const retryOne = useCallback(
    (tempId: number) => {
      const item = outboxRef.current.find((x) => x.tempId === tempId)
      if (item) void attemptSend(item)
    },
    [attemptSend],
  )

  // Auto-retry failed sends when connectivity returns and on a slow interval, so
  // a temporary network drop recovers on its own without the user doing anything.
  useEffect(() => {
    const retry = () => {
      for (const item of outboxRef.current) if (item.status === "failed") void attemptSend(item)
    }
    window.addEventListener("online", retry)
    const iv = setInterval(retry, 6000)
    return () => {
      window.removeEventListener("online", retry)
      clearInterval(iv)
    }
  }, [attemptSend])

  // Expose a "post to chat" function to the Live Resource system so mini panels
  // (e.g. the mini-Bible) can share a verse — as plain text OR a rich, tappable
  // verse card — straight into this live's chat without leaving the live.
  const resources = useLiveResourcesOptional()
  const registerChatSender = resources?.registerChatSender
  useEffect(() => {
    if (!registerChatSender || !canSend || !roomName) return
    const unregister = registerChatSender((text: string, meta?: LiveChatMessageMeta | null) => {
      enqueue(text, meta ?? null)
    })
    return unregister
  }, [registerChatSender, canSend, roomName, enqueue])

  // Server messages + still-pending local messages, in one ordered list. Pending
  // ones are kept out of the SWR cache so polls can't drop them; they're appended
  // here for rendering and removed the instant the server confirms them.
  const rendered = useMemo<RenderMessage[]>(() => {
    const pending: RenderMessage[] = outbox.map((p) => ({
      id: p.tempId,
      userId: currentUser?.id ?? "me",
      userName: myName,
      userImage: currentUser?.image ?? null,
      isHost: asHost,
      kind: p.kind,
      body: p.body,
      meta: p.meta,
      createdAtMs: p.createdAtMs,
      pending: p.status === "sending",
      failed: p.status === "failed",
    }))
    return [...messages, ...pending]
  }, [messages, outbox, currentUser, myName, asHost])

  // Open the shared verse back in the Bible resource at its exact passage.
  const openBibleVerse = useCallback(
    (meta: LiveChatMessageMeta) => {
      resources?.openPanel?.("bible", { kind: "bible", book: meta.book, chapter: meta.chapter, verseId: meta.verseId })
    },
    [resources],
  )

  // Keep the viewer stuck to the newest line when they send / a message is
  // queued, mirroring the server-message auto-scroll.
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outbox.length])

  function send(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !roomName) return
    setDraft("")
    enqueue(text)
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

      {/* The <ul> is the single bounded scroller (min-h-0 lets it shrink within
          the flex column so it scrolls instead of growing and pushing the UI up).
          Older messages stay above and are reachable by scrolling up, newest at
          the bottom — matching the messages inbox behaviour. */}
      <div className="relative min-h-0 flex-1">
        {/* Subtle bottom scrim so the newest lines of a bubble-free feed stay
            legible over a bright chat background image. */}
        {feed && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-28 bg-gradient-to-t from-black/45 to-transparent"
          />
        )}
        <ul
          ref={scrollRef}
          onScroll={handleScroll}
          className={cn(
            "relative z-[1] flex h-full flex-col overflow-y-auto overscroll-contain p-4",
            feed ? "gap-1.5" : "gap-[0.55rem]",
          )}
        >
          {rendered.length === 0 && (
            <li className={cn("py-8 text-center text-sm", immersive ? "text-white/50" : "text-muted-foreground")}>
              No messages yet. Say hello to the room.
            </li>
          )}
          {rendered.map((m) => {
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

            // Bubble-free "feed"/"flatText" presentation. The avatar sits INLINE
            // with the name on a single header line, so the picture always lines
            // up with the name (never floating between name and text). The
            // message text sits beneath, indented to align under the name. The
            // viewer's OWN messages are aligned to the right, everyone else's to
            // the left.
            if (bare) {
              const avSize = flatText ? "size-5" : "size-6"
              const bodyIndent = flatText ? (isMine ? "pr-7" : "pl-7") : isMine ? "pr-8" : "pl-8"
              return (
                <li key={m.id} className={cn("flex flex-col gap-0.5", isMine && "items-end", m.pending && "opacity-60")}>
                  <div className={cn("flex items-center gap-2", isMine && "flex-row-reverse")}>
                    <ProfilePreview userId={m.userId} disabled={!canPreview} className="shrink-0">
                      <Avatar className={cn("shrink-0", avSize)}>
                        {m.userImage ? <AvatarImage src={m.userImage} alt={m.userName} /> : null}
                        <AvatarFallback className={cn(getAvatarColor(m.userId), flatText ? "text-[9px]" : "text-[10px]")}>
                          {getInitials(m.userName)}
                        </AvatarFallback>
                      </Avatar>
                    </ProfilePreview>
                    <ProfilePreview
                      userId={m.userId}
                      disabled={!canPreview}
                      className={cn(
                        "font-medium",
                        flatText ? "text-xs" : "text-[13px] font-semibold",
                        m.isHost ? "text-primary" : immersive ? "text-white" : undefined,
                        !m.isHost && immersive && "text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]",
                        canPreview && "hover:underline",
                      )}
                    >
                      {isMine ? "You" : m.isHost ? "HOST" : m.userName}
                    </ProfilePreview>
                    {feed && m.createdAtMs > 0 && (
                      <span className="shrink-0 text-[10px] font-medium tabular-nums text-white/40">
                        {formatClockTime(m.createdAtMs)}
                      </span>
                    )}
                  </div>
                  <div className={cn("flex flex-col gap-0.5", bodyIndent, isMine && "items-end")}>
                    {m.kind === "bible" && m.meta ? (
                      <BibleVerseCard meta={m.meta} immersive={immersive} onOpen={() => openBibleVerse(m.meta!)} />
                    ) : (
                      <p className="text-sm leading-snug [overflow-wrap:anywhere] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
                        <MentionText body={m.body} />
                      </p>
                    )}
                    {isMine && (m.pending || m.failed) && (
                      <span
                        className={cn(
                          "flex items-center gap-1 text-[10px] font-medium",
                          m.failed ? "text-destructive" : immersive ? "text-white/45" : "text-muted-foreground",
                        )}
                      >
                        {m.failed ? (
                          <button
                            type="button"
                            onClick={() => retryOne(m.id)}
                            className="flex items-center gap-1 hover:underline"
                          >
                            <AlertCircle className="size-3" /> Not sent — tap to retry <RotateCw className="size-3" />
                          </button>
                        ) : (
                          <>
                            <Loader2 className="size-3 animate-spin" /> Sending…
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </li>
              )
            }
            return (
              <li key={m.id} className={cn(feed ? "flex gap-2" : "flex gap-2.5", isMine && !bare && "flex-row-reverse", m.pending && "opacity-60")}>
                <ProfilePreview userId={m.userId} disabled={!canPreview} className="shrink-0">
                  <Avatar className={cn("shrink-0", flatText ? "size-5" : feed ? "size-6" : "size-8")}>
                    {m.userImage ? <AvatarImage src={m.userImage} alt={m.userName} /> : null}
                    <AvatarFallback className={cn(getAvatarColor(m.userId), flatText && "text-[9px]", feed && "text-[10px]")}>
                      {getInitials(m.userName)}
                    </AvatarFallback>
                  </Avatar>
                </ProfilePreview>
                <div className={cn("group flex flex-col gap-0.5", feed ? "max-w-[92%]" : "max-w-[80%]", isMine && !bare && "items-end")}>
                  <div className={cn("flex items-center gap-2", isMine && !bare && "flex-row-reverse")}>
                    <ProfilePreview
                      userId={m.userId}
                      disabled={!canPreview}
                      className={cn(
                        "font-medium",
                        flatText ? "text-xs" : feed ? "text-[13px] font-semibold" : "text-sm",
                        m.isHost ? "text-primary" : immersive ? "text-white" : undefined,
                        bare && !m.isHost && immersive && "text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]",
                        canPreview && "hover:underline",
                      )}
                    >
                      {/* Own messages read as "You". For everyone else, a host's
                          messages are attributed simply to "HOST" (never the
                          host's real name), so the separate HOST badge is no
                          longer needed on any interface. */}
                      {isMine ? "You" : m.isHost ? "HOST" : m.userName}
                    </ProfilePreview>
                    {/* Subtle send time, feed presentation only. */}
                    {feed && m.createdAtMs > 0 && (
                      <span className="shrink-0 text-[10px] font-medium tabular-nums text-white/40">
                        {formatClockTime(m.createdAtMs)}
                      </span>
                    )}
                  </div>
                  {m.kind === "bible" && m.meta ? (
                    <BibleVerseCard meta={m.meta} immersive={immersive} onOpen={() => openBibleVerse(m.meta!)} />
                  ) : (
                    <p
                      className={cn(
                        "text-sm leading-snug [overflow-wrap:anywhere]",
                        bare
                          ? // Bubble-free: bare text, no background. A subtle shadow keeps
                            // it legible over bright video frames or a chat background.
                            "text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]"
                          : cn(
                              "rounded-2xl px-3 py-1.5 shadow-sm",
                              isMine
                                ? // Neutral white bubble keeps the viewer's own messages readable on
                                  // any studio theme (a themed fill blended into coloured backgrounds).
                                  "rounded-br-md bg-white text-zinc-900"
                                : immersive
                                  ? "rounded-bl-md bg-white/10 text-white/90 ring-1 ring-inset ring-white/10 backdrop-blur-md"
                                  : "rounded-bl-md bg-secondary text-foreground/90 ring-1 ring-inset ring-border/50",
                              pinnedChatId === m.id && "ring-1 ring-primary/40",
                            ),
                      )}
                    >
                      <MentionText body={m.body} />
                    </p>
                  )}
                  {/* Own message delivery state: a quiet spinner while sending, a
                      tappable retry if it failed. Nothing is ever dropped silently. */}
                  {isMine && (m.pending || m.failed) && (
                    <span
                      className={cn(
                        "flex items-center gap-1 text-[10px] font-medium",
                        m.failed ? "text-destructive" : immersive ? "text-white/45" : "text-muted-foreground",
                      )}
                    >
                      {m.failed ? (
                        <button
                          type="button"
                          onClick={() => retryOne(m.id)}
                          className="flex items-center gap-1 hover:underline"
                        >
                          <AlertCircle className="size-3" /> Not sent — tap to retry <RotateCw className="size-3" />
                        </button>
                      ) : (
                        <>
                          <Loader2 className="size-3 animate-spin" /> Sending…
                        </>
                      )}
                    </span>
                  )}
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
      </div>

      {canSend ? (
        <form
          onSubmit={send}
          className={cn(
            "relative p-3",
            immersive ? "bg-white/5 backdrop-blur-xl" : "border-t border-border/60 bg-card/80 backdrop-blur",
          )}
        >
          <div className="flex items-end gap-2">
            {leadingSlot}
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
              placeholder={
                placeholder ?? (asHost ? "Say something to the room…" : `Chat as ${currentUser?.name}…`)
              }
              rows={1}
              className={cn(
                "max-h-32 min-h-10 flex-1 resize-none py-2.5",
                immersive &&
                  "border-2 border-white/25 bg-white/10 text-white placeholder:text-white/40 focus-visible:border-primary/70 focus-visible:ring-primary/40",
              )}
              aria-label="Chat message"
            />
            {showResourceButton && resources && (
              <button
                type="button"
                onClick={() => resources.openDrawer()}
                aria-label="Open study resources"
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
                  immersive
                    ? "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
                )}
              >
                <BookOpen className="size-5" />
              </button>
            )}
            <Button
              type="submit"
              size="icon"
              className="size-10 shrink-0 rounded-full"
              disabled={!draft.trim()}
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
