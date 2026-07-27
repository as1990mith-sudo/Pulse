"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { CheckCheck, ImageIcon, Loader2, Mic, Minus, Send, Smile, X } from "lucide-react"
import useSWR from "swr"
import { getDmMessages, getDmReadState, type DmMessageView } from "@/app/actions/dm"
import { sendBibleReaderMessage, getBibleChatUnread } from "@/app/actions/bible-community"
import { compressImage, uploadMedia } from "@/lib/upload-media"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AudioMessage } from "@/components/audio-message"
import { VoiceRecorder } from "@/components/voice-recorder"
import { ImageLightbox } from "@/components/image-lightbox"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import { formatChatTimestamp } from "@/lib/format-timestamp"
import { useBibleFellowship } from "./fellowship-context"
import type { ActiveChat } from "./fellowship-context"

const EMOJIS = ["🙏", "❤️", "🕊️", "✨", "🙌", "📖", "🔥", "😊", "😂", "🥰", "👍", "🎉", "🌿", "☀️", "💯", "🍞"]

export function BibleFloatingChat() {
  const { openChats } = useBibleFellowship()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || openChats.length === 0) return null
  return createPortal(<ChatDock />, document.body)
}

// Renders either the stacked chat bubbles (when nothing is expanded) or the one
// expanded chat window. Only one chat is expanded at a time; minimizing brings
// the full stack of bubbles back so the reader can switch between conversations.
function ChatDock() {
  const { openChats, expandedChatId, expandChat, closeChat } = useBibleFellowship()

  const ids = openChats.map((c) => c.conversationId)
  const { data: unreadMap } = useSWR(
    ids.length ? ["bible-dock-unread", ids.join(",")] : null,
    () => getBibleChatUnread(ids),
    { refreshInterval: 4000, revalidateOnFocus: true },
  )

  const expanded = openChats.find((c) => c.conversationId === expandedChatId) ?? null

  if (expanded) return <ChatWindow chat={expanded} />

  return (
    <DraggableDock>
      {openChats.map((chat, i) => (
        <DockBubble
          key={chat.conversationId}
          chat={chat}
          unread={unreadMap?.[chat.conversationId] ?? 0}
          index={openChats.length - i}
          onOpen={() => expandChat(chat.conversationId)}
          onClose={() => {
            haptic("light")
            closeChat(chat.conversationId)
          }}
        />
      ))}
    </DraggableDock>
  )
}

const DOCK_POS_KEY = "frequency-bible-dock-pos"

// A free-floating container for the minimized chat bubbles. The reader can grab
// it anywhere and drag it to any spot on screen; the position persists per
// device. A movement threshold distinguishes a drag from a tap, so grabbing a
// bubble to move it never accidentally opens the chat.
function DraggableDock({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ id: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(
    null,
  )

  // Restore any saved position (clamped into the current viewport).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DOCK_POS_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as { x: number; y: number }
      const el = ref.current
      const w = el?.offsetWidth ?? 64
      const h = el?.offsetHeight ?? 64
      setPos({
        x: Math.max(8, Math.min(saved.x, window.innerWidth - w - 8)),
        y: Math.max(8, Math.min(saved.y, window.innerHeight - h - 8)),
      })
    } catch {
      /* ignore malformed storage */
    }
  }, [])

  function onPointerDown(e: React.PointerEvent) {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    drag.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: rect.left,
      originY: rect.top,
      moved: false,
    }
    el.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    const el = ref.current
    if (!d || !el || e.pointerId !== d.id) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) < 6) return // below threshold — still a tap
    d.moved = true
    if (!dragging) setDragging(true)
    const w = el.offsetWidth
    const h = el.offsetHeight
    setPos({
      x: Math.max(8, Math.min(d.originX + dx, window.innerWidth - w - 8)),
      y: Math.max(8, Math.min(d.originY + dy, window.innerHeight - h - 8)),
    })
  }

  function endDrag(e: React.PointerEvent) {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    ref.current?.releasePointerCapture?.(e.pointerId)
    if (d.moved) {
      // Persist and briefly swallow the click so the drop doesn't open a chat.
      setPos((p) => {
        if (p) {
          try {
            localStorage.setItem(DOCK_POS_KEY, JSON.stringify(p))
          } catch {
            /* ignore */
          }
        }
        return p
      })
      setTimeout(() => setDragging(false), 0)
    }
    drag.current = null
  }

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={(e) => {
        // If this "click" concluded a drag, cancel it so no bubble opens.
        if (drag.current?.moved || dragging) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto", touchAction: "none" }
          : { touchAction: "none" }
      }
      className={cn(
        "fixed z-[65] flex touch-none select-none flex-col items-end gap-3",
        dragging ? "cursor-grabbing" : "cursor-grab",
        // Default anchor (bottom-right) until the reader drags it elsewhere.
        !pos && "right-3 bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]",
      )}
      role="region"
      aria-label="Reader chats — drag to move"
    >
      {children}
    </div>
  )
}

function DockBubble({
  chat,
  unread,
  index,
  onOpen,
  onClose,
}: {
  chat: ActiveChat
  unread: number
  index: number
  onOpen: () => void
  onClose: () => void
}) {
  return (
    <div
      className="relative duration-300 animate-in fade-in slide-in-from-right-4"
      style={{ zIndex: 40 + index }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open chat with ${chat.name}${unread ? `, ${unread} unread` : ""}`}
        className="group relative block size-14 rounded-full shadow-2xl transition-transform active:scale-95"
      >
        <Avatar className="size-full ring-2 ring-primary/40 ring-offset-2 ring-offset-background">
          {chat.image ? <AvatarImage src={chat.image} alt={chat.name} /> : null}
          <AvatarFallback className={cn("text-base font-semibold", getAvatarColor(chat.userId))}>
            {getInitials(chat.name)}
          </AvatarFallback>
        </Avatar>
        <span
          className="absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-background bg-chart-2"
          aria-hidden
        />
        {unread > 0 && (
          <span className="absolute -left-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[11px] font-bold leading-4 text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {/* Dismiss this bubble (frees a chat slot). */}
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close chat with ${chat.name}`}
        className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-colors hover:bg-secondary hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

function ChatWindow({ chat }: { chat: ActiveChat }) {
  const { closeChat, minimizeChat, sharedVerse, consumeSharedVerse } = useBibleFellowship()

  const [draft, setDraft] = useState("")
  const [showEmoji, setShowEmoji] = useState(false)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [sendingVoice, setSendingVoice] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  // Set when the recipient's chat dock is full and can't take a new message.
  const [capacityNotice, setCapacityNotice] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: messages, mutate } = useSWR(
    ["bible-chat", chat.conversationId],
    () => getDmMessages(chat.conversationId),
    { refreshInterval: 3500, revalidateOnFocus: true, keepPreviousData: true },
  )

  const { data: readState } = useSWR(
    ["bible-chat-read", chat.conversationId],
    () => getDmReadState(chat.conversationId),
    { refreshInterval: 4000, revalidateOnFocus: true },
  )

  const list = messages ?? []

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [list.length])

  // Returns true on success; false when the recipient can't receive it (full).
  const doSend = useCallback(
    async (payload: {
      body?: string
      attachmentUrl?: string | null
      attachmentType?: "image" | "audio" | null
      attachmentName?: string | null
    }): Promise<boolean> => {
      const res = await sendBibleReaderMessage({ conversationId: chat.conversationId, ...payload })
      if (!res.ok) {
        setCapacityNotice(res.recipientName)
        haptic("error")
        return false
      }
      setCapacityNotice(null)
      await mutate()
      endRef.current?.scrollIntoView({ behavior: "smooth" })
      return true
    },
    [chat.conversationId, mutate],
  )

  // Consume a verse shared from the reading pane into this open chat.
  useEffect(() => {
    if (!sharedVerse) return
    const body = `"${sharedVerse.text}"\n— ${sharedVerse.reference}`
    consumeSharedVerse()
    void doSend({ body }).catch(() => {})
    haptic("success")
  }, [sharedVerse, consumeSharedVerse, doSend])

  async function handleSendText() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setDraft("")
    setShowEmoji(false)
    haptic("light")
    try {
      const ok = await doSend({ body })
      if (!ok) setDraft(body) // keep their words so they can retry later
    } catch {
      setDraft(body)
    } finally {
      setSending(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setUploading(true)
    haptic("light")
    try {
      const toUpload = file.type.startsWith("image/") ? await compressImage(file) : file
      const name = file.name || "photo.jpg"
      const data = await uploadMedia(toUpload, "dm", name)
      await doSend({ attachmentUrl: data.url, attachmentType: "image", attachmentName: name })
    } catch {
      /* ignore upload errors */
    } finally {
      setUploading(false)
    }
  }

  async function handleVoice(blob: Blob, secs: number) {
    setSendingVoice(true)
    try {
      const label = `Voice message · ${secs}s`
      const data = await uploadMedia(blob, "dm", "voice-message.webm")
      await doSend({ attachmentUrl: data.url, attachmentType: "audio", attachmentName: label })
    } catch {
      /* ignore */
    } finally {
      setSendingVoice(false)
      setRecording(false)
    }
  }

  const lastSelf = [...list].reverse().find((m) => m.isSelf && !m.deleted)
  const seen = lastSelf && readState ? readState.otherLastReadAtMs >= lastSelf.createdAtMs : false

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[66] flex justify-center px-0 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:justify-end sm:px-0"
      role="dialog"
      aria-modal="false"
      aria-label={`Chat with ${chat.name}`}
    >
      <div className="flex h-[70vh] w-full flex-col overflow-hidden rounded-t-3xl border border-border/70 bg-card/90 shadow-2xl backdrop-blur-2xl duration-300 animate-in slide-in-from-bottom-8 sm:h-[30rem] sm:max-h-[70vh] sm:w-[22rem] sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-border/60 bg-background/40 px-3 py-2.5">
          <div className="relative">
            <Avatar className="size-9">
              {chat.image ? <AvatarImage src={chat.image} alt={chat.name} /> : null}
              <AvatarFallback className={cn("text-sm font-semibold", getAvatarColor(chat.userId))}>
                {getInitials(chat.name)}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-chart-2" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold leading-tight">{chat.name}</p>
            <p className="text-xs text-chart-2">Online</p>
          </div>
          <button
            type="button"
            onClick={minimizeChat}
            aria-label="Minimize chat"
            className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => closeChat(chat.conversationId)}
            aria-label="Close chat"
            className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
          {list.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
              <span className="text-2xl">🕊️</span>
              <p className="text-sm text-muted-foreground text-pretty">
                Say hello to {chat.name}. Keep reading — your chat floats right here.
              </p>
            </div>
          ) : (
            list.map((m) => <Bubble key={m.id} m={m} onImage={() => m.attachmentUrl && setLightbox(m.attachmentUrl)} />)
          )}
          {seen && (
            <div className="flex items-center justify-end gap-1 pr-1 text-[10px] text-muted-foreground">
              <CheckCheck className="size-3 text-primary" /> Seen
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Capacity notice — recipient's chat dock is full right now. */}
        {capacityNotice && (
          <div className="mx-3 mb-2 rounded-2xl border border-border/70 bg-secondary/60 px-3 py-2 text-xs text-muted-foreground text-pretty">
            <span className="font-semibold text-foreground">{capacityNotice}</span> is in several
            conversations right now and can&apos;t receive new messages. You&apos;ll be able to reach
            them once they&apos;re free again.
          </div>
        )}

        {/* Composer */}
        {recording ? (
          <div className="border-t border-border/60 p-2">
            <VoiceRecorder onSend={handleVoice} onCancel={() => setRecording(false)} sending={sendingVoice} />
          </div>
        ) : (
          <div className="border-t border-border/60 bg-background/40 p-2">
            {showEmoji && (
              <div className="mb-2 grid grid-cols-8 gap-1 rounded-2xl border border-border/60 bg-card p-2">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setDraft((d) => d + e)}
                    className="rounded-lg p-1 text-lg transition-colors hover:bg-secondary"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-1">
              <button
                type="button"
                onClick={() => setShowEmoji((v) => !v)}
                aria-label="Emoji"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Smile className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                aria-label="Send a photo"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <ImageIcon className={cn("size-5", uploading && "animate-pulse")} />
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    e.preventDefault()
                    void handleSendText()
                  }
                }}
                rows={1}
                placeholder={uploading ? "Uploading photo…" : "Message"}
                className="max-h-24 min-h-9 flex-1 resize-none rounded-2xl border border-border/60 bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Message"
              />
              {draft.trim() ? (
                <button
                  type="button"
                  onClick={() => void handleSendText()}
                  disabled={sending}
                  aria-label="Send"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-90 disabled:opacity-60"
                >
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setRecording(true)}
                  aria-label="Record voice message"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Mic className="size-5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {lightbox && <ImageLightbox src={lightbox} alt="Shared image" onClose={() => setLightbox(null)} />}
    </div>
  )
}

function Bubble({ m, onImage }: { m: DmMessageView; onImage: () => void }) {
  if (m.deleted) {
    return (
      <div className={cn("flex", m.isSelf ? "justify-end" : "justify-start")}>
        <div className="max-w-[80%] rounded-2xl bg-secondary/50 px-3 py-1.5 text-xs italic text-muted-foreground">
          This message was deleted
        </div>
      </div>
    )
  }
  const isImage = m.attachmentType === "image" && m.attachmentUrl
  const isAudio = m.attachmentType === "audio" && m.attachmentUrl
  return (
    <div className={cn("flex", m.isSelf ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] overflow-hidden rounded-2xl text-sm shadow-sm",
          isImage ? "p-1" : "px-3 py-1.5",
          m.isSelf ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
        )}
      >
        {isImage && (
          <button type="button" onClick={onImage} className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.attachmentUrl!} alt={m.attachmentName ?? "Shared image"} className="max-h-52 rounded-xl object-cover" />
          </button>
        )}
        {isAudio && <AudioMessage src={m.attachmentUrl!} mine={m.isSelf} className="min-w-[180px] px-1" />}
        {m.body && <p className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", (isImage || isAudio) && "px-2 pb-1 pt-1")}>{m.body}</p>}
        <span className={cn("mt-0.5 block text-[10px]", m.isSelf ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {formatChatTimestamp(m.createdAtMs)}
        </span>
      </div>
    </div>
  )
}
