"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { CheckCheck, ImageIcon, Loader2, Mic, Minus, Send, Smile, X } from "lucide-react"
import useSWR from "swr"
import {
  getDmMessages,
  getDmReadState,
  sendDirectMessage,
  type DmMessageView,
} from "@/app/actions/dm"
import { compressImage, uploadMedia } from "@/lib/upload-media"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AudioMessage } from "@/components/audio-message"
import { VoiceRecorder } from "@/components/voice-recorder"
import { ImageLightbox } from "@/components/image-lightbox"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import { useBibleFellowship } from "./fellowship-context"

const EMOJIS = ["🙏", "❤️", "🕊️", "✨", "🙌", "📖", "🔥", "😊", "😂", "🥰", "👍", "🎉", "🌿", "☀️", "💯", "🍞"]

export function BibleFloatingChat() {
  const { activeChat, chatMinimized } = useBibleFellowship()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || !activeChat) return null
  return chatMinimized ? <MinimizedBubble /> : <ChatWindow />
}

function ChatWindow() {
  const {
    activeChat,
    closeChat,
    minimizeChat,
    sharedVerse,
    consumeSharedVerse,
  } = useBibleFellowship()
  const chat = activeChat!

  const [draft, setDraft] = useState("")
  const [showEmoji, setShowEmoji] = useState(false)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [sendingVoice, setSendingVoice] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
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

  // Autoscroll to the newest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [list.length])

  const doSend = useCallback(
    async (payload: {
      body?: string
      attachmentUrl?: string | null
      attachmentType?: "image" | "audio" | null
      attachmentName?: string | null
    }) => {
      await sendDirectMessage({ conversationId: chat.conversationId, ...payload })
      await mutate()
      endRef.current?.scrollIntoView({ behavior: "smooth" })
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
      await doSend({ body })
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

  // Newest self message that the other user has already seen → "Seen".
  const lastSelf = [...list].reverse().find((m) => m.isSelf && !m.deleted)
  const seen =
    lastSelf && readState ? readState.otherLastReadAtMs >= lastSelf.createdAtMs : false

  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-[65] flex justify-center px-0 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:justify-end sm:px-0"
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
            <Minus className="size-4.5" />
          </button>
          <button
            type="button"
            onClick={closeChat}
            aria-label="Close chat"
            className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4.5" />
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
    </div>,
    document.body,
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
          {m.postedAt}
        </span>
      </div>
    </div>
  )
}

function MinimizedBubble() {
  const { activeChat, restoreChat } = useBibleFellowship()
  const chat = activeChat!

  const { data: messages } = useSWR(
    ["bible-chat", chat.conversationId],
    () => getDmMessages(chat.conversationId),
    { refreshInterval: 5000 },
  )
  const { data: readState } = useSWR(
    ["bible-chat-read-min", chat.conversationId],
    () => getDmReadState(chat.conversationId),
    { refreshInterval: 6000 },
  )

  // Unread = messages from the other person newer than the last time WE read.
  // We approximate "our last read" by the last self message time or our own
  // read marker; simplest robust proxy: count incoming after our newest self msg.
  const list = messages ?? []
  const lastSelfMs = [...list].reverse().find((m) => m.isSelf)?.createdAtMs ?? 0
  const unread = list.filter((m) => !m.isSelf && m.createdAtMs > lastSelfMs).length
  void readState

  // Drag + snap-to-edge.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const startRef = useRef({ px: 0, py: 0, x: 0, y: 0 })
  const SIZE = 60
  const MARGIN = 12

  useEffect(() => {
    // Default position: bottom-right.
    if (pos || typeof window === "undefined") return
    setPos({
      x: window.innerWidth - SIZE - MARGIN,
      y: window.innerHeight - SIZE - MARGIN - 72,
    })
  }, [pos])

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true
    movedRef.current = false
    startRef.current = { px: e.clientX, py: e.clientY, x: pos?.x ?? 0, y: pos?.y ?? 0 }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    const dx = e.clientX - startRef.current.px
    const dy = e.clientY - startRef.current.py
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true
    const x = Math.min(Math.max(MARGIN, startRef.current.x + dx), window.innerWidth - SIZE - MARGIN)
    const y = Math.min(Math.max(MARGIN + 56, startRef.current.y + dy), window.innerHeight - SIZE - MARGIN)
    setPos({ x, y })
  }
  const onPointerUp = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    // Snap to whichever horizontal edge is nearest.
    setPos((p) => {
      if (!p) return p
      const mid = p.x + SIZE / 2
      const snapX = mid < window.innerWidth / 2 ? MARGIN : window.innerWidth - SIZE - MARGIN
      return { ...p, x: snapX }
    })
    if (!movedRef.current) {
      haptic("light")
      restoreChat()
    }
  }

  if (!pos) return null

  return createPortal(
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      aria-label={`Open chat with ${chat.name}${unread ? `, ${unread} unread` : ""}`}
      className="fixed z-[65] touch-none rounded-full shadow-2xl transition-[left] duration-300 ease-out"
      style={{ left: pos.x, top: pos.y, width: SIZE, height: SIZE }}
    >
      <span className="relative block size-full">
        <Avatar className="size-full ring-2 ring-primary/40">
          {chat.image ? <AvatarImage src={chat.image} alt={chat.name} /> : null}
          <AvatarFallback className={cn("text-lg font-semibold", getAvatarColor(chat.userId))}>
            {getInitials(chat.name)}
          </AvatarFallback>
        </Avatar>
        <span className="absolute bottom-0 right-0 size-4 rounded-full border-2 border-background bg-chart-2" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[11px] font-bold leading-4 text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </span>
    </button>,
    document.body,
  )
}
