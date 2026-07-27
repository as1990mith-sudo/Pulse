"use client"

// A self-contained floating mini-chat layer, modelled on the Bible page's
// floating chat but backed by the plain DM server actions (no presence /
// capacity machinery). Any surface can wrap its tree in <MiniChatProvider> and
// then call `useMiniChat().openProfile(userId)` to pop a profile card, or
// `openChat(user)` to drop a floating conversation window. Each window can be
// minimized to a bubble, maximized to a taller panel, or closed — the thread
// itself always lives on in the Messages inbox.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import {
  ImageIcon,
  Loader2,
  Maximize2,
  MessageCircle,
  Mic,
  Minimize2,
  Minus,
  Send,
  Smile,
  User,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react"
import useSWR from "swr"
import {
  getDmMessages,
  getDmReadState,
  getOrCreateConversation,
  sendDirectMessage,
  type DmMessageView,
} from "@/app/actions/dm"
import { getProfilePreview } from "@/app/actions/users"
import { toggleFollow } from "@/app/actions/follow"
import type { Profile } from "@/lib/profile"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AudioMessage } from "@/components/audio-message"
import { VoiceRecorder } from "@/components/voice-recorder"
import { ImageLightbox } from "@/components/image-lightbox"
import { compressImage, uploadMedia } from "@/lib/upload-media"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import { formatChatTimestamp } from "@/lib/format-timestamp"

const EMOJIS = ["🙏", "❤️", "🕊️", "✨", "🙌", "📖", "🔥", "😊", "😂", "🥰", "👍", "🎉", "🌿", "☀️", "💯", "🍞"]
const MAX_MINI_CHATS = 3

export type MiniChatUser = { userId: string; name: string; image: string | null }
type ActiveChat = { conversationId: number } & MiniChatUser

type MiniChatContextValue = {
  openChats: ActiveChat[]
  expandedChatId: number | null
  openingChatFor: string | null
  openChat: (user: MiniChatUser) => void
  closeChat: (conversationId: number) => void
  expandChat: (conversationId: number) => void
  minimizeChat: () => void
  profileUserId: string | null
  openProfile: (userId: string) => void
  closeProfile: () => void
}

const MiniChatContext = createContext<MiniChatContextValue | null>(null)

export function useMiniChat(): MiniChatContextValue {
  const ctx = useContext(MiniChatContext)
  if (!ctx) throw new Error("useMiniChat must be used within a <MiniChatProvider>")
  return ctx
}

export function MiniChatProvider({ children }: { children: ReactNode }) {
  const [openChats, setOpenChats] = useState<ActiveChat[]>([])
  const [expandedChatId, setExpandedChatId] = useState<number | null>(null)
  const [openingChatFor, setOpeningChatFor] = useState<string | null>(null)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const openChatsRef = useRef(openChats)
  useEffect(() => {
    openChatsRef.current = openChats
  }, [openChats])

  const openProfile = useCallback((userId: string) => {
    haptic("light")
    setProfileUserId(userId)
  }, [])
  const closeProfile = useCallback(() => setProfileUserId(null), [])

  const openChat = useCallback(async (user: MiniChatUser) => {
    // Already open → just bring its window forward.
    const existing = openChatsRef.current.find((c) => c.userId === user.userId)
    if (existing) {
      haptic("light")
      setExpandedChatId(existing.conversationId)
      setProfileUserId(null)
      return
    }
    if (openChatsRef.current.length >= MAX_MINI_CHATS) {
      // Free the oldest bubble to make room, keeping the stack tidy.
      setOpenChats((prev) => prev.slice(1))
    }
    setOpeningChatFor(user.userId)
    haptic("light")
    try {
      const conversationId = await getOrCreateConversation(user.userId)
      setOpenChats((prev) => {
        if (prev.some((c) => c.conversationId === conversationId)) return prev
        return [...prev, { conversationId, ...user }]
      })
      setExpandedChatId(conversationId)
      setProfileUserId(null)
    } catch {
      /* ignore — the user can retry */
    } finally {
      setOpeningChatFor(null)
    }
  }, [])

  const closeChat = useCallback((conversationId: number) => {
    setOpenChats((prev) => prev.filter((c) => c.conversationId !== conversationId))
    setExpandedChatId((cur) => (cur === conversationId ? null : cur))
  }, [])
  const expandChat = useCallback((conversationId: number) => {
    haptic("light")
    setExpandedChatId(conversationId)
  }, [])
  const minimizeChat = useCallback(() => {
    haptic("light")
    setExpandedChatId(null)
  }, [])

  const value = useMemo<MiniChatContextValue>(
    () => ({
      openChats,
      expandedChatId,
      openingChatFor,
      openChat,
      closeChat,
      expandChat,
      minimizeChat,
      profileUserId,
      openProfile,
      closeProfile,
    }),
    [openChats, expandedChatId, openingChatFor, openChat, closeChat, expandChat, minimizeChat, profileUserId, openProfile, closeProfile],
  )

  return (
    <MiniChatContext.Provider value={value}>
      {children}
      <MiniChatProfilePopup />
      <MiniChatDock />
    </MiniChatContext.Provider>
  )
}

/* -------------------------------------------------------------------------- */
/*  Profile popup — Follow · Message · View profile                           */
/* -------------------------------------------------------------------------- */

function MiniChatProfilePopup() {
  const { profileUserId, closeProfile, openChat } = useMiniChat()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || !profileUserId) return null
  return createPortal(
    <ProfilePopupCard
      key={profileUserId}
      userId={profileUserId}
      onClose={closeProfile}
      onMessage={(u) => void openChat(u)}
    />,
    document.body,
  )
}

function ProfilePopupCard({
  userId,
  onClose,
  onMessage,
}: {
  userId: string
  onClose: () => void
  onMessage: (u: MiniChatUser) => void
}) {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [following, setFollowing] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    getProfilePreview(userId)
      .then((p) => {
        if (cancelled) return
        setProfile(p)
        setFollowing(p?.isFollowing ?? false)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function handleFollow() {
    if (!profile || profile.isSelf || pending) return
    const next = !following
    setFollowing(next)
    setPending(true)
    haptic(next ? "success" : "light")
    try {
      await toggleFollow({ targetUserId: profile.id, follow: next })
    } catch {
      setFollowing(!next)
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Profile"
    >
      <button
        type="button"
        aria-label="Close profile"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm duration-200 animate-in fade-in"
      />
      <div className="relative w-full max-w-xs overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-2xl duration-300 animate-in fade-in zoom-in-95">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 inline-flex size-8 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur transition-colors hover:bg-background"
        >
          <X className="size-4" />
        </button>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !profile ? (
          <div className="flex h-48 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            This user is no longer available.
          </div>
        ) : (
          <>
            <div
              className="h-24"
              style={{
                backgroundImage: `linear-gradient(135deg, color-mix(in oklab, var(${profile.gradient.from}) 75%, transparent) 0%, color-mix(in oklab, var(${profile.gradient.to}) 55%, transparent) 100%)`,
              }}
            />
            <div className="flex flex-col items-center gap-3 px-6 pb-6">
              <Avatar className="-mt-12 size-24 ring-4 ring-card">
                {profile.image ? <AvatarImage src={profile.image} alt={profile.name} /> : null}
                <AvatarFallback className={cn("text-2xl", getAvatarColor(profile.id))}>
                  {getInitials(profile.name)}
                </AvatarFallback>
              </Avatar>

              <div className="text-center">
                <p className="text-balance text-xl font-bold leading-tight">{profile.name}</p>
                <p className="text-sm text-muted-foreground">{profile.handle}</p>
              </div>

              {profile.bio ? (
                <p className="text-pretty text-center text-sm text-muted-foreground">{profile.bio}</p>
              ) : null}

              <div className="flex items-center gap-6 text-center">
                <div>
                  <p className="text-lg font-bold">{profile.followers.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Followers</p>
                </div>
                <div className="h-9 w-px bg-border" />
                <div>
                  <p className="text-lg font-bold">{profile.following.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Following</p>
                </div>
              </div>

              <div className="mt-2 flex w-full flex-col gap-2">
                {!profile.isSelf && (
                  <button
                    type="button"
                    onClick={() => void handleFollow()}
                    disabled={pending}
                    className={cn(
                      "flex h-12 items-center justify-center gap-2 rounded-full text-[15px] font-bold transition-all active:scale-95 disabled:opacity-60",
                      following
                        ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        : "bg-primary text-primary-foreground hover:bg-primary/90",
                    )}
                  >
                    {pending ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : following ? (
                      <>
                        <UserCheck className="size-5" /> Following
                      </>
                    ) : (
                      <>
                        <UserPlus className="size-5" /> Follow
                      </>
                    )}
                  </button>
                )}
                {!profile.isSelf && (
                  <button
                    type="button"
                    onClick={() => {
                      onMessage({ userId: profile.id, name: profile.name, image: profile.image })
                      onClose()
                    }}
                    className="flex h-12 items-center justify-center gap-2 rounded-full border border-border text-[15px] font-bold transition-colors hover:bg-secondary active:scale-95"
                  >
                    <MessageCircle className="size-5" /> Message
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    router.push(`/u/${profile.id}`)
                  }}
                  className="flex h-12 items-center justify-center gap-2 rounded-full text-[15px] font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground active:scale-95"
                >
                  <User className="size-5" /> View profile
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Dock — bubbles (minimized) or one expanded window                         */
/* -------------------------------------------------------------------------- */

function MiniChatDock() {
  const { openChats, expandedChatId, expandChat, closeChat } = useMiniChat()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || openChats.length === 0) return null

  const expanded = openChats.find((c) => c.conversationId === expandedChatId) ?? null

  const body = expanded ? (
    <ChatWindow chat={expanded} />
  ) : (
    <div
      className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] right-3 z-[65] flex flex-col items-end gap-3"
      role="region"
      aria-label="Open chats"
    >
      {openChats.map((chat, i) => (
        <div key={chat.conversationId} className="relative duration-300 animate-in fade-in slide-in-from-right-4" style={{ zIndex: 40 + i }}>
          <button
            type="button"
            onClick={() => expandChat(chat.conversationId)}
            aria-label={`Open chat with ${chat.name}`}
            className="group relative block size-14 rounded-full shadow-2xl transition-transform active:scale-95"
          >
            <Avatar className="size-full ring-2 ring-primary/40 ring-offset-2 ring-offset-background">
              {chat.image ? <AvatarImage src={chat.image} alt={chat.name} /> : null}
              <AvatarFallback className={cn("text-base font-semibold", getAvatarColor(chat.userId))}>
                {getInitials(chat.name)}
              </AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-background bg-chart-2" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              haptic("light")
              closeChat(chat.conversationId)
            }}
            aria-label={`Close chat with ${chat.name}`}
            className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  )

  return createPortal(body, document.body)
}

function ChatWindow({ chat }: { chat: ActiveChat }) {
  const { closeChat, minimizeChat } = useMiniChat()

  const [draft, setDraft] = useState("")
  const [showEmoji, setShowEmoji] = useState(false)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [sendingVoice, setSendingVoice] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  // Toggles the window between the compact dock size and a tall, near-fullscreen
  // panel. "Maximize" makes it fill the screen; "restore" brings it back down.
  const [maximized, setMaximized] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: messages, mutate } = useSWR(
    ["mini-chat", chat.conversationId],
    () => getDmMessages(chat.conversationId),
    { refreshInterval: 3500, revalidateOnFocus: true, keepPreviousData: true },
  )
  const { data: readState } = useSWR(
    ["mini-chat-read", chat.conversationId],
    () => getDmReadState(chat.conversationId),
    { refreshInterval: 4000, revalidateOnFocus: true },
  )

  const list = messages ?? []
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

  const lastSelf = [...list].reverse().find((m) => m.isSelf && !m.deleted)
  const seen = lastSelf && readState ? readState.otherLastReadAtMs >= lastSelf.createdAtMs : false

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[66] flex justify-center px-0 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:justify-end sm:px-0"
      role="dialog"
      aria-modal="false"
      aria-label={`Chat with ${chat.name}`}
    >
      <div
        className={cn(
          "flex w-full flex-col overflow-hidden rounded-t-3xl border border-border/70 bg-card/90 shadow-2xl backdrop-blur-2xl duration-300 animate-in slide-in-from-bottom-8 sm:rounded-3xl",
          maximized
            ? "h-[92vh] sm:h-[42rem] sm:max-h-[90vh] sm:w-[26rem]"
            : "h-[70vh] sm:h-[30rem] sm:max-h-[70vh] sm:w-[22rem]",
        )}
      >
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
            onClick={() => setMaximized((m) => !m)}
            aria-label={maximized ? "Restore chat size" : "Maximize chat"}
            className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {maximized ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
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
                Say hello to {chat.name}. Your chat floats right here.
              </p>
            </div>
          ) : (
            list.map((m) => <Bubble key={m.id} m={m} onImage={() => m.attachmentUrl && setLightbox(m.attachmentUrl)} />)
          )}
          {seen && (
            <div className="flex items-center justify-end gap-1 pr-1 text-[10px] text-muted-foreground">
              Seen
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
                className="max-h-24 min-h-9 flex-1 resize-none rounded-2xl border border-border/60 bg-card px-3 py-2 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        {m.body && (
          <p className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", (isImage || isAudio) && "px-2 pb-1 pt-1")}>{m.body}</p>
        )}
        <span className={cn("mt-0.5 block text-[10px]", m.isSelf ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {formatChatTimestamp(m.createdAtMs)}
        </span>
      </div>
    </div>
  )
}
