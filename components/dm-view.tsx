"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
  import { ArrowLeft, Ban, CalendarClock, ChevronDown, ChevronUp, Clock, Copy, CornerUpLeft, FileText, Flag, ImageIcon, Mic, MoreVertical, Music, Paperclip, Pencil, PhoneCall, Pin, PinOff, Search, Send, Shield, Smile, Trash2, Video, X } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ImageLightbox } from "@/components/image-lightbox"
import { VoiceRecorder } from "@/components/voice-recorder"
import { AudioMessage } from "@/components/audio-message"
import { DmCall } from "@/components/dm-call"
import { AppointmentThreadBanner } from "@/components/appointments/appointment-thread-banner"
import { cn } from "@/lib/utils"
import { haptic } from "@/lib/haptics"
import { extractFirstUrl } from "@/lib/linkify"
import { renderMessageBody } from "@/lib/rich-text"
import { ClampedText, CLAMP_LINES } from "@/components/clamped-text"
import { LinkPreview } from "@/components/link-preview"
import { compressImage, uploadMedia } from "@/lib/upload-media"
import { MediaCollage, type CollageMedia } from "@/components/chat/media-collage"
import { groupConsecutiveMedia } from "@/lib/media-grouping"
import {
  deleteDirectMessage,
  editDirectMessage,
  getDmMessages,
  sendDirectMessage,
  togglePinDirectMessage,
  type DmAttachmentType,
  type DmConversationDetail,
  type DmMessageView,
} from "@/app/actions/dm"
import { DM_DELETE_WINDOW_MS, DM_EDIT_WINDOW_MS } from "@/lib/dm-constants"
import { formatChatClock, formatChatDay, isNewChatDay } from "@/lib/format-timestamp"
import { ActionSheet, type SheetAction } from "@/components/action-sheet"
import { getActiveCall, startCall, type CallMode, type DmCallView } from "@/app/actions/dm-call"
import { ChatBackgroundSheet } from "@/components/chat-background-sheet"
import { CHAT_BACKGROUND_STORAGE_KEY, chatBackgroundStyle, getChatBackground } from "@/lib/chat-backgrounds"

const REPORT_REASONS = ["Spam", "Harassment", "Impersonation", "Inappropriate content", "Other"] as const

const EMOJIS = [
  "😀", "😂", "🥰", "😎", "🤔", "😴", "😭", "😡",
  "👍", "👎", "🙏", "👏", "🙌", "💪", "🔥", "✨",
  "❤️", "💔", "🎉", "🎶", "☀️", "🌙", "⭐", "✅",
  "🙋", "🕊️", "📖", "🍞", "☕", "🌿", "💯", "👀",
]

type PendingAttachment = { url: string; type: DmAttachmentType; name: string }

export function DmView({ detail }: { detail: DmConversationDetail }) {
  const [draft, setDraft] = useState("")
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const [pending, setPending] = useState<DmMessageView[]>([])
  const [recording, setRecording] = useState(false)
  const [sendingVoice, setSendingVoice] = useState(false)
  const scrollEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Header overflow menu + its features.
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeMatch, setActiveMatch] = useState(0)
  const [bgSheetOpen, setBgSheetOpen] = useState(false)
  const [bgId, setBgId] = useState("default")
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState<(typeof REPORT_REASONS)[number] | null>(null)
  const [reportDone, setReportDone] = useState(false)
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [flashId, setFlashId] = useState<number | null>(null)

  // Chat background is one global preference applied to every DM thread. Load
  // it on mount and keep in sync if another open conversation changes it (the
  // `storage` event fires across tabs; a custom event covers same-tab updates).
  useEffect(() => {
    const read = () => {
      try {
        const saved = localStorage.getItem(CHAT_BACKGROUND_STORAGE_KEY)
        setBgId(saved || "default")
      } catch {
        // ignore storage access errors
      }
    }
    read()
    const onStorage = (e: StorageEvent) => {
      if (e.key === CHAT_BACKGROUND_STORAGE_KEY) read()
    }
    window.addEventListener("storage", onStorage)
    window.addEventListener("dm-chat-bg-change", read)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("dm-chat-bg-change", read)
    }
  }, [])

  function selectBackground(id: string) {
    setBgId(id)
    try {
      localStorage.setItem(CHAT_BACKGROUND_STORAGE_KEY, id)
      // Notify other DM views mounted in this same tab (e.g. mini-chat docks).
      window.dispatchEvent(new Event("dm-chat-bg-change"))
    } catch {
      // ignore storage access errors
    }
  }

  const background = getChatBackground(bgId)
  const hasWallpaper = background.kind !== "default"

  const { data: liveMessages, mutate: mutateMessages } = useSWR(
    ["dm-messages", detail.id],
    () => getDmMessages(detail.id),
    { fallbackData: detail.messages, refreshInterval: 3000, revalidateOnFocus: true },
  )

  const serverMessages = liveMessages ?? detail.messages

  // Call signaling: poll for a ringing/active call in this conversation. Once a
  // call is dismissed locally we suppress that id until a newer one appears.
  const [dismissedCallId, setDismissedCallId] = useState<number | null>(null)
  const [starting, setStarting] = useState(false)
  const { data: activeCall, mutate: mutateCall } = useSWR<DmCallView | null>(
    ["dm-active-call", detail.id],
    () => getActiveCall({ conversationId: detail.id }),
    { refreshInterval: 2500, revalidateOnFocus: true },
  )

  const liveCall = activeCall && activeCall.id !== dismissedCallId ? activeCall : null

  async function beginCall(mode: CallMode) {
    setStarting(true)
    try {
      const call = await startCall({ conversationId: detail.id, mode })
      setDismissedCallId(null)
      await mutateCall(call, { revalidate: false })
    } finally {
      setStarting(false)
    }
  }

  useEffect(() => {
    setPending([])
  }, [serverMessages.length])

  const serverIds = new Set(serverMessages.map((m) => m.id))
  const messages = [...serverMessages, ...pending.filter((p) => !serverIds.has(p.id))]

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  // In-chat search: ids of messages whose text contains the query, in order.
  const matchIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return [] as number[]
    return messages.filter((m) => !m.deleted && m.body && m.body.toLowerCase().includes(q)).map((m) => m.id)
  }, [searchQuery, messages])

  const matchSet = useMemo(() => new Set(matchIds), [matchIds])

  function jumpToMatch(index: number) {
    const id = matchIds[index]
    if (id == null) return
    const el = document.getElementById(`dm-msg-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    setFlashId(id)
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1600)
  }

  // Reset to the first match whenever the result set changes, and reveal it.
  useEffect(() => {
    if (matchIds.length === 0) {
      setActiveMatch(0)
      return
    }
    setActiveMatch(0)
    const id = matchIds[0]
    const el = document.getElementById(`dm-msg-${id}`)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      setFlashId(id)
      window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1600)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchIds.join(",")])

  function stepMatch(dir: 1 | -1) {
    if (matchIds.length === 0) return
    const next = (activeMatch + dir + matchIds.length) % matchIds.length
    setActiveMatch(next)
    jumpToMatch(next)
  }

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setUploading(true)
    try {
      // Shrink large phone photos before upload for a much faster send.
      let toUpload: File | Blob = file
      let name = file.name
      if (file.type.startsWith("image/")) {
        const compressed = await compressImage(file)
        if (compressed !== file) {
          toUpload = compressed
          name = file.name.replace(/\.(heic|heif|png|webp|jpe?g)$/i, "") + ".jpg"
        }
      }
      const data = await uploadMedia(toUpload, "dm", name)
      setAttachment({ url: data.url, type: data.type, name: data.name })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleSendVoice(blob: Blob, durationSecs: number) {
    setSendingVoice(true)
    setUploadError(null)
    try {
      const fileName = `voice-note-${Date.now()}.webm`
      const data = await uploadMedia(blob, "dm", fileName)
      const label = `Voice note (${Math.floor(durationSecs / 60)}:${String(durationSecs % 60).padStart(2, "0")})`

      setRecording(false)
      setPending((prev) => [
        ...prev,
        {
          id: -Date.now(),
          senderId: detail.currentUserId,
          body: null,
          attachmentUrl: data.url,
          attachmentType: "audio",
          attachmentName: label,
          isSelf: true,
          postedAt: "now",
          createdAtMs: Date.now(),
          pinned: false,
          deleted: false,
          edited: false,
          statusId: null,
          statusActive: false,
          statusThumb: null,
        },
      ])

      await sendDirectMessage({
        conversationId: detail.id,
        attachmentUrl: data.url,
        attachmentType: "audio",
        attachmentName: label,
      })
      await mutateMessages()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Could not send voice note")
    } finally {
      setSendingVoice(false)
    }
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body && !attachment) return
    haptic("light")
    setDraft("")
    setShowEmoji(false)
    const sent = attachment
    setAttachment(null)

    setPending((prev) => [
      ...prev,
      {
        id: -Date.now(),
        senderId: detail.currentUserId,
        body,
        attachmentUrl: sent?.url ?? null,
        attachmentType: sent?.type ?? null,
        attachmentName: sent?.name ?? null,
        isSelf: true,
        postedAt: "now",
        createdAtMs: Date.now(),
        pinned: false,
        deleted: false,
        edited: false,
        statusId: null,
        statusActive: false,
        statusThumb: null,
      },
    ])

    void (async () => {
      await sendDirectMessage({
        conversationId: detail.id,
        body,
        attachmentUrl: sent?.url ?? null,
        attachmentType: sent?.type ?? null,
        attachmentName: sent?.name ?? null,
      })
      await mutateMessages()
    })()
  }

  async function handleDeleteMessage(id: number) {
    // Optimistically blank the message, then persist the soft-delete.
    await mutateMessages(
      (curr) => (curr ?? []).map((m) => (m.id === id ? { ...m, deleted: true, body: null, attachmentUrl: null } : m)),
      { revalidate: false },
    )
    try {
      await deleteDirectMessage(id)
    } finally {
      await mutateMessages()
    }
  }

  async function handleTogglePin(id: number, pinned: boolean) {
    await mutateMessages((curr) => (curr ?? []).map((m) => (m.id === id ? { ...m, pinned } : m)), {
      revalidate: false,
    })
    try {
      await togglePinDirectMessage({ messageId: id, pinned })
    } finally {
      await mutateMessages()
    }
  }

  async function handleEditMessage(id: number, body: string) {
    await mutateMessages(
      (curr) => (curr ?? []).map((m) => (m.id === id ? { ...m, body, edited: true } : m)),
      { revalidate: false },
    )
    try {
      await editDirectMessage({ messageId: id, body })
    } finally {
      await mutateMessages()
    }
  }

  return (
    <div
      // `dark` pins the entire chat surface to the dark palette regardless of the
      // app theme: chat wallpapers are dark imagery, so the scrim, header, bubbles
      // and composer must stay dark even in light mode (they'd otherwise wash out).
      className={cn("dark relative flex h-full flex-1 flex-col overflow-hidden font-display", !hasWallpaper && "bg-background")}
      style={chatBackgroundStyle(bgId)}
    >
      {/* Wallpaper legibility scrim spanning the full chat height so the dark
          tint reaches from the header all the way down past the composer,
          instead of cutting off where the message list ends. */}
      {hasWallpaper && <div className="pointer-events-none absolute inset-0 z-0 bg-background/45" aria-hidden />}
      {/* Header — sits above the message list (z-10) so the overflow menu
          dropdown renders on top of message bubbles instead of behind them. */}
      <div
        className={cn(
          // Pinned to the top with the notch respected, so only the conversation
          // scrolls. The identity block flexes and the action cluster is fixed
          // width, which stops the display name being clipped by the icons.
          "sticky top-0 z-30 flex items-center gap-1.5 border-b border-border/50 px-2 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.625rem)] sm:px-4",
          hasWallpaper ? "bg-background/60 backdrop-blur-xl" : "bg-background/80 backdrop-blur-xl",
        )}
      >
        <Link
          href="/messages"
          aria-label="Back to messages"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-9 shrink-0 rounded-full text-foreground")}
        >
          <ArrowLeft className="size-[18px]" />
        </Link>
        <Link href={`/u/${detail.otherUserId}`} className="flex min-w-0 flex-1 items-center gap-2.5">
          <Avatar className="size-9 shrink-0">
            {detail.image && <AvatarImage src={detail.image || "/placeholder.svg"} alt={detail.otherUserName} />}
            <AvatarFallback className={cn("text-xs", detail.color)}>{detail.initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold leading-tight tracking-tight text-foreground">
              {detail.otherUserName}
            </h1>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">{detail.otherUserHandle}</p>
          </div>
        </Link>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 rounded-full bg-secondary/70 text-foreground shadow-sm ring-1 ring-inset ring-border/40 transition-colors hover:bg-secondary"
            onClick={() => beginCall("audio")}
            disabled={starting || Boolean(liveCall)}
            aria-label="Start voice call"
          >
            <PhoneCall className="size-[18px]" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 rounded-full bg-primary/15 text-primary shadow-sm ring-1 ring-inset ring-primary/25 transition-colors hover:bg-primary/25"
            onClick={() => beginCall("video")}
            disabled={starting || Boolean(liveCall)}
            aria-label="Start video call"
          >
            <Video className="size-[18px]" />
          </Button>
          {/* Overflow menu sits to the right of the call icons. */}
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="More options"
            >
              <MoreVertical className="size-[18px]" />
            </Button>
            {menuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-2xl border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-xl"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      setSearchOpen(true)
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary"
                  >
                    <Search className="size-4 shrink-0 text-muted-foreground" /> Search
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      setBgSheetOpen(true)
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary"
                  >
                    <ImageIcon className="size-4 shrink-0 text-muted-foreground" /> Chat background
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      setReportDone(false)
                      setReportReason(null)
                      setReportOpen(true)
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary"
                  >
                    <Flag className="size-4 shrink-0 text-muted-foreground" /> Report user
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      if (blocked) setBlocked(false)
                      else setBlockConfirmOpen(true)
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Ban className="size-4 shrink-0" /> {blocked ? "Unblock user" : "Block user"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* In-chat search overlay */}
      {searchOpen && (
        <div className="relative z-20 flex items-center gap-2 border-b border-border/60 bg-background px-3 py-2 sm:px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search this conversation"
            aria-label="Search messages"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
            {matchIds.length > 0 ? `${activeMatch + 1} of ${matchIds.length}` : searchQuery.trim() ? "No matches" : ""}
          </span>
          <div className="flex shrink-0 items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => stepMatch(-1)}
              disabled={matchIds.length === 0}
              aria-label="Previous match"
            >
              <ChevronUp className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => stepMatch(1)}
              disabled={matchIds.length === 0}
              aria-label="Next match"
            >
              <ChevronDown className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => {
                setSearchOpen(false)
                setSearchQuery("")
              }}
              aria-label="Close search"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {liveCall && (
        <DmCall
          call={liveCall}
          peer={{
            name: detail.otherUserName,
            initials: detail.initials,
            color: detail.color,
            image: detail.image,
          }}
          onClosed={() => {
            setDismissedCallId(liveCall.id)
            void mutateCall()
          }}
        />
      )}

      {/* Appointment thread header card (renders only for appointment threads). */}
      <AppointmentThreadBanner conversationId={detail.id} />

      {/* Messages */}
      <div className={cn("relative z-10 flex-1 overflow-y-auto", !hasWallpaper && "bg-card/30")}>
        {/* Vertical rhythm is set per-run with margins (tight for a continued
            run, looser when the speaker or day changes), so no `gap` here. */}
        <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col px-3 py-4 sm:px-6">
          {messages.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No messages yet. Say hello to {detail.otherUserName}.
            </p>
          )}
          {groupConsecutiveMedia(
            messages,
            (m) => ({
              senderKey: m.isSelf ? "self" : `u-${m.senderId}`,
              createdAtMs: m.createdAtMs,
              // Only pure, non-quoted photo/video messages group together.
              groupable:
                !m.deleted &&
                !m.body &&
                m.statusId == null &&
                !!m.attachmentUrl &&
                (m.attachmentType === "image" || m.attachmentType === "video"),
            }),
            (m) => m.id,
          ).map((run, i, runs) => {
            // A run's leading message drives both the day separator and the
            // "is this a continuation of the same sender" decision, which is
            // what lets consecutive messages tuck together without repeating
            // the avatar and timestamp on every single bubble.
            const lead = run.type === "single" ? run.item : run.items[0]
            const prevRun = runs[i - 1]
            const prev = prevRun ? (prevRun.type === "single" ? prevRun.item : prevRun.items.at(-1)!) : null
            const newDay = isNewChatDay(lead.createdAtMs, prev?.createdAtMs ?? null)
            // Same sender, within five minutes, and no day break in between.
            const continues =
              !newDay &&
              !!prev &&
              prev.isSelf === lead.isSelf &&
              prev.senderId === lead.senderId &&
              lead.createdAtMs - prev.createdAtMs < 5 * 60_000

            return (
              <div key={run.type === "single" ? run.item.id : run.key} className={cn(continues ? "mt-0.5" : "mt-3")}>
                {newDay && (
                  <div className="flex justify-center py-2">
                    <span className="rounded-full border border-border/50 bg-background/70 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur-sm">
                      {formatChatDay(lead.createdAtMs)}
                    </span>
                  </div>
                )}
                {run.type === "single" ? (
                  <DmBubble
                    message={run.item}
                    color={run.item.isSelf ? detail.currentUserColor : detail.color}
                    initials={run.item.isSelf ? detail.currentUserInitials : detail.initials}
                    image={run.item.isSelf ? detail.currentUserImage : detail.image}
                    name={run.item.isSelf ? "You" : detail.otherUserName}
                    highlighted={matchSet.has(run.item.id)}
                    flashed={flashId === run.item.id}
                    grouped={continues}
                    onDelete={handleDeleteMessage}
                    onTogglePin={handleTogglePin}
                    onEdit={handleEditMessage}
                  />
                ) : (
                  <DmMediaGroup
                    messages={run.items}
                    color={run.items[0].isSelf ? detail.currentUserColor : detail.color}
                    initials={run.items[0].isSelf ? detail.currentUserInitials : detail.initials}
                    image={run.items[0].isSelf ? detail.currentUserImage : detail.image}
                    name={run.items[0].isSelf ? "You" : detail.otherUserName}
                    flashId={flashId}
                    onDelete={handleDeleteMessage}
                    onTogglePin={handleTogglePin}
                  />
                )}
              </div>
            )
          })}
          <div ref={scrollEndRef} />
        </div>
      </div>

      {/* Composer — replaced by a blocked notice while this user is blocked */}
      {blocked ? (
        <div
          className={cn(
            "relative z-10 border-t border-border/60 px-4 py-4 pb-safe-2 pl-safe pr-safe sm:px-6",
            hasWallpaper ? "bg-background/40 backdrop-blur-md" : "bg-background",
          )}
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-2 rounded-2xl bg-secondary/60 px-4 py-4 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <Ban className="size-5" />
            </span>
            <p className="text-sm font-medium">You&apos;ve blocked this user</p>
            <p className="text-xs text-muted-foreground">
              You can&apos;t send messages in this chat. Unblock to start messaging again.
            </p>
            <button
              type="button"
              onClick={() => setBlocked(false)}
              className="mt-1 rounded-full bg-secondary px-4 py-1.5 text-sm font-medium transition-colors hover:bg-secondary/80"
            >
              Unblock
            </button>
          </div>
        </div>
      ) : (
      <div
        className={cn(
          "sticky bottom-0 z-10 border-t border-border/50 px-2.5 py-2 pb-safe-2 pl-safe pr-safe sm:px-6",
          hasWallpaper ? "bg-background/60 backdrop-blur-xl" : "bg-background",
        )}
      >
        <div className="mx-auto w-full max-w-3xl space-y-2">
          {attachment && (
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3">
              {attachment.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={attachment.url || "/placeholder.svg"} alt={attachment.name} className="size-12 rounded-md object-cover" />
              ) : attachment.type === "video" ? (
                <video src={attachment.url} className="size-12 rounded-md object-cover" />
              ) : (
                <span className="flex size-12 items-center justify-center rounded-md bg-secondary">
                  {attachment.type === "audio" ? <Music className="size-5" /> : <FileText className="size-5" />}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{attachment.name}</span>
              <Button type="button" variant="ghost" size="icon" onClick={() => setAttachment(null)} aria-label="Remove attachment">
                <X className="size-4" />
              </Button>
            </div>
          )}
          {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

          {showEmoji && (
            <div className="grid grid-cols-8 gap-1 rounded-xl border border-border/60 bg-card p-3">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setDraft((d) => d + emoji)}
                  className="flex size-9 items-center justify-center rounded-md text-xl transition-colors hover:bg-secondary"
                  aria-label={`Add ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {recording ? (
            <VoiceRecorder
              onSend={handleSendVoice}
              onCancel={() => setRecording(false)}
              sending={sendingVoice}
            />
          ) : (
            <form onSubmit={handleSend} className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip"
                className="hidden"
                onChange={handleFilePick}
              />
              {/* One rounded pill holds the attach button, the input and the
                  emoji trigger, so the composer reads as a single control
                  instead of a row of loose buttons. */}
              <div className="flex min-w-0 flex-1 items-center gap-1 rounded-full border border-border/60 bg-secondary/60 pl-1 pr-1.5">
                <button
                  type="button"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  aria-label="Attach a file"
                >
                  <Paperclip className={cn("size-[18px]", uploading && "animate-pulse")} />
                </button>
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={uploading ? "Uploading attachment…" : "Message"}
                  aria-label="Message"
                  className="h-10 min-w-0 flex-1 border-0 bg-transparent px-0 text-[15px] shadow-none focus-visible:ring-0"
                />
                <button
                  type="button"
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-foreground/5",
                    showEmoji ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setShowEmoji((s) => !s)}
                  aria-label="Toggle emoji picker"
                  aria-expanded={showEmoji}
                >
                  <Smile className="size-[18px]" />
                </button>
              </div>
              {draft.trim() || attachment ? (
                <Button
                  type="submit"
                  size="icon"
                  className="size-11 shrink-0 rounded-full shadow-lg shadow-primary/20"
                  disabled={uploading}
                  aria-label="Send message"
                >
                  <Send className="size-[18px]" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="icon"
                  className="size-11 shrink-0 rounded-full shadow-lg shadow-primary/20"
                  onClick={() => {
                    setShowEmoji(false)
                    setRecording(true)
                  }}
                  disabled={uploading}
                  aria-label="Record a voice note"
                >
                  <Mic className="size-[18px]" />
                </Button>
              )}
            </form>
          )}
        </div>
      </div>
      )}

      {/* Chat background picker (one global preference for all DM threads) */}
      <ChatBackgroundSheet
        open={bgSheetOpen}
        current={bgId}
        onSelect={selectBackground}
        onClose={() => setBgSheetOpen(false)}
        subtitle="Applies to all your chats"
      />

      {/* Report user modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close report dialog"
            onClick={() => setReportOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative z-10 m-3 w-full max-w-sm overflow-hidden rounded-3xl border border-border/70 bg-card p-5 shadow-2xl">
            {reportDone ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <span className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Shield className="size-6" />
                </span>
                <h3 className="text-base font-bold">Report submitted</h3>
                <p className="text-sm text-muted-foreground">
                  Thanks for letting us know. Our team will review {detail.otherUserName}.
                </p>
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  className="mt-1 rounded-full bg-secondary px-5 py-2 text-sm font-medium transition-colors hover:bg-secondary/80"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
                    <Flag className="size-[18px]" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold">Report {detail.otherUserName}</h3>
                    <p className="text-xs text-muted-foreground">Choose a reason</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {REPORT_REASONS.map((reason) => {
                    const active = reportReason === reason
                    return (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setReportReason(reason)}
                        aria-pressed={active}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors",
                          active
                            ? "border-primary bg-primary/10 font-medium"
                            : "border-border/70 hover:bg-secondary",
                        )}
                      >
                        {reason}
                        <span
                          className={cn(
                            "size-4 rounded-full border-2 transition-colors",
                            active ? "border-primary bg-primary" : "border-muted-foreground/50",
                          )}
                        />
                      </button>
                    )
                  })}
                </div>
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setReportOpen(false)}
                    className="flex-1 rounded-full bg-secondary px-4 py-2.5 text-sm font-medium transition-colors hover:bg-secondary/80"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!reportReason}
                    onClick={() => {
                      haptic("light")
                      setReportDone(true)
                    }}
                    className="flex-1 rounded-full bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
                  >
                    Submit report
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Block user confirmation */}
      {blockConfirmOpen && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Cancel block"
            onClick={() => setBlockConfirmOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative z-10 m-3 w-full max-w-sm overflow-hidden rounded-3xl border border-border/70 bg-card p-5 text-center shadow-2xl">
            <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <Ban className="size-6" />
            </span>
            <h3 className="text-base font-bold">Block {detail.otherUserName}?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              They won&apos;t be able to message you, and you won&apos;t be able to send messages in this chat until you
              unblock them.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setBlockConfirmOpen(false)}
                className="flex-1 rounded-full bg-secondary px-4 py-2.5 text-sm font-medium transition-colors hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  haptic("warning")
                  setBlocked(true)
                  setBlockConfirmOpen(false)
                }}
                className="flex-1 rounded-full bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
              >
                Block
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// The auto-seeded "Appointment booked" system message is a plain DM row, but we
// lift it out of the normal left/right bubble and present it as a centered,
// premium confirmation card. This parses its known line format back into fields.
function parseAppointmentSummary(body: string | null) {
  if (!body || !body.startsWith("Appointment booked:")) return null
  const lines = body.split("\n")
  const pick = (prefix: string) => {
    const line = lines.find((l) => l.startsWith(prefix))
    return line ? line.slice(prefix.length).trim() : null
  }
  const title = lines[0].slice("Appointment booked:".length).trim()
  const whenRaw = pick("When:")
  let whenLabel = whenRaw
  if (whenRaw) {
    const d = new Date(whenRaw)
    if (!Number.isNaN(d.getTime())) {
      whenLabel = d.toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    }
  }
  return {
    title,
    when: whenLabel,
    duration: pick("Duration:"),
    meeting: pick("Meeting:") ?? pick("Location:"),
    payment: pick("Payment:"),
  }
}

function DmBubble({
  message: m,
  color,
  initials,
  image,
  name,
  highlighted = false,
  flashed = false,
  grouped = false,
  onDelete,
  onTogglePin,
  onEdit,
}: {
  message: DmMessageView
  color: string
  initials: string
  image: string | null
  name: string
  highlighted?: boolean
  flashed?: boolean
  /**
   * This message continues a run from the same sender, so the avatar slot is
   * left empty and the timestamp is suppressed — the reader already knows who
   * is speaking and roughly when.
   */
  grouped?: boolean
  onDelete: (id: number) => void
  onTogglePin: (id: number, pinned: boolean) => void
  onEdit: (id: number, body: string) => void
}) {
  const [lightbox, setLightbox] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState(m.body ?? "")
  const [copied, setCopied] = useState(false)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Only persisted (positive id), non-deleted messages can be acted on.
  const actionable = m.id > 0 && !m.deleted
  const canDeleteMsg = actionable && m.isSelf && Date.now() - m.createdAtMs < DM_DELETE_WINDOW_MS
  const canEditMsg = actionable && m.isSelf && !!m.body && Date.now() - m.createdAtMs < DM_EDIT_WINDOW_MS

  // A link in the body gets a WhatsApp-style rich preview card. When the body is
  // nothing but the link, we hide the raw text and let the card carry it.
  const previewUrl = m.body && !editing && !m.deleted ? extractFirstUrl(m.body) : null
  const bodyIsOnlyLink = !!previewUrl && m.body?.trim().split(/\s+/).length === 1

  function startPress() {
    if (!actionable) return
    longPressRef.current = setTimeout(() => setMenuOpen(true), 450)
  }
  function cancelPress() {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }

  function copyText() {
    if (!m.body) return
    navigator.clipboard?.writeText(m.body).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  const actions: SheetAction[] = []
  if (m.body) actions.push({ label: "Copy", icon: Copy, onClick: copyText })
  if (canEditMsg) actions.push({ label: "Edit", icon: Pencil, onClick: () => { setEditDraft(m.body ?? ""); setEditing(true) } })
  actions.push({ label: m.pinned ? "Unpin" : "Pin", icon: m.pinned ? PinOff : Pin, onClick: () => onTogglePin(m.id, !m.pinned) })
  if (canDeleteMsg) actions.push({ label: "Delete", icon: Trash2, destructive: true, onClick: () => onDelete(m.id) })

  // Deleted messages keep their slot but show a tombstone instead of content.
  if (m.deleted) {
    return (
      <div id={`dm-msg-${m.id}`} className={cn("flex scroll-mt-24 gap-3", m.isSelf && "flex-row-reverse")}>
        <Avatar className="size-7 shrink-0">
          {image && <AvatarImage src={image || "/placeholder.svg"} alt={name} />}
          <AvatarFallback className={cn("text-[10px]", color)}>{initials}</AvatarFallback>
        </Avatar>
        <div className={cn("max-w-[75%] space-y-0.5", m.isSelf && "text-right")}>
          <span className="px-1 text-[10px] font-medium text-muted-foreground/70">{formatChatClock(m.createdAtMs)}</span>
          <div
            className={cn(
              "inline-flex items-center gap-1.5 rounded-2xl border border-dashed border-border/70 px-3 py-2 text-sm italic text-muted-foreground",
              m.isSelf ? "rounded-tr-sm" : "rounded-tl-sm",
            )}
          >
            <Trash2 className="size-3.5 shrink-0" /> This message was deleted
          </div>
        </div>
      </div>
    )
  }

  // Appointment confirmation — a centered, premium card rather than a bubble.
  const appt = parseAppointmentSummary(m.body)
  if (appt) {
    return (
      <div id={`dm-msg-${m.id}`} className="flex scroll-mt-24 justify-center px-2 py-1">
        <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-primary/30 bg-card p-5 text-center shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)]">
          <div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-inset ring-primary/25">
            <CalendarClock className="size-5" />
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">Appointment booked</p>
          {appt.title && (
            <h3 className="mt-1 font-display text-lg font-semibold tracking-tight text-foreground text-balance">
              {appt.title}
            </h3>
          )}
          <div className="mx-auto mt-4 flex flex-col items-center gap-2.5 text-sm">
            {appt.when && (
              <span className="inline-flex items-center gap-2 font-medium text-foreground">
                <CalendarClock className="size-4 shrink-0 text-primary/70" />
                {appt.when}
              </span>
            )}
            {appt.duration && (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Clock className="size-4 shrink-0 text-primary/70" />
                {appt.duration}
              </span>
            )}
            {appt.meeting && (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Video className="size-4 shrink-0 text-primary/70" />
                {appt.meeting}
              </span>
            )}
          </div>
          {appt.payment && (
            <span
              className={cn(
                "mt-4 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold capitalize",
                appt.payment === "pending"
                  ? "bg-amber-500/15 text-amber-500"
                  : "bg-primary/15 text-primary",
              )}
            >
              {appt.payment === "paid" ? "Paid" : appt.payment === "free" ? "Free" : "Payment pending"}
            </span>
          )}
          <p className="mt-3 text-[10px] font-medium text-muted-foreground/60">{formatChatClock(m.createdAtMs)}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      id={`dm-msg-${m.id}`}
      className={cn(
        "flex scroll-mt-24 gap-3 rounded-2xl transition-colors",
        m.isSelf && "flex-row-reverse",
        flashed ? "bg-primary/15 ring-2 ring-primary/60" : highlighted && "ring-1 ring-primary/40",
        (flashed || highlighted) && "p-1.5",
      )}
    >
      {grouped ? (
        // Keeps the bubble column aligned without repeating the avatar.
        <span className="size-7 shrink-0" aria-hidden />
      ) : (
        <Avatar className="size-7 shrink-0">
          {image && <AvatarImage src={image || "/placeholder.svg"} alt={name} />}
          <AvatarFallback className={cn("text-[10px]", color)}>{initials}</AvatarFallback>
        </Avatar>
      )}
      <div className={cn("relative max-w-[78%] space-y-1", m.isSelf && "text-right")}>
        {(!grouped || m.pinned || m.edited || copied) && (
          <span
            className={cn(
              "flex items-center gap-1 px-1 text-[10px] font-medium text-muted-foreground/70",
              m.isSelf && "justify-end",
            )}
          >
            {m.pinned && <Pin className="size-2.5 fill-current" aria-label="Pinned" />}
            {!grouped && formatChatClock(m.createdAtMs)}
            {m.edited && <span>· edited</span>}
            {copied && <span className="text-primary">Copied</span>}
          </span>
        )}
        <div
          onPointerDown={startPress}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
          onContextMenu={(e) => {
            if (!actionable) return
            e.preventDefault()
            setMenuOpen(true)
          }}
          className={cn(
            "inline-block select-none overflow-hidden rounded-2xl text-[15px] leading-relaxed",
            // A message that is nothing but a URL renders as a bare link-preview
            // card. Wrapping it in a tinted bubble produced the oversized orange
            // slab in the old design, so the bubble chrome is dropped entirely
            // and the card itself becomes the message surface.
            bodyIsOnlyLink
              ? "bg-transparent"
              : cn(
                  "shadow-sm",
                  m.attachmentType === "image" || m.attachmentType === "video" ? "p-1" : "px-3.5 py-2",
                  m.isSelf
                    ? // Outgoing: a solid, fully opaque accent fill so bubbles never
                      // let a chat wallpaper bleed through.
                      "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md bg-secondary text-foreground ring-1 ring-inset ring-border/50",
                ),
          )}
        >
          {m.statusId != null &&
            (m.statusActive ? (
              <Link
                href={`/status/${m.statusId}`}
                className={cn(
                  "mb-1.5 flex items-center gap-2 rounded-lg bg-foreground/5 p-1.5 text-left transition-opacity hover:opacity-80",
                )}
              >
                {m.statusThumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.statusThumb || "/placeholder.svg"} alt="" className="size-9 shrink-0 rounded-md object-cover" />
                ) : (
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary"
                  >
                    <CornerUpLeft className="size-4" />
                  </span>
                )}
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="text-xs font-medium">Reply to status</span>
                  <span className="text-[11px] text-muted-foreground">Tap to view</span>
                </span>
              </Link>
            ) : (
              <div
                className={cn(
                  "mb-1.5 flex items-center gap-2 rounded-lg bg-foreground/5 p-1.5",
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                  <CornerUpLeft className="size-4 opacity-60" />
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="text-xs font-medium opacity-80">Reply to status</span>
                  <span className="text-[11px] text-muted-foreground">Status expired</span>
                </span>
              </div>
            ))}
          {m.attachmentUrl && m.attachmentType === "image" && (
            <>
              <button type="button" onClick={() => setLightbox(true)} className="block" aria-label="Expand image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.attachmentUrl || "/placeholder.svg"} alt={m.attachmentName ?? "Shared image"} className="max-h-64 rounded-xl object-cover" />
              </button>
              {lightbox && <ImageLightbox src={m.attachmentUrl} alt={m.attachmentName ?? "Shared image"} onClose={() => setLightbox(false)} />}
            </>
          )}
          {m.attachmentUrl && m.attachmentType === "video" && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={m.attachmentUrl} controls className="max-h-64 rounded-xl" />
          )}
          {m.attachmentUrl && m.attachmentType === "audio" && (
            <AudioMessage src={m.attachmentUrl} mine={m.isSelf} className="min-w-[200px] px-1" />
          )}
          {m.attachmentUrl && m.attachmentType === "document" && (
            <a
              href={m.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-foreground underline-offset-2 hover:underline"
            >
              <FileText className="size-4 shrink-0" />
              <span className="truncate">{m.attachmentName ?? "Document"}</span>
            </a>
          )}
          {m.body && !editing && !bodyIsOnlyLink && (
            <ClampedText
              lines={CLAMP_LINES.CHAT}
              className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", m.attachmentUrl && "px-2 pb-1 pt-1.5")}
              // Inherit the bubble's own text colour so the toggle stays legible
              // on both the solid accent (outgoing) and secondary (incoming) fills.
              toggleClassName={cn("text-current opacity-70 hover:opacity-100", m.attachmentUrl && "px-2")}
            >
              {renderMessageBody(m.body, {
                link: true,
                linkClassName: "font-medium underline underline-offset-2 [overflow-wrap:anywhere] hover:opacity-80",
              })}
            </ClampedText>
          )}
          {previewUrl && (
            <div className={cn("w-full", !bodyIsOnlyLink && "pt-1")}>
              <LinkPreview url={previewUrl} compact />
            </div>
          )}
          {m.body && editing && (
            <form
              className="flex flex-col gap-2 p-1"
              onSubmit={(e) => {
                e.preventDefault()
                const next = editDraft.trim()
                if (next && next !== m.body) onEdit(m.id, next)
                setEditing(false)
              }}
            >
              <textarea
                autoFocus
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg bg-background/60 px-2 py-1 text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-ring"
              />
              <div className="flex justify-end gap-2 text-xs">
                <button type="button" onClick={() => setEditing(false)} className="rounded-md px-2 py-1 hover:bg-background/40">
                  Cancel
                </button>
                <button type="submit" className="rounded-md bg-background/70 px-2 py-1 font-medium text-foreground hover:bg-background">
                  Save
                </button>
              </div>
            </form>
          )}
        </div>

        <ActionSheet
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          title={m.isSelf ? "Your message" : name}
          preview={m.body ?? m.attachmentName ?? undefined}
          actions={actions}
        />
      </div>
    </div>
  )
}

/**
 * Renders a run of consecutive photo/video messages (same sender, within 3
 * minutes) as one WhatsApp-style collage bubble. Keeps the same avatar +
 * timestamp chrome as a normal bubble; each tile stays individually openable in
 * the viewer and long-pressable for pin/delete, so no per-message behaviour is
 * lost — only the visual layout is grouped.
 */
function DmMediaGroup({
  messages,
  color,
  initials,
  image,
  name,
  flashId,
  onDelete,
  onTogglePin,
}: {
  messages: DmMessageView[]
  color: string
  initials: string
  image: string | null
  name: string
  flashId: number | null
  onDelete: (id: number) => void
  onTogglePin: (id: number, pinned: boolean) => void
}) {
  const isSelf = messages[0].isSelf
  // WhatsApp shows one timestamp for the group — use the most recent item's.
  const lastMs = messages[messages.length - 1].createdAtMs
  const anyPinned = messages.some((m) => m.pinned)
  const flashed = flashId != null && messages.some((m) => m.id === flashId)

  const media: CollageMedia[] = messages.map((m) => ({
    key: m.id,
    anchorId: `dm-msg-${m.id}`,
    url: m.attachmentUrl as string,
    type: m.attachmentType === "video" ? "video" : "image",
    name: m.attachmentName,
  }))

  function buildActions(index: number): SheetAction[] {
    const m = messages[index]
    if (m.id <= 0 || m.deleted) return []
    const actions: SheetAction[] = [
      { label: m.pinned ? "Unpin" : "Pin", icon: m.pinned ? PinOff : Pin, onClick: () => onTogglePin(m.id, !m.pinned) },
    ]
    if (m.isSelf && Date.now() - m.createdAtMs < DM_DELETE_WINDOW_MS) {
      actions.push({ label: "Delete", icon: Trash2, destructive: true, onClick: () => onDelete(m.id) })
    }
    return actions
  }

  return (
    <div className={cn("flex scroll-mt-24 gap-3", isSelf && "flex-row-reverse")}>
      <Avatar className="size-7 shrink-0">
        {image && <AvatarImage src={image || "/placeholder.svg"} alt={name} />}
        <AvatarFallback className={cn("text-[10px]", color)}>{initials}</AvatarFallback>
      </Avatar>
      <div className={cn("flex max-w-[78%] flex-col gap-1", isSelf && "items-end text-right")}>
        <span
          className={cn(
            "flex items-center gap-1 px-1 text-[10px] font-medium text-muted-foreground/70",
            isSelf && "justify-end",
          )}
        >
          {anyPinned && <Pin className="size-2.5 fill-current" aria-label="Pinned" />}
          {formatChatClock(lastMs)}
        </span>
        <MediaCollage
          items={media}
          mine={isSelf}
          buildActions={buildActions}
          className={cn(
            "shadow-sm ring-1 ring-inset ring-border/40",
            isSelf ? "rounded-2xl rounded-tr-md" : "rounded-2xl rounded-tl-md",
            flashed && "ring-2 ring-primary/60",
          )}
        />
      </div>
    </div>
  )
}
