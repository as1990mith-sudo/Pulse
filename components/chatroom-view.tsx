"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import useSWR from "swr"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Check,
  ChevronLeft,
  Copy,
  Crown,
  FileText,
  ImageIcon,
  LogOut,
  Mic,
  MoreVertical,
  Music,
  Paperclip,
  Pencil,
  Phone,
  Pin,
  PinOff,
  Send,
  ShieldMinus,
  Smile,
  Trash2,
  UserMinus,
  UserRound,
  Users,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ImageLightbox } from "@/components/image-lightbox"
import { ImageCropper } from "@/components/image-cropper"
import { VoiceRecorder } from "@/components/voice-recorder"
import { AudioMessage } from "@/components/audio-message"
import { ChatroomCall } from "@/components/chatroom-call"
import { cn } from "@/lib/utils"
import { useAutoHideChatChrome } from "@/lib/chat-chrome"
import { renderMessageBody } from "@/lib/rich-text"
import { compressImage, uploadMedia } from "@/lib/upload-media"
import { ActionSheet, type SheetAction } from "@/components/action-sheet"
import { MediaCollage, type CollageMedia } from "@/components/chat/media-collage"
import { groupConsecutiveMedia } from "@/lib/media-grouping"
import { ChatBackgroundSheet } from "@/components/chat-background-sheet"
import { getChatBackground, chatBackgroundStyle } from "@/lib/chat-backgrounds"
import { canEdit, canDelete } from "@/lib/interactions"
import { formatChatTimestamp } from "@/lib/format-timestamp"
import {
  approveJoinRequest,
  deleteChatMessage,
  editChatMessage,
  getChatMessages,
  leaveChatroom,
  rejectJoinRequest,
  removeChatroomMember,
  sendChatMessage,
  setChatroomMemberRole,
  togglePinMessage,
  updateChatroomBackground,
  updateChatroomImage,
  updateChatroomName,
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
  // Header overflow menu + the modals it can open.
  const [menuOpen, setMenuOpen] = useState(false)
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  const [bgSheetOpen, setBgSheetOpen] = useState(false)
  const [groupLightbox, setGroupLightbox] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [recording, setRecording] = useState(false)
  const [sendingVoice, setSendingVoice] = useState(false)
  // Bumped when the header call button is tapped to tell ChatroomCall to join.
  const [callStartNonce, setCallStartNonce] = useState(0)
  const [isLeaving, startLeave] = useTransition()
  // Optimistic messages shown instantly while the server round-trips.
  const [pending, setPending] = useState<ChatMessageView[]>([])
  const scrollEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Auto-hide the global app header while scrolling the conversation.
  const onMessagesScroll = useAutoHideChatChrome()

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
      const data = await uploadMedia(toUpload, "chat", name)
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
          image: detail.currentUserImage,
          kind: "user",
          body: null,
          attachmentUrl: data.url,
          attachmentType: "audio",
          attachmentName: label,
          postedAt: "now",
          isSelf: true,
          pinned: false,
          deleted: false,
          edited: false,
          createdAtMs: Date.now(),
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
        image: detail.currentUserImage,
        kind: "user",
        body,
        attachmentUrl: sentAttachment?.url ?? null,
        attachmentType: sentAttachment?.type ?? null,
        attachmentName: sentAttachment?.name ?? null,
        postedAt: "now",
        isSelf: true,
        pinned: false,
        deleted: false,
        edited: false,
        createdAtMs: Date.now(),
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

  function copyInviteLink() {
    const link =
      typeof window !== "undefined"
        ? `${window.location.origin}/chatrooms/join/${detail.inviteCode}`
        : detail.inviteCode
    const share = (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share
    if (share) {
      void share({ title: detail.name, text: `Join ${detail.name} on Frequency`, url: link }).catch(() => {})
      return
    }
    navigator.clipboard?.writeText(link).then(() => {
      setInviteCopied(true)
      window.setTimeout(() => setInviteCopied(false), 2000)
    })
  }

  async function handleSelectBackground(id: string) {
    const background = id === "default" ? null : id
    // Optimistic: reflect the choice immediately, then persist for all members.
    setBgSheetOpen(false)
    await updateChatroomBackground({ chatroomId: detail.id, background })
    router.refresh()
  }

  // Header overflow menu — availability differs by role.
  const menuActions: SheetAction[] = []
  if (detail.isAdmin) {
    menuActions.push({ label: "Edit Profile", icon: Pencil, onClick: () => setEditProfileOpen(true) })
  }
  menuActions.push({ label: "Send invite link", icon: Copy, onClick: copyInviteLink })
  if (detail.isAdmin) {
    menuActions.push({ label: "Chat background", icon: ImageIcon, onClick: () => setBgSheetOpen(true) })
  }
  if (!detail.isOwner) {
    menuActions.push({ label: "Leave group", icon: LogOut, destructive: true, onClick: () => setConfirmLeave(true) })
  }

  const background = getChatBackground(detail.background)
  const hasWallpaper = background.kind !== "default"

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

  async function handleEditMessage(messageId: number, body: string) {
    await mutateMessages(
      (current) => (current ?? []).map((m) => (m.id === messageId ? { ...m, body, edited: true } : m)),
      { revalidate: false },
    )
    await editChatMessage({ messageId, body })
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
      {/* Header — tap the title block to open group info / members. The Admin
          badge lives on the subtitle line so it never crowds the room name. */}
      <div className="flex items-center gap-1.5 border-b border-border/60 bg-background/80 px-2 py-2.5 backdrop-blur sm:px-4">
        <Link
          href="/chatrooms"
          aria-label="Back to chatrooms"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary"
        >
          <ChevronLeft className="size-6" />
        </Link>
        <button
          type="button"
          onClick={() => (detail.image ? setGroupLightbox(true) : setShowMembers((s) => !s))}
          aria-label={detail.image ? "View group picture" : "Show members"}
          className="shrink-0 rounded-full"
        >
          <Avatar className="size-10 ring-1 ring-border/50 transition-opacity hover:opacity-80">
            {detail.image && <AvatarImage src={detail.image || "/placeholder.svg"} alt={detail.name} />}
            <AvatarFallback className="bg-secondary text-sm">
              {detail.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </button>
        <button
          type="button"
          onClick={() => setShowMembers((s) => !s)}
          aria-expanded={showMembers}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1 pl-2 pr-2 text-left transition-colors hover:bg-secondary/50"
        >
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold leading-tight">{detail.name}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" /> {detail.members.length}{" "}
                {detail.members.length === 1 ? "member" : "members"}
              </span>
            </span>
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-mr-1 size-10 shrink-0 rounded-full"
          onClick={() => setCallStartNonce((n) => n + 1)}
          aria-label="Start or join group call"
        >
          <Phone className="size-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0 rounded-full"
          onClick={() => setMenuOpen(true)}
          aria-label="More options"
        >
          <MoreVertical className="size-5" />
        </Button>
      </div>

      {/* Header overflow menu */}
      <ActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={detail.name}
        actions={menuActions}
      />

      {/* Enlarged group picture lightbox */}
      {groupLightbox && detail.image && (
        <ImageLightbox src={detail.image} alt={detail.name} onClose={() => setGroupLightbox(false)} />
      )}

      {/* Admin: shared chat background picker */}
      <ChatBackgroundSheet
        open={bgSheetOpen}
        current={detail.background ?? "default"}
        subtitle="Applies for everyone in the group"
        onSelect={handleSelectBackground}
        onClose={() => setBgSheetOpen(false)}
      />

      {/* Admin: edit group name + picture */}
      {editProfileOpen && (
        <EditProfileModal detail={detail} onClose={() => setEditProfileOpen(false)} />
      )}

      {/* Leave group confirmation */}
      {confirmLeave && (
        <ConfirmLeaveDialog
          groupName={detail.name}
          leaving={isLeaving}
          onCancel={() => setConfirmLeave(false)}
          onConfirm={handleLeave}
        />
      )}

      {inviteCopied && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[90] flex justify-center px-4">
          <span className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background shadow-lg">
            Invite link copied
          </span>
        </div>
      )}

      <ChatroomCall chatroomId={detail.id} roomTitle={detail.name} startNonce={callStartNonce} />

      {(showMembers || (detail.isAdmin && detail.joinRequests.length > 0)) && (
        <div className="max-h-[60vh] space-y-3 overflow-y-auto overscroll-contain border-b border-border/60 px-4 py-3 sm:px-6">
          {showMembers && <MembersPanel detail={detail} />}
          {detail.isAdmin && detail.joinRequests.length > 0 && <JoinRequests detail={detail} />}
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
                {detail.isAdmin && (
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

      {/* Messages — fills remaining height. A fixed wallpaper layer sits behind
          the scrolling thread so the shared background stays put while scrolling. */}
      <div className="relative flex-1 overflow-hidden">
        <div
          aria-hidden
          className={cn("absolute inset-0", !hasWallpaper && "bg-card/30")}
          style={hasWallpaper ? chatBackgroundStyle(detail.background) : undefined}
        />
        {hasWallpaper && <div aria-hidden className="absolute inset-0 bg-background/55" />}
        <div onScroll={onMessagesScroll} className="relative h-full overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-5 sm:px-6">
          {messages.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No messages yet. Say hello to get the conversation started.
            </p>
          )}
          {groupConsecutiveMedia(
            messages,
            (m) => ({
              senderKey: `u-${m.userId}`,
              createdAtMs: m.createdAtMs,
              // Only pure photo/video messages from a member group together.
              groupable:
                m.kind === "user" &&
                !m.deleted &&
                !m.body &&
                !!m.attachmentUrl &&
                (m.attachmentType === "image" || m.attachmentType === "video"),
            }),
            (m) => m.id,
          ).map((run) =>
            run.type === "group" ? (
              <ChatroomMediaGroup
                key={run.key}
                messages={run.items}
                isAdmin={detail.isAdmin}
                flashId={flashId}
                onDelete={handleDeleteMessage}
                onTogglePin={handleTogglePin}
              />
            ) : run.item.kind === "system" ? (
              // Centered notice for auto events like "<name> joined the room".
              <div key={run.item.id} className="flex justify-center py-1">
                <span className="rounded-full bg-muted/60 px-3 py-1 text-center text-xs text-muted-foreground">
                  {run.item.body}
                </span>
              </div>
            ) : (
              <MessageBubble
                key={run.item.id}
                message={run.item}
                isAdmin={detail.isAdmin}
                flashed={flashId === run.item.id}
                onDelete={handleDeleteMessage}
                onTogglePin={handleTogglePin}
                onEdit={handleEditMessage}
              />
            ),
          )}
          <div ref={scrollEndRef} />
        </div>
        </div>
      </div>

      {/* Composer area pinned to the bottom */}
      <div className="border-t border-border/60 bg-background px-4 py-3 pb-safe-2 pl-safe pr-safe sm:px-6">
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
  onEdit,
}: {
  message: ChatMessageView
  isAdmin: boolean
  flashed?: boolean
  onDelete: (messageId: number) => void
  onTogglePin: (messageId: number, pinned: boolean) => void
  onEdit: (messageId: number, body: string) => void
}) {
  const [lightbox, setLightbox] = useState(false)
  // Long-press (press-and-hold) opens the modern action sheet.
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState(m.body ?? "")
  const [copied, setCopied] = useState(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persisted = m.id > 0
  // Admin or author may delete (author only within the 30-min window).
  const deletable = persisted && (isAdmin || (m.isSelf && canDelete(m.createdAtMs)))
  // Author may edit text messages within the 15-min window.
  const editable = persisted && m.isSelf && !!m.body && canEdit(m.createdAtMs)
  // Anyone with menu access (copy is always available on text).
  const hasText = !!m.body
  const canOpenMenu = persisted && (deletable || editable || (m.isSelf && hasText) || isAdmin || hasText)

  function startPress() {
    if (!canOpenMenu) return
    pressTimer.current = setTimeout(() => setMenuOpen(true), 450)
  }
  function cancelPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
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
  if (hasText) actions.push({ label: "Copy", icon: Copy, onClick: copyText })
  if (editable) actions.push({ label: "Edit", icon: Pencil, onClick: () => { setEditDraft(m.body ?? ""); setEditing(true) } })
  if (isAdmin || m.isSelf) {
    actions.push({
      label: m.pinned ? "Unpin message" : "Pin message",
      icon: m.pinned ? PinOff : Pin,
      onClick: () => onTogglePin(m.id, !m.pinned),
    })
  }
  if (deletable) actions.push({ label: "Delete message", icon: Trash2, destructive: true, onClick: () => onDelete(m.id) })

  // Soft-deleted messages render a tombstone with no moderation controls.
  if (m.deleted) {
    return (
      <div className={cn("flex gap-2.5", m.isSelf && "flex-row-reverse")}>
        <Avatar className="size-7 shrink-0">
          {m.image && <AvatarImage src={m.image || "/placeholder.svg"} alt={m.userName} />}
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
          {m.image && <AvatarImage src={m.image || "/placeholder.svg"} alt={m.userName} />}
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
          <span className="text-[10px] text-muted-foreground">{formatChatTimestamp(m.createdAtMs)}</span>
          {m.edited && <span className="text-[10px] text-muted-foreground">· edited</span>}
          {copied && <span className="text-[10px] text-primary">Copied</span>}
          {m.pinned && <Pin className="size-3 text-primary" />}
        </div>
        <div
          onContextMenu={(e) => {
            // Right-click / long-press context menu also opens the action sheet.
            if (canOpenMenu) {
              e.preventDefault()
              setMenuOpen(true)
            }
          }}
          onPointerDown={startPress}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
          className={cn(
            "relative inline-block overflow-hidden rounded-2xl text-sm leading-snug shadow-sm",
            m.attachmentType === "image" || m.attachmentType === "video" ? "p-1" : "px-3 py-1.5",
            canOpenMenu && "cursor-pointer select-none",
            m.isSelf
              ? "rounded-br-md bg-primary text-primary-foreground"
              : "rounded-bl-md bg-secondary text-foreground ring-1 ring-inset ring-border/50",
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
            <AudioMessage src={m.attachmentUrl} mine={m.isSelf} className="min-w-[200px] px-1" />
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
          {m.body && !editing && (
            <p className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", m.attachmentUrl && "px-2 pb-1 pt-1.5")}>
              {renderMessageBody(m.body, {
                link: true,
                linkClassName: "font-medium underline underline-offset-2 hover:opacity-80",
              })}
            </p>
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

        {/* Press-and-hold action sheet */}
        <ActionSheet
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          title={m.isSelf ? "Your message" : m.userName}
          preview={m.body ?? m.attachmentName ?? undefined}
          actions={actions}
        />
      </div>
    </div>
  )
}

/**
 * Renders a run of consecutive photo/video messages from one member (within 3
 * minutes) as a single WhatsApp-style collage bubble, keeping the same avatar +
 * name + timestamp chrome as a normal message. Each tile stays individually
 * openable in the viewer and long-pressable for pin/delete (subject to the same
 * admin/author permissions), so only the visual layout changes.
 */
function ChatroomMediaGroup({
  messages,
  isAdmin,
  flashId,
  onDelete,
  onTogglePin,
}: {
  messages: ChatMessageView[]
  isAdmin: boolean
  flashId: number | null
  onDelete: (messageId: number) => void
  onTogglePin: (messageId: number, pinned: boolean) => void
}) {
  const first = messages[0]
  const isSelf = first.isSelf
  const lastMs = messages[messages.length - 1].createdAtMs
  const anyPinned = messages.some((m) => m.pinned)
  const flashed = flashId != null && messages.some((m) => m.id === flashId)

  const media: CollageMedia[] = messages.map((m) => ({
    key: m.id,
    anchorId: `chat-msg-${m.id}`,
    url: m.attachmentUrl as string,
    type: m.attachmentType === "video" ? "video" : "image",
    name: m.attachmentName,
  }))

  function buildActions(index: number): SheetAction[] {
    const m = messages[index]
    if (m.id <= 0) return []
    const actions: SheetAction[] = []
    if (isAdmin || m.isSelf) {
      actions.push({
        label: m.pinned ? "Unpin message" : "Pin message",
        icon: m.pinned ? PinOff : Pin,
        onClick: () => onTogglePin(m.id, !m.pinned),
      })
    }
    if (isAdmin || (m.isSelf && canDelete(m.createdAtMs))) {
      actions.push({ label: "Delete message", icon: Trash2, destructive: true, onClick: () => onDelete(m.id) })
    }
    return actions
  }

  return (
    <div className={cn("flex gap-2.5", isSelf && "flex-row-reverse")}>
      <Link href={`/u/${first.userId}`} aria-label={`View ${first.userName}'s profile`} className="shrink-0">
        <Avatar className="size-7 transition-opacity hover:opacity-80">
          {first.image && <AvatarImage src={first.image || "/placeholder.svg"} alt={first.userName} />}
          <AvatarFallback className={cn("text-[10px]", first.color)}>{first.initials}</AvatarFallback>
        </Avatar>
      </Link>
      <div className={cn("flex max-w-[75%] flex-col gap-0.5", isSelf && "items-end text-right")}>
        <div className={cn("flex items-center gap-2", isSelf && "flex-row-reverse")}>
          <Link href={`/u/${first.userId}`} className="text-xs font-medium hover:underline">
            {isSelf ? "You" : first.userName}
          </Link>
          <span className="text-[10px] text-muted-foreground">{formatChatTimestamp(lastMs)}</span>
          {anyPinned && <Pin className="size-3 text-primary" />}
        </div>
        <MediaCollage
          items={media}
          mine={isSelf}
          buildActions={buildActions}
          className={cn(
            "shadow-sm ring-1 ring-inset ring-border/40",
            isSelf ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-bl-md",
            flashed && "ring-2 ring-primary/40",
          )}
        />
      </div>
    </div>
  )
}

/**
 * The plain member list. Same view for admins and regular members — only the
 * per-member action availability (remove, promote) differs by role, handled in
 * MemberRow. No group-picture editing lives here (that moved to Edit Profile).
 */
function MembersPanel({ detail }: { detail: ChatroomDetail }) {
  const [copied, setCopied] = useState(false)

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

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {detail.members.length} {detail.members.length === 1 ? "member" : "members"}
        </h2>
        <Button variant="secondary" size="sm" className="gap-1.5 rounded-full" onClick={copyInvite}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Invite link"}
        </Button>
      </div>

      <ul className="-mx-1 divide-y divide-border/50">
        {detail.members.map((m) => (
          <MemberRow key={m.userId} detail={detail} member={m} />
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Invite code: <span className="font-mono font-medium text-foreground">{detail.inviteCode}</span>
      </p>
    </div>
  )
}

/**
 * A single member row with a management menu. Everyone can open a profile;
 * the owner can promote/demote admins, and any admin can remove members
 * (only the owner can remove another admin). The room owner is never removable.
 */
function MemberRow({
  detail,
  member,
}: {
  detail: ChatroomDetail
  member: ChatroomDetail["members"][number]
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [, startTransition] = useTransition()

  const isOwnerMember = member.userId === detail.ownerId
  const isSelf = member.userId === detail.currentUserId
  // Owner may promote/demote any non-owner member.
  const canChangeRole = detail.isOwner && !isOwnerMember
  // Admins may remove members; only the owner can remove another admin.
  const canRemove =
    detail.isAdmin && !isOwnerMember && !isSelf && (detail.isOwner || member.role !== "admin")

  const actions: SheetAction[] = [
    {
      label: "View profile",
      icon: UserRound,
      onClick: () => router.push(`/u/${member.userId}`),
    },
  ]
  if (canChangeRole) {
    actions.push(
      member.role === "admin"
        ? {
            label: "Dismiss as admin",
            icon: ShieldMinus,
            onClick: () =>
              startTransition(async () => {
                await setChatroomMemberRole({ chatroomId: detail.id, userId: member.userId, role: "member" })
                router.refresh()
              }),
          }
        : {
            label: "Make admin",
            icon: Crown,
            onClick: () =>
              startTransition(async () => {
                await setChatroomMemberRole({ chatroomId: detail.id, userId: member.userId, role: "admin" })
                router.refresh()
              }),
          },
    )
  }
  if (canRemove) {
    actions.push({
      label: "Remove from group",
      icon: UserMinus,
      destructive: true,
      onClick: () =>
        startTransition(async () => {
          await removeChatroomMember({ chatroomId: detail.id, userId: member.userId })
          router.refresh()
        }),
    })
  }

  return (
    <li className="flex items-center gap-3 px-1 py-2.5">
      <Avatar className="size-9 shrink-0">
        {member.image && <AvatarImage src={member.image || "/placeholder.svg"} alt={member.userName} />}
        <AvatarFallback className={cn("text-xs", member.color)}>{member.initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {member.userName}
          {isSelf && <span className="text-muted-foreground"> (You)</span>}
        </p>
      </div>
      {isOwnerMember ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
          Owner
        </span>
      ) : member.role === "admin" ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
          Admin
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label={`Manage ${member.userName}`}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <MoreVertical className="size-[18px]" />
      </button>

      <ActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={member.userName}
        actions={actions}
      />
    </li>
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

/**
 * Admin-only modal to edit the group's name and change/remove its picture.
 * The picture is persisted as soon as it's cropped; the name is saved on submit.
 */
function EditProfileModal({ detail, onClose }: { detail: ChatroomDetail; onClose: () => void }) {
  const router = useRouter()
  const [name, setName] = useState(detail.name)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [groupCropSrc, setGroupCropSrc] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const next = name.trim()
    if (!next) return
    setSaving(true)
    try {
      if (next !== detail.name) await updateChatroomName({ chatroomId: detail.id, name: next })
      router.refresh()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Edit group profile"
    >
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 m-3 w-full max-w-sm space-y-5 rounded-3xl border border-border/60 bg-card p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold">Edit profile</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <Avatar className="size-16 ring-1 ring-border/50">
            {detail.image && <AvatarImage src={detail.image || "/placeholder.svg"} alt={detail.name} />}
            <AvatarFallback className="bg-secondary text-lg">{detail.name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleGroupImage} />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5 rounded-full"
              onClick={() => imageInputRef.current?.click()}
              disabled={uploading || isPending}
            >
              <ImageIcon className="size-3.5" />
              {uploading ? "Uploading…" : detail.image ? "Change icon" : "Upload icon"}
            </Button>
            {detail.image && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 rounded-full text-muted-foreground"
                onClick={removeGroupImage}
                disabled={isPending}
              >
                <Trash2 className="size-3.5" /> Remove
              </Button>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="group-name" className="text-xs font-medium text-muted-foreground">
              Group name
            </label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name"
              maxLength={80}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="rounded-full" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-full" disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </div>

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

/** Confirmation dialog shown before a member leaves the group. */
function ConfirmLeaveDialog({
  groupName,
  leaving,
  onCancel,
  onConfirm,
}: {
  groupName: string
  leaving: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label="Leave group"
    >
      <button type="button" aria-label="Cancel" onClick={onCancel} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-xs space-y-4 rounded-3xl border border-border/60 bg-card p-5 text-center shadow-2xl">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <LogOut className="size-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold">Leave group?</h3>
          <p className="text-sm text-muted-foreground">
            {"You'll stop receiving messages from "}
            <span className="font-medium text-foreground">{groupName}</span>
            {". You can rejoin later with an invite link."}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="destructive"
            className="w-full rounded-full"
            onClick={onConfirm}
            disabled={leaving}
          >
            {leaving ? "Leaving…" : "Leave group"}
          </Button>
          <Button type="button" variant="ghost" className="w-full rounded-full" onClick={onCancel} disabled={leaving}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
