"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import useSWR from "swr"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Check,
  Copy,
  FileText,
  ImageIcon,
  LogOut,
  Mic,
  Music,
  Paperclip,
  Phone,
  Pin,
  PinOff,
  Send,
  Smile,
  Trash2,
  Users,
  X,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ImageLightbox } from "@/components/image-lightbox"
import { ImageCropper } from "@/components/image-cropper"
import { VoiceRecorder } from "@/components/voice-recorder"
import { ChatroomCall } from "@/components/chatroom-call"
import { cn } from "@/lib/utils"
import { uploadMedia } from "@/lib/upload-media"
import {
  approveJoinRequest,
  deleteChatMessage,
  getChatMessages,
  leaveChatroom,
  rejectJoinRequest,
  sendChatMessage,
  togglePinMessage,
  updateChatroomImage,
  type ChatAttachmentType,
  type ChatMessageView,
  type ChatroomDetail,
} from "@/app/actions/chatroom"

const EMOJIS = [
  "😀", "😂", "🥰", "😎", "🤔", "😴", "😭", "😡",
  "👍", "👎", "🙏", "👏", "🙌", "💪", "🔥", "✨",
  "❤️", "💔", "🎉", "🎶", "☀️", "🌙", "⭐", "✅",
  "🙋", "🕊️", "📖", "🍞", "☕", "🌿", "💯", "👀",
]

type PendingAttachment = {
  url: string
  type: ChatAttachmentType
  name: string
}

export function ChatroomView({ detail }: { detail: ChatroomDetail }) {
  const router = useRouter()
  const [draft, setDraft] = useState("")
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [showMembers, setShowMembers] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [recording, setRecording] = useState(false)
  const [sendingVoice, setSendingVoice] = useState(false)
  // Bumped when the header call button is tapped to tell ChatroomCall to join.
  const [callStartNonce, setCallStartNonce] = useState(0)
  const [isLeaving, startLeave] = useTransition()
  // Optimistic messages shown instantly while the server round-trips.
  const [pending, setPending] = useState<ChatMessageView[]>([])
  const scrollEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Poll for new messages every 3s so the room updates in real time without a
  // manual refresh. The server-rendered messages seed the initial data.
  const { data: liveMessages, mutate: mutateMessages } = useSWR(
    ["chat-messages", detail.id],
    () => getChatMessages(detail.id),
    {
      fallbackData: detail.messages,
      refreshInterval: 3000,
      revalidateOnFocus: true,
    },
  )

  const serverMessages = liveMessages ?? detail.messages

  // Drop optimistic messages once a matching server message arrives.
  useEffect(() => {
    setPending([])
  }, [serverMessages.length])

  // Avoid showing an optimistic copy alongside its persisted server version.
  const serverIds = new Set(serverMessages.map((m) => m.id))
  const messages = [...serverMessages, ...pending.filter((p) => !serverIds.has(p.id))]

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setUploading(true)
    try {
      const data = await uploadMedia(file, "chat")
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
      const data = await uploadMedia(blob, "chat", fileName)
      const label = `Voice note (${Math.floor(durationSecs / 60)}:${String(durationSecs % 60).padStart(2, "0")})`

      setRecording(false)
      setPending((prev) => [
        ...prev,
        {
          id: -Date.now(),
          userId: detail.currentUserId,
          userName: "You",
          initials: detail.currentUserInitials,
          color: detail.currentUserColor,
          body: null,
          attachmentUrl: data.url,
          attachmentType: "audio",
          attachmentName: label,
          postedAt: "now",
          isSelf: true,
          pinned: false,
          deleted: false,
        },
      ])

      await sendChatMessage({
        chatroomId: detail.id,
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
    setDraft("")
    setShowEmoji(false)
    const sentAttachment = attachment
    setAttachment(null)

    // Show the message immediately for a snappy feel.
    setPending((prev) => [
      ...prev,
      {
        id: -Date.now(),
        userId: detail.currentUserId,
        userName: "You",
        initials: detail.currentUserInitials,
        color: detail.currentUserColor,
        body,
        attachmentUrl: sentAttachment?.url ?? null,
        attachmentType: sentAttachment?.type ?? null,
        attachmentName: sentAttachment?.name ?? null,
        postedAt: "now",
        isSelf: true,
        pinned: false,
        deleted: false,
      },
    ])

    void (async () => {
      await sendChatMessage({
        chatroomId: detail.id,
        body,
        attachmentUrl: sentAttachment?.url ?? null,
        attachmentType: sentAttachment?.type ?? null,
        attachmentName: sentAttachment?.name ?? null,
      })
      // Pull the persisted message in immediately rather than waiting for the poll.
      await mutateMessages()
    })()
  }

  function handleLeave() {
    startLeave(async () => {
      await leaveChatroom(detail.id)
      router.push("/chatrooms")
    })
  }

  async function handleDeleteMessage(messageId: number) {
    // Optimistically mark deleted, then persist.
    await mutateMessages(
      (current) => (current ?? []).map((m) => (m.id === messageId ? { ...m, deleted: true, pinned: false, body: null, attachmentUrl: null, attachmentType: null, attachmentName: null } : m)),
      { revalidate: false },
    )
    await deleteChatMessage(messageId)
    await mutateMessages()
  }

  async function handleTogglePin(messageId: number, pinned: boolean) {
    await mutateMessages(
      (current) => (current ?? []).map((m) => (m.id === messageId ? { ...m, pinned } : m)),
      { revalidate: false },
    )
    await togglePinMessage({ messageId, pinned })
    await mutateMessages()
  }

  const pinnedMessages = messages.filter((m) => m.pinned && !m.deleted)

  // Tapping a pinned message scrolls to its bubble in the thread and briefly
  // highlights it so the user can find the exact message that was pinned.
  const [flashId, setFlashId] = useState<number | null>(null)
  function jumpToMessage(messageId: number) {
    const el = document.getElementById(`chat-msg-${messageId}`)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    setFlashId(messageId)
    window.setTimeout(() => setFlashId((cur) => (cur === messageId ? null : cur)), 1800)
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/chatrooms"
            aria-label="Back to chatrooms"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "shrink-0")}
          >
            <ArrowLeft className="size-5" />
          </Link>
          <Avatar className="size-10 shrink-0">
            {detail.image && <AvatarImage src={detail.image || "/placeholder.svg"} alt={detail.name} />}
            <AvatarFallback className="bg-secondary text-sm">
              {detail.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold">{detail.name}</h1>
              {detail.isOwner && <Badge variant="secondary">Admin</Badge>}
            </div>
            <button
              onClick={() => setShowMembers((s) => !s)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Users className="size-3" /> {detail.members.length}{" "}
              {detail.members.length === 1 ? "member" : "members"}
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setCallStartNonce((n) => n + 1)}
            aria-label="Start or join group call"
          >
            <Phone className="size-5" />
          </Button>
          {!detail.isOwner && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleLeave} disabled={isLeaving}>
              <LogOut className="size-4" /> Leave
            </Button>
          )}
        </div>
      </div>

      <ChatroomCall chatroomId={detail.id} roomTitle={detail.name} startNonce={callStartNonce} />

      {(showMembers || (detail.isOwner && detail.joinRequests.length > 0)) && (
        <div className="space-y-3 border-b border-border/60 px-4 py-3 sm:px-6">
          {showMembers && <MembersPanel detail={detail} />}
          {detail.isOwner && detail.joinRequests.length > 0 && <JoinRequests detail={detail} />}
        </div>
      )}

      {/* Pinned messages banner */}
      {pinnedMessages.length > 0 && (
        <div className="border-b border-border/60 bg-secondary/40 px-4 py-2 sm:px-6">
          <div className="mx-auto w-full max-w-3xl space-y-1">
            {pinnedMessages.map((m) => (
              <div key={`pin-${m.id}`} className="flex items-center gap-2 text-xs">
                <Pin className="size-3.5 shrink-0 text-primary" />
                <button
                  type="button"
                  onClick={() => jumpToMessage(m.id)}
                  className="min-w-0 flex-1 truncate text-left transition-colors hover:text-foreground"
                  aria-label="Jump to pinned message"
                >
                  <span className="font-medium">{m.isSelf ? "You" : m.userName}: </span>
                  <span className="text-muted-foreground">
                    {m.body || (m.attachmentType ? `${m.attachmentType} attachment` : "Message")}
                  </span>
                </button>
                {detail.isOwner && (
                  <button
                    type="button"
                    onClick={() => handleTogglePin(m.id, false)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Unpin message"
                  >
                    <PinOff className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages — fills remaining height */}
      <div className="flex-1 overflow-y-auto bg-card/30">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-5 sm:px-6">
          {messages.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No messages yet. Say hello to get the conversation started.
            </p>
          )}
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              isAdmin={detail.isOwner}
              flashed={flashId === m.id}
              onDelete={handleDeleteMessage}
              onTogglePin={handleTogglePin}
            />
          ))}
          <div ref={scrollEndRef} />
        </div>
      </div>

      {/* Composer area pinned to the bottom */}
      <div className="border-t border-border/60 bg-background px-4 py-3 sm:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-3">
      {/* Attachment preview */}
      {attachment && (
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-2.5">
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

      {/* Emoji picker */}
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

      {/* Composer */}
      {recording ? (
        <VoiceRecorder onSend={handleSendVoice} onCancel={() => setRecording(false)} sending={sendingVoice} />
      ) : (
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip"
            className="hidden"
            onChange={handleFilePick}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground"
            onClick={() => setShowEmoji((s) => !s)}
            aria-label="Toggle emoji picker"
          >
            <Smile className="size-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="Attach a file"
          >
            <Paperclip className={cn("size-5", uploading && "animate-pulse")} />
          </Button>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={uploading ? "Uploading attachment…" : "Type a message"}
            aria-label="Message"
          />
          {draft.trim() || attachment ? (
            <Button
              type="submit"
              size="icon"
              className="shrink-0"
              disabled={uploading}
              aria-label="Send message"
            >
              <Send className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              className="shrink-0"
              onClick={() => {
                setShowEmoji(false)
                setRecording(true)
              }}
              disabled={uploading}
              aria-label="Record a voice note"
            >
              <Mic className="size-4" />
            </Button>
          )}
        </form>
      )}
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  message: m,
  isAdmin,
  flashed = false,
  onDelete,
  onTogglePin,
}: {
  message: ChatMessageView
  isAdmin: boolean
  flashed?: boolean
  onDelete: (messageId: number) => void
  onTogglePin: (messageId: number, pinned: boolean) => void
}) {
  const [lightbox, setLightbox] = useState(false)
  // Long-press (press-and-hold) opens a moderation menu with pin/delete.
  const [menuOpen, setMenuOpen] = useState(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Only the admin can pin; admin or the author can delete.
  const canDelete = isAdmin || (m.isSelf && m.id > 0)
  const canModerate = (isAdmin || m.isSelf) && m.id > 0

  function startPress() {
    if (!canModerate) return
    pressTimer.current = setTimeout(() => setMenuOpen(true), 450)
  }
  function cancelPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  // Soft-deleted messages render a tombstone with no moderation controls.
  if (m.deleted) {
    return (
      <div className={cn("flex gap-2.5", m.isSelf && "flex-row-reverse")}>
        <Avatar className="size-7 shrink-0">
          <AvatarFallback className={cn("text-[10px]", m.color)}>{m.initials}</AvatarFallback>
        </Avatar>
        <div className={cn("max-w-[75%]", m.isSelf && "text-right")}>
          <div className="inline-flex items-center gap-1.5 rounded-2xl border border-dashed border-border bg-transparent px-3 py-2 text-xs italic text-muted-foreground">
            <Trash2 className="size-3.5" /> This message was removed
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      id={`chat-msg-${m.id}`}
      className={cn(
        "group flex gap-2.5 rounded-2xl transition-colors duration-500",
        m.isSelf && "flex-row-reverse",
        flashed && "bg-primary/10 ring-2 ring-primary/40",
      )}
    >
      <Link href={`/u/${m.userId}`} aria-label={`View ${m.userName}'s profile`} className="shrink-0">
        <Avatar className="size-7 transition-opacity hover:opacity-80">
          <AvatarFallback className={cn("text-[10px]", m.color)}>{m.initials}</AvatarFallback>
        </Avatar>
      </Link>
      <div className={cn("relative max-w-[75%] space-y-0.5", m.isSelf && "items-end text-right")}>
        <div className={cn("flex items-center gap-2", m.isSelf && "flex-row-reverse")}>
          <Link
            href={`/u/${m.userId}`}
            className="text-xs font-medium hover:underline"
          >
            {m.isSelf ? "You" : m.userName}
          </Link>
          <span className="text-[10px] text-muted-foreground">{m.postedAt}</span>
          {m.pinned && <Pin className="size-3 text-primary" />}
        </div>
        <div
          onContextMenu={(e) => {
            // Right-click / long-press context menu also opens moderation.
            if (canModerate) {
              e.preventDefault()
              setMenuOpen(true)
            }
          }}
          onPointerDown={startPress}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
          className={cn(
            "relative inline-block overflow-hidden rounded-2xl text-sm leading-relaxed",
            m.attachmentType === "image" || m.attachmentType === "video" ? "p-1" : "px-3 py-2",
            canModerate && "cursor-pointer select-none",
            m.isSelf
              ? "rounded-tr-sm bg-primary text-primary-foreground"
              : "rounded-tl-sm bg-secondary text-foreground",
          )}
        >
          {m.attachmentUrl && m.attachmentType === "image" && (
            <>
              <button type="button" onClick={() => setLightbox(true)} className="block" aria-label="Expand image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.attachmentUrl || "/placeholder.svg"}
                  alt={m.attachmentName ?? "Shared image"}
                  className="max-h-64 rounded-xl object-cover"
                />
              </button>
              {lightbox && (
                <ImageLightbox src={m.attachmentUrl} alt={m.attachmentName ?? "Shared image"} onClose={() => setLightbox(false)} />
              )}
            </>
          )}
          {m.attachmentUrl && m.attachmentType === "video" && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={m.attachmentUrl} controls className="max-h-64 rounded-xl" />
          )}
          {m.attachmentUrl && m.attachmentType === "audio" && (
            <div className="flex items-center gap-2 px-1 py-1">
              <Music className="size-4 shrink-0" />
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio src={m.attachmentUrl} controls className="h-9 max-w-[220px]" />
            </div>
          )}
          {m.attachmentUrl && m.attachmentType === "document" && (
            <a
              href={m.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center gap-2 rounded-lg px-1 py-0.5 underline-offset-2 hover:underline",
                m.isSelf ? "text-primary-foreground" : "text-foreground",
              )}
            >
              <FileText className="size-4 shrink-0" />
              <span className="truncate">{m.attachmentName ?? "Document"}</span>
            </a>
          )}
          {m.body && <p className={cn(m.attachmentUrl && "px-2 pb-1 pt-1.5")}>{m.body}</p>}
        </div>

        {/* Press-and-hold moderation menu */}
        {menuOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              aria-hidden="true"
              onClick={() => setMenuOpen(false)}
            />
            <div
              className={cn(
                "absolute z-50 mt-1 w-40 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg",
                m.isSelf ? "right-0" : "left-0",
              )}
            >
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    onTogglePin(m.id, !m.pinned)
                    setMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
                >
                  {m.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                  {m.pinned ? "Unpin message" : "Pin message"}
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(m.id)
                    setMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" /> Delete message
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MembersPanel({ detail }: { detail: ChatroomDetail }) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [groupCropSrc, setGroupCropSrc] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  function copyInvite() {
    const link =
      typeof window !== "undefined"
        ? `${window.location.origin}/chatrooms/join/${detail.inviteCode}`
        : detail.inviteCode
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleGroupImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setGroupCropSrc(URL.createObjectURL(file))
    if (imageInputRef.current) imageInputRef.current.value = ""
  }

  async function handleGroupCropped(blob: Blob) {
    setGroupCropSrc(null)
    setUploading(true)
    try {
      const file = new File([blob], "group.jpg", { type: "image/jpeg" })
      const data = await uploadMedia(file, "chat")
      await updateChatroomImage({ chatroomId: detail.id, image: data.url })
      router.refresh()
    } catch {
      // ignore — surfaced via no change
    } finally {
      setUploading(false)
    }
  }

  function removeGroupImage() {
    startTransition(async () => {
      await updateChatroomImage({ chatroomId: detail.id, image: null })
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
      {detail.isOwner && (
        <div className="flex items-center gap-3 border-b border-border/60 pb-3">
          <Avatar className="size-14">
            {detail.image && <AvatarImage src={detail.image || "/placeholder.svg"} alt={detail.name} />}
            <AvatarFallback className="bg-secondary text-base">{detail.name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Group picture</p>
            <div className="flex items-center gap-2">
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleGroupImage} />
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploading || isPending}
              >
                <ImageIcon className="size-3.5" />
                {uploading ? "Uploading…" : detail.image ? "Change" : "Upload"}
              </Button>
              {detail.image && (
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={removeGroupImage} disabled={isPending}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Members</h2>
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={copyInvite}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy invite link"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {detail.members.map((m) => (
          <Link
            key={m.userId}
            href={`/u/${m.userId}`}
            className="flex items-center gap-2 rounded-full border border-border/60 py-1 pl-1 pr-3 transition-colors hover:bg-secondary"
          >
            <Avatar className="size-6">
              <AvatarFallback className={cn("text-[10px]", m.color)}>{m.initials}</AvatarFallback>
            </Avatar>
            <span className="text-xs font-medium">{m.userName}</span>
            {m.role === "admin" && <Badge variant="secondary">Admin</Badge>}
          </Link>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Invite code: <span className="font-mono font-medium text-foreground">{detail.inviteCode}</span>
      </p>

      {groupCropSrc && (
        <ImageCropper
          src={groupCropSrc}
          aspect={1}
          round
          title="Adjust group picture"
          onCancel={() => setGroupCropSrc(null)}
          onCropped={handleGroupCropped}
        />
      )}
    </div>
  )
}

function JoinRequests({ detail }: { detail: ChatroomDetail }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handle(action: "approve" | "reject", requestId: number) {
    startTransition(async () => {
      if (action === "approve") await approveJoinRequest(requestId)
      else await rejectJoinRequest(requestId)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
      <h2 className="text-sm font-medium">
        Join requests <Badge variant="secondary">{detail.joinRequests.length}</Badge>
      </h2>
      <div className="space-y-2">
        {detail.joinRequests.map((req) => (
          <div key={req.id} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Avatar className="size-7">
                <AvatarFallback className={cn("text-[10px]", req.color)}>{req.initials}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{req.userName}</span>
              <span className="text-xs text-muted-foreground">{req.createdAt}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" className="gap-1" disabled={isPending} onClick={() => handle("approve", req.id)}>
                <Check className="size-3.5" /> Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1 text-muted-foreground"
                disabled={isPending}
                onClick={() => handle("reject", req.id)}
              >
                <X className="size-3.5" /> Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
