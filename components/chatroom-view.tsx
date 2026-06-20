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
  Paperclip,
  Send,
  Smile,
  Users,
  X,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ImageLightbox } from "@/components/image-lightbox"
import { ImageCropper } from "@/components/image-cropper"
import { cn } from "@/lib/utils"
import { uploadMedia } from "@/lib/upload-media"
import {
  approveJoinRequest,
  getChatMessages,
  leaveChatroom,
  rejectJoinRequest,
  sendChatMessage,
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
        {!detail.isOwner && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleLeave} disabled={isLeaving}>
            <LogOut className="size-4" /> Leave
          </Button>
        )}
      </div>

      {(showMembers || (detail.isOwner && detail.joinRequests.length > 0)) && (
        <div className="space-y-3 border-b border-border/60 px-4 py-3 sm:px-6">
          {showMembers && <MembersPanel detail={detail} />}
          {detail.isOwner && detail.joinRequests.length > 0 && <JoinRequests detail={detail} />}
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
            <MessageBubble key={m.id} message={m} />
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
              <FileText className="size-5" />
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
      <form onSubmit={handleSend} className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip"
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
        <Button
          type="submit"
          size="icon"
          className="shrink-0"
          disabled={uploading || (!draft.trim() && !attachment)}
          aria-label="Send message"
        >
          <Send className="size-4" />
        </Button>
      </form>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message: m }: { message: ChatMessageView }) {
  const [lightbox, setLightbox] = useState(false)

  return (
    <div className={cn("flex gap-2.5", m.isSelf && "flex-row-reverse")}>
      <Avatar className="size-7 shrink-0">
        <AvatarFallback className={cn("text-[10px]", m.color)}>{m.initials}</AvatarFallback>
      </Avatar>
      <div className={cn("max-w-[75%] space-y-0.5", m.isSelf && "items-end text-right")}>
        <div className={cn("flex items-center gap-2", m.isSelf && "flex-row-reverse")}>
          <span className="text-xs font-medium">{m.isSelf ? "You" : m.userName}</span>
          <span className="text-[10px] text-muted-foreground">{m.postedAt}</span>
        </div>
        <div
          className={cn(
            "inline-block overflow-hidden rounded-2xl text-sm leading-relaxed",
            m.attachmentType === "image" || m.attachmentType === "video" ? "p-1" : "px-3 py-2",
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
          <div key={m.userId} className="flex items-center gap-2 rounded-full border border-border/60 py-1 pl-1 pr-3">
            <Avatar className="size-6">
              <AvatarFallback className={cn("text-[10px]", m.color)}>{m.initials}</AvatarFallback>
            </Avatar>
            <span className="text-xs font-medium">{m.userName}</span>
            {m.role === "admin" && <Badge variant="secondary">Admin</Badge>}
          </div>
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
