"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { ArrowLeft, Copy, CornerUpLeft, FileText, Mic, Music, Paperclip, Pencil, Phone, Pin, PinOff, Send, Smile, Trash2, Video, X } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ImageLightbox } from "@/components/image-lightbox"
import { VoiceRecorder } from "@/components/voice-recorder"
import { AudioMessage } from "@/components/audio-message"
import { DmCall } from "@/components/dm-call"
import { cn } from "@/lib/utils"
import { extractFirstUrl } from "@/lib/linkify"
import { renderMessageBody } from "@/lib/rich-text"
import { LinkPreview } from "@/components/link-preview"
import { compressImage, uploadMedia } from "@/lib/upload-media"
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
import { ActionSheet, type SheetAction } from "@/components/action-sheet"
import { getActiveCall, startCall, type CallMode, type DmCallView } from "@/app/actions/dm-call"

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
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3 sm:px-6">
        <Link
          href="/messages"
          aria-label="Back to messages"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "shrink-0")}
        >
          <ArrowLeft className="size-5" />
        </Link>
        <Link href={`/u/${detail.otherUserId}`} className="flex min-w-0 items-center gap-3">
          <Avatar className="size-10 shrink-0">
            {detail.image && <AvatarImage src={detail.image || "/placeholder.svg"} alt={detail.otherUserName} />}
            <AvatarFallback className={cn("text-sm", detail.color)}>{detail.initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight hover:underline">{detail.otherUserName}</h1>
            <p className="truncate text-xs text-muted-foreground">{detail.otherUserHandle}</p>
          </div>
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => beginCall("audio")}
            disabled={starting || Boolean(liveCall)}
            aria-label="Start voice call"
          >
            <Phone className="size-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => beginCall("video")}
            disabled={starting || Boolean(liveCall)}
            aria-label="Start video call"
          >
            <Video className="size-5" />
          </Button>
        </div>
      </div>

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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-card/30">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-5 sm:px-6">
          {messages.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No messages yet. Say hello to {detail.otherUserName}.
            </p>
          )}
          {messages.map((m) => (
            <DmBubble
              key={m.id}
              message={m}
              color={m.isSelf ? detail.currentUserColor : detail.color}
              initials={m.isSelf ? detail.currentUserInitials : detail.initials}
              image={m.isSelf ? detail.currentUserImage : detail.image}
              name={m.isSelf ? "You" : detail.otherUserName}
              onDelete={handleDeleteMessage}
              onTogglePin={handleTogglePin}
              onEdit={handleEditMessage}
            />
          ))}
          <div ref={scrollEndRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border/60 bg-background px-4 py-3 pb-safe-2 pl-safe pr-safe sm:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-3">
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

function DmBubble({
  message: m,
  color,
  initials,
  image,
  name,
  onDelete,
  onTogglePin,
  onEdit,
}: {
  message: DmMessageView
  color: string
  initials: string
  image: string | null
  name: string
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
      <div className={cn("flex gap-3", m.isSelf && "flex-row-reverse")}>
        <Avatar className="size-7 shrink-0">
          {image && <AvatarImage src={image || "/placeholder.svg"} alt={name} />}
          <AvatarFallback className={cn("text-[10px]", color)}>{initials}</AvatarFallback>
        </Avatar>
        <div className={cn("max-w-[75%] space-y-0.5", m.isSelf && "text-right")}>
          <span className="text-[10px] text-muted-foreground">{m.postedAt}</span>
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

  return (
    <div className={cn("flex gap-3", m.isSelf && "flex-row-reverse")}>
      <Avatar className="size-7 shrink-0">
        {image && <AvatarImage src={image || "/placeholder.svg"} alt={name} />}
        <AvatarFallback className={cn("text-[10px]", color)}>{initials}</AvatarFallback>
      </Avatar>
      <div className={cn("relative max-w-[75%] space-y-0.5", m.isSelf && "text-right")}>
        <span className={cn("flex items-center gap-1 text-[10px] text-muted-foreground", m.isSelf && "justify-end")}>
          {m.pinned && <Pin className="size-3 fill-current" aria-label="Pinned" />}
          {m.postedAt}
          {m.edited && <span>· edited</span>}
          {copied && <span className="text-primary">Copied</span>}
        </span>
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
            "inline-block select-none overflow-hidden rounded-2xl text-sm leading-snug shadow-sm",
            m.attachmentType === "image" || m.attachmentType === "video" ? "p-1" : "px-3 py-1.5",
            m.isSelf
              ? "rounded-br-md bg-primary text-primary-foreground"
              : "rounded-bl-md bg-secondary text-foreground ring-1 ring-inset ring-border/50",
          )}
        >
          {m.statusId != null &&
            (m.statusActive ? (
              <Link
                href={`/status/${m.statusId}`}
                className={cn(
                  "mb-1.5 flex items-center gap-2 rounded-lg p-1.5 text-left transition-opacity hover:opacity-80",
                  m.isSelf ? "bg-primary-foreground/15" : "bg-foreground/5",
                )}
              >
                {m.statusThumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.statusThumb || "/placeholder.svg"} alt="" className="size-9 shrink-0 rounded-md object-cover" />
                ) : (
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-md",
                      m.isSelf ? "bg-primary-foreground/20" : "bg-secondary",
                    )}
                  >
                    <CornerUpLeft className="size-4" />
                  </span>
                )}
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="text-xs font-medium">Reply to status</span>
                  <span className={cn("text-[11px]", m.isSelf ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    Tap to view
                  </span>
                </span>
              </Link>
            ) : (
              <div
                className={cn(
                  "mb-1.5 flex items-center gap-2 rounded-lg p-1.5",
                  m.isSelf ? "bg-primary-foreground/10" : "bg-foreground/5",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-md",
                    m.isSelf ? "bg-primary-foreground/15" : "bg-secondary",
                  )}
                >
                  <CornerUpLeft className="size-4 opacity-60" />
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="text-xs font-medium opacity-80">Reply to status</span>
                  <span className={cn("text-[11px]", m.isSelf ? "text-primary-foreground/60" : "text-muted-foreground")}>
                    Status expired
                  </span>
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
              className={cn("flex items-center gap-2 rounded-lg px-1 py-0.5 underline-offset-2 hover:underline", m.isSelf ? "text-primary-foreground" : "text-foreground")}
            >
              <FileText className="size-4 shrink-0" />
              <span className="truncate">{m.attachmentName ?? "Document"}</span>
            </a>
          )}
          {m.body && !editing && !bodyIsOnlyLink && (
            <p className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", m.attachmentUrl && "px-2 pb-1 pt-1.5")}>
              {renderMessageBody(m.body, {
                link: true,
                linkClassName: "font-medium underline underline-offset-2 [overflow-wrap:anywhere] hover:opacity-80",
              })}
            </p>
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
