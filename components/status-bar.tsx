"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, X, Trash2, Loader2, Send, Camera, Video, ImageIcon, Type, Eye } from "lucide-react"
import {
  createStatus,
  deleteStatus,
  markStatusViewed,
  getStatusViewers,
  reactToStatus,
  replyToStatus,
  type StatusGroup,
  type StatusItem,
  type StatusViewer as StatusViewerRow,
} from "@/app/actions/status"
import type { CurrentUser } from "@/lib/session"
import { uploadMedia } from "@/lib/upload-media"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { VideoTrimmer } from "@/components/video-trimmer"
import { ShareSheet } from "@/components/share-sheet"
import type { ShareTarget } from "@/lib/share-types"
import { cn } from "@/lib/utils"

const MAX_VIDEO_SECONDS = 60
const IMAGE_DURATION_MS = 5000
const TEXT_DURATION_MS = 6000

// Gradient palettes for text-only statuses (key stored in backgroundColor).
const TEXT_BACKGROUNDS: Record<string, string> = {
  sunset: "bg-gradient-to-br from-orange-500 via-rose-500 to-fuchsia-600",
  ocean: "bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700",
  forest: "bg-gradient-to-br from-emerald-500 via-green-600 to-teal-700",
  night: "bg-gradient-to-br from-slate-700 via-slate-900 to-black",
  candy: "bg-gradient-to-br from-pink-500 via-rose-500 to-red-500",
}
const TEXT_BG_KEYS = Object.keys(TEXT_BACKGROUNDS)
const REACTIONS = ["❤️", "🔥", "😂", "😮", "😢", "👏"]

/** Reads a video file's duration so we can enforce the 1-minute limit. */
function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("video")
    el.preload = "metadata"
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(el.src)
      resolve(el.duration)
    }
    el.onerror = () => reject(new Error("Could not read video."))
    el.src = URL.createObjectURL(file)
  })
}

export function StatusBar({
  groups: initialGroups,
  currentUser,
}: {
  groups: StatusGroup[]
  currentUser: CurrentUser | null
}) {
  const router = useRouter()
  // Keep a local copy so viewing a status can flip its ring to "seen" instantly,
  // without waiting for a server refresh. Re-syncs whenever the server data changes.
  const [groups, setGroups] = useState(initialGroups)
  useEffect(() => {
    setGroups(initialGroups)
  }, [initialGroups])

  // Optimistically mark a viewed item as seen and recompute the author's ring.
  function markGroupItemViewed(userId: string, itemId: number) {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.userId !== userId) return g
        const items = g.items.map((it) => (it.id === itemId ? { ...it, viewed: true } : it))
        return { ...g, items, allViewed: items.every((i) => i.viewed) }
      }),
    )
  }
  // Separate inputs so we can request the camera vs the library on mobile.
  const cameraPhotoRef = useRef<HTMLInputElement>(null)
  const cameraVideoRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [textComposer, setTextComposer] = useState(false)
  const [, startTransition] = useTransition()
  const [trimSrc, setTrimSrc] = useState<string | null>(null)
  const [compose, setCompose] = useState<{ file: File; url: string; type: "image" | "video" } | null>(null)

  const myGroup = groups.find((g) => g.isSelf) ?? null
  const otherGroups = groups.filter((g) => !g.isSelf)
  const myHasStatus = !!myGroup && myGroup.items.length > 0

  function openComposer(file: File, type: "image" | "video") {
    setCompose({ file, url: URL.createObjectURL(file), type })
  }

  function closeComposer() {
    setCompose((c) => {
      if (c) URL.revokeObjectURL(c.url)
      return null
    })
  }

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    input.value = ""
    if (!file) return
    setError(null)
    setMenuOpen(false)

    const isVideo = file.type.startsWith("video/")
    const isImage = file.type.startsWith("image/")
    if (!isVideo && !isImage) {
      setError("Please choose a photo or video.")
      return
    }

    if (isVideo) {
      try {
        const duration = await getVideoDuration(file)
        if (duration > MAX_VIDEO_SECONDS + 0.5) {
          setTrimSrc(URL.createObjectURL(file))
          return
        }
      } catch {
        setError("Could not read that video.")
        return
      }
    }

    openComposer(file, isVideo ? "video" : "image")
  }

  function handleTrimmed(file: File) {
    if (trimSrc) URL.revokeObjectURL(trimSrc)
    setTrimSrc(null)
    openComposer(file, "video")
  }

  async function shareStatus(caption: string) {
    if (!compose) return
    setUploading(true)
    setError(null)
    try {
      const data = await uploadMedia(compose.file, "status")
      await createStatus({ mediaUrl: data.url, mediaType: compose.type, caption })
      closeComposer()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.")
    } finally {
      setUploading(false)
    }
  }

  async function shareTextStatus(text: string, bg: string) {
    setUploading(true)
    setError(null)
    try {
      await createStatus({ mediaType: "text", caption: text, backgroundColor: bg })
      setTextComposer(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post status.")
    } finally {
      setUploading(false)
    }
  }

  function removeStatus(id: number) {
    startTransition(async () => {
      await deleteStatus(id)
      router.refresh()
    })
  }

  // The viewer walks through this ordered list of groups.
  const viewerGroups = myHasStatus ? [myGroup, ...otherGroups] : otherGroups

  function openViewerForUser(userId: string) {
    const idx = viewerGroups.findIndex((g) => g.userId === userId)
    if (idx >= 0) setViewerIndex(idx)
  }

  function handleSelfTap() {
    if (myHasStatus) openViewerForUser(myGroup!.userId)
    else setMenuOpen(true)
  }

  return (
    <section aria-label="Status updates" className="-mx-4 sm:mx-0">
      <div className="flex gap-4 overflow-x-auto px-4 pb-1 sm:px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Your story (always first) */}
        {currentUser ? (
          <div className="flex w-[68px] shrink-0 flex-col items-center gap-1.5">
            <div className="relative">
              <StoryRing gradient={myHasStatus && !myGroup!.allViewed} viewed={myHasStatus && myGroup!.allViewed}>
                <button
                  type="button"
                  onClick={handleSelfTap}
                  disabled={uploading}
                  className="block size-full overflow-hidden rounded-full"
                  aria-label={myHasStatus ? "View your status" : "Add a status"}
                >
                  <Avatar className="size-full">
                    {currentUser.image && <AvatarImage src={currentUser.image || "/placeholder.svg"} alt="You" />}
                    <AvatarFallback className={currentUser.color}>{currentUser.initials}</AvatarFallback>
                  </Avatar>
                </button>
              </StoryRing>
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                disabled={uploading}
                className="absolute -bottom-0.5 -right-0.5 flex size-[22px] items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground transition-opacity hover:opacity-90"
                aria-label="Create a new status"
              >
                {uploading ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3.5" />}
              </button>
            </div>
            <span className="w-full truncate text-center text-xs text-muted-foreground">
              {myHasStatus ? "Your status" : "Your status"}
            </span>
          </div>
        ) : (
          <Link href="/sign-in" className="flex w-[68px] shrink-0 flex-col items-center gap-1.5" aria-label="Sign in to add a status">
            <span className="flex size-16 items-center justify-center rounded-full border-2 border-dashed border-border text-muted-foreground">
              <Plus className="size-5" />
            </span>
            <span className="w-full truncate text-center text-xs text-muted-foreground">Add status</span>
          </Link>
        )}

        {/* Everyone else */}
        {otherGroups.map((g) => (
          <button
            key={g.userId}
            type="button"
            onClick={() => openViewerForUser(g.userId)}
            className="flex w-[68px] shrink-0 flex-col items-center gap-1.5"
            aria-label={`View ${g.authorName}'s status`}
          >
            <StoryRing gradient={!g.allViewed} viewed={g.allViewed}>
              <Avatar className="size-full">
                {g.authorImage && <AvatarImage src={g.authorImage || "/placeholder.svg"} alt={g.authorName} />}
                <AvatarFallback className={g.color}>{g.initials}</AvatarFallback>
              </Avatar>
            </StoryRing>
            <span className="w-full truncate text-center text-xs text-muted-foreground">
              {g.authorName.split(" ")[0]}
            </span>
          </button>
        ))}
      </div>

      {error && <p className="mt-2 px-4 text-xs text-destructive sm:px-1">{error}</p>}

      {/* Hidden inputs: camera photo, camera video, library */}
      <input ref={cameraPhotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFilePick} />
      <input ref={cameraVideoRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={handleFilePick} />
      <input ref={libraryRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFilePick} />

      {menuOpen && (
        <CreateMenu
          onClose={() => setMenuOpen(false)}
          onTakePhoto={() => cameraPhotoRef.current?.click()}
          onRecordVideo={() => cameraVideoRef.current?.click()}
          onUpload={() => libraryRef.current?.click()}
          onText={() => {
            setMenuOpen(false)
            setTextComposer(true)
          }}
        />
      )}

      {viewerIndex !== null && viewerGroups[viewerIndex] && (
        <StatusViewer
          groups={viewerGroups as StatusGroup[]}
          startIndex={viewerIndex}
          currentUser={currentUser}
          onClose={() => setViewerIndex(null)}
          onDelete={removeStatus}
          onItemViewed={markGroupItemViewed}
        />
      )}

      {trimSrc && (
        <VideoTrimmer
          src={trimSrc}
          maxDuration={MAX_VIDEO_SECONDS}
          title="Trim to 1 minute"
          onCancel={() => {
            URL.revokeObjectURL(trimSrc)
            setTrimSrc(null)
          }}
          onTrimmed={handleTrimmed}
        />
      )}

      {compose && (
        <StatusComposer media={compose} uploading={uploading} onCancel={closeComposer} onShare={shareStatus} />
      )}

      {textComposer && (
        <TextStatusComposer uploading={uploading} onCancel={() => setTextComposer(false)} onShare={shareTextStatus} />
      )}
    </section>
  )
}

/** The Instagram-style ring: gradient for unseen, grey for seen, thin pad inside. */
function StoryRing({
  gradient,
  viewed,
  children,
}: {
  gradient: boolean
  viewed: boolean
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "flex size-16 items-center justify-center rounded-full p-[2.5px]",
        !gradient && (viewed ? "bg-border" : "bg-secondary"),
      )}
      // Unseen rings use the active skin's gradient (see --skin-ring in globals.css).
      style={gradient ? { backgroundImage: "var(--skin-ring)" } : undefined}
    >
      <span className="flex size-full items-center justify-center rounded-full border-2 border-background bg-card">
        <span className="size-full overflow-hidden rounded-full">{children}</span>
      </span>
    </span>
  )
}

/** Bottom-sheet menu of creation options. */
function CreateMenu({
  onClose,
  onTakePhoto,
  onRecordVideo,
  onUpload,
  onText,
}: {
  onClose: () => void
  onTakePhoto: () => void
  onRecordVideo: () => void
  onUpload: () => void
  onText: () => void
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  if (typeof document === "undefined") return null

  const options = [
    { icon: Camera, label: "Take photo", onClick: onTakePhoto },
    { icon: Video, label: "Record video", onClick: onRecordVideo },
    { icon: ImageIcon, label: "Upload photo or video", onClick: onUpload },
    { icon: Type, label: "Add text status", onClick: onText },
  ]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl border border-border bg-card p-2 pb-6 sm:rounded-2xl sm:pb-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border sm:hidden" />
        <p className="px-3 py-2 text-sm font-semibold">Create status</p>
        {options.map(({ icon: Icon, label, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              onClick()
              if (label !== "Add text status") onClose()
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-secondary"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-foreground">
              <Icon className="size-[18px]" />
            </span>
            {label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}

/** WhatsApp-style preview + caption screen shown before a media status is posted. */
function StatusComposer({
  media,
  uploading,
  onCancel,
  onShare,
}: {
  media: { url: string; type: "image" | "video" }
  uploading: boolean
  onCancel: () => void
  onShare: (caption: string) => void
}) {
  const [caption, setCaption] = useState("")

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  if (typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex items-center justify-between p-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={uploading}
          className="flex size-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15"
          aria-label="Cancel"
        >
          <X className="size-5" />
        </button>
        <span className="text-sm font-medium text-white/80">New status</span>
        <span className="size-10" />
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden px-4">
        {media.type === "video" ? (
          <video src={media.url} className="max-h-full max-w-full rounded-lg" controls autoPlay loop playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.url || "/placeholder.svg"} alt="Status preview" className="max-h-full max-w-full rounded-lg object-contain" />
        )}
      </div>

      <div className="flex items-center gap-2 p-3">
        <input
          type="text"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Add a caption…"
          maxLength={200}
          disabled={uploading}
          className="h-11 flex-1 rounded-full border border-white/20 bg-white/10 px-4 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
          aria-label="Status caption"
        />
        <button
          type="button"
          onClick={() => onShare(caption)}
          disabled={uploading}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          aria-label="Share status"
        >
          {uploading ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
        </button>
      </div>
    </div>,
    document.body,
  )
}

/** Full-screen text status composer with selectable gradient background. */
function TextStatusComposer({
  uploading,
  onCancel,
  onShare,
}: {
  uploading: boolean
  onCancel: () => void
  onShare: (text: string, bg: string) => void
}) {
  const [text, setText] = useState("")
  const [bgKey, setBgKey] = useState(TEXT_BG_KEYS[0])

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  if (typeof document === "undefined") return null

  return createPortal(
    <div className={cn("fixed inset-0 z-50 flex flex-col", TEXT_BACKGROUNDS[bgKey])}>
      <div className="flex items-center justify-between p-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={uploading}
          className="flex size-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15"
          aria-label="Cancel"
        >
          <X className="size-5" />
        </button>
        <span className="text-sm font-medium text-white/90">Text status</span>
        <span className="size-10" />
      </div>

      <div className="flex flex-1 items-center justify-center px-6">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a status…"
          maxLength={250}
          autoFocus
          disabled={uploading}
          className="w-full resize-none bg-transparent text-center text-2xl font-semibold leading-relaxed text-white placeholder:text-white/60 focus:outline-none"
          rows={4}
        />
      </div>

      {/* Background swatches */}
      <div className="flex items-center justify-center gap-2 p-3">
        {TEXT_BG_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setBgKey(key)}
            className={cn(
              "size-8 rounded-full ring-2 ring-offset-2 ring-offset-black/20 transition-transform",
              TEXT_BACKGROUNDS[key],
              bgKey === key ? "ring-white scale-110" : "ring-transparent",
            )}
            aria-label={`Use ${key} background`}
          />
        ))}
      </div>

      <div className="flex items-center justify-end p-3">
        <button
          type="button"
          onClick={() => onShare(text, bgKey)}
          disabled={uploading || !text.trim()}
          className="flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-4" />}
          Share
        </button>
      </div>
    </div>,
    document.body,
  )
}

export function StatusViewer({
  groups,
  startIndex,
  startItemIndex = 0,
  currentUser,
  onClose,
  onDelete,
  onItemViewed,
}: {
  groups: StatusGroup[]
  startIndex: number
  startItemIndex?: number
  currentUser: CurrentUser | null
  onClose: () => void
  onDelete: (id: number) => void
  onItemViewed?: (userId: string, itemId: number) => void
}) {
  const router = useRouter()
  const [groupIndex, setGroupIndex] = useState(startIndex)
  const [itemIndex, setItemIndex] = useState(startItemIndex)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reaction, setReaction] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [replySent, setReplySent] = useState(false)
  const [showViewers, setShowViewers] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const pausedRef = useRef(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasHold = useRef(false)
  const inputFocused = useRef(false)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  const group = groups[groupIndex]
  const item: StatusItem | undefined = group?.items[itemIndex]
  const durationMs = item?.mediaType === "text" ? TEXT_DURATION_MS : IMAGE_DURATION_MS

  function goNext() {
    if (!group) return
    if (itemIndex < group.items.length - 1) {
      setItemIndex((i) => i + 1)
    } else if (groupIndex < groups.length - 1) {
      setGroupIndex((g) => g + 1)
      setItemIndex(0)
    } else {
      onClose()
    }
  }

  function goPrev() {
    if (itemIndex > 0) {
      setItemIndex((i) => i - 1)
    } else if (groupIndex > 0) {
      const prev = groupIndex - 1
      setGroupIndex(prev)
      setItemIndex(Math.max(0, groups[prev].items.length - 1))
    }
  }

  // Mark the active item as viewed + reset per-item UI state.
  useEffect(() => {
    setReaction(null)
    setReplyText("")
    setReplySent(false)
    setShowViewers(false)
    if (item && !group.isSelf) {
      onItemViewed?.(group.userId, item.id)
      void markStatusViewed(item.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIndex, itemIndex])

  // Drive the progress bar for image/text items (video uses timeupdate).
  useEffect(() => {
    setProgress(0)
    setPaused(false)
    pausedRef.current = false
    if (!item) return
    if (item.mediaType === "video") return

    let elapsed = 0
    let last = Date.now()
    const interval = setInterval(() => {
      const now = Date.now()
      if (!pausedRef.current) elapsed += now - last
      last = now
      const pct = Math.min(100, (elapsed / durationMs) * 100)
      setProgress(pct)
      if (pct >= 100) {
        clearInterval(interval)
        goNext()
      }
    }, 50)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIndex, itemIndex])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (paused) v.pause()
    else void v.play().catch(() => {})
  }, [paused])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
      if (inputFocused.current) return
      if (e.key === "ArrowRight") goNext()
      if (e.key === "ArrowLeft") goPrev()
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIndex, itemIndex])

  function handlePointerDown() {
    wasHold.current = false
    holdTimer.current = setTimeout(() => {
      wasHold.current = true
      setPaused(true)
    }, 180)
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    if (wasHold.current) {
      wasHold.current = false
      setPaused(false)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width / 3) goPrev()
    else goNext()
  }

  function handlePointerCancel() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    if (wasHold.current) {
      wasHold.current = false
      setPaused(false)
    }
  }

  async function handleReact(emoji: string) {
    if (!item) return
    setReaction(emoji)
    try {
      await reactToStatus(item.id, emoji)
    } catch {
      /* ignore */
    }
  }

  async function handleReply() {
    if (!item || !replyText.trim()) return
    try {
      await replyToStatus(item.id, replyText)
      setReplyText("")
      setReplySent(true)
      setTimeout(() => setReplySent(false), 2500)
    } catch {
      /* ignore */
    }
  }

  function handleShare() {
    if (!group) return
    // Pause playback while the share sheet is open, then resume on close.
    setPaused(true)
    setShowShare(true)
  }

  if (typeof document === "undefined" || !group || !item) return null

  const isText = item.mediaType === "text"
  const bgClass = isText ? TEXT_BACKGROUNDS[item.backgroundColor ?? "sunset"] : "bg-black"

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
      <div className={cn("relative flex h-full w-full max-w-md flex-col", bgClass)}>
        {/* Progress bars */}
        <div className="absolute left-0 right-0 top-0 z-30 flex gap-1 p-3">
          {group.items.map((it, i) => (
            <div key={it.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              <div
                className="h-full bg-white transition-[width] duration-100 ease-linear"
                style={{ width: i < itemIndex ? "100%" : i === itemIndex ? `${progress}%` : "0%" }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between px-3 pb-3 pt-6">
          <Link
            href={`/u/${group.userId}`}
            onClick={(e) => {
              // Navigate imperatively first, then close the viewer. Closing
              // unmounts this portal, which would otherwise interrupt the
              // Link's own client-side navigation transition.
              e.preventDefault()
              e.stopPropagation()
              router.push(`/u/${group.userId}`)
              onClose()
            }}
            className="flex items-center gap-2 rounded-full transition-opacity hover:opacity-90"
            aria-label={group.isSelf ? "View your profile" : `View ${group.authorName}'s profile`}
          >
            <Avatar className="size-9 ring-2 ring-white/40">
              {group.authorImage && <AvatarImage src={group.authorImage || "/placeholder.svg"} alt={group.authorName} />}
              <AvatarFallback className={group.color}>{group.initials}</AvatarFallback>
            </Avatar>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">{group.isSelf ? "Your status" : group.authorName}</p>
              <p className="text-xs text-white/70">{item.postedAt}</p>
            </div>
          </Link>
          <div className="flex items-center gap-1">
            {group.isSelf && (
              <button
                type="button"
                onClick={() => {
                  onDelete(item.id)
                  goNext()
                }}
                className="flex size-9 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15"
                aria-label="Delete this status"
              >
                <Trash2 className="size-5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex size-9 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15"
              aria-label="Close status viewer"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Media / text */}
        <div className="flex flex-1 items-center justify-center overflow-hidden">
          {item.mediaType === "video" ? (
            <video
              ref={videoRef}
              key={item.id}
              src={item.mediaUrl ?? undefined}
              className="max-h-full max-w-full"
              autoPlay
              playsInline
              controls={false}
              onTimeUpdate={(e) => {
                const v = e.currentTarget
                if (v.duration) setProgress((v.currentTime / v.duration) * 100)
              }}
              onEnded={goNext}
            />
          ) : item.mediaType === "text" ? (
            <p className="px-8 text-center text-2xl font-semibold leading-relaxed text-white">{item.caption}</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.mediaUrl || "/placeholder.svg"} alt="Status" className="max-h-full max-w-full object-contain" />
          )}
        </div>

        {/* Caption for media items */}
        {!isText && item.caption && (
          <div className="pointer-events-none absolute bottom-20 left-0 right-0 z-20 bg-gradient-to-t from-black/70 to-transparent p-6 pb-8">
            <p className="text-center text-sm text-white">{item.caption}</p>
          </div>
        )}

        {/* Tap zones for nav + press-and-hold to pause */}
        <div
          className="absolute inset-0 z-10"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* Bottom interaction bar */}
        <div className="absolute bottom-0 left-0 right-0 z-30 p-3">
          {group.isSelf ? (
            <button
              type="button"
              onClick={() => {
                // Pause the auto-advance timer while the owner reviews who
                // has seen their status.
                setPaused(true)
                setShowViewers(true)
              }}
              className="mx-auto flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/25"
            >
              <Eye className="size-4" /> Viewers
            </button>
          ) : currentUser ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onFocus={() => {
                  inputFocused.current = true
                  setPaused(true)
                }}
                onBlur={() => {
                  inputFocused.current = false
                  setPaused(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleReply()
                }}
                placeholder={replySent ? "Reply sent!" : `Reply to ${group.authorName.split(" ")[0]}…`}
                maxLength={300}
                className="h-11 flex-1 rounded-full border border-white/30 bg-white/10 px-4 text-sm text-white placeholder:text-white/60 focus:border-white/60 focus:outline-none"
                aria-label="Reply to status"
              />
              {REACTIONS.slice(0, 3).map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleReact(emoji)}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full text-lg transition-transform hover:scale-110",
                    reaction === emoji && "scale-125",
                  )}
                  aria-label={`React ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
              <button
                type="button"
                onClick={handleShare}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
                aria-label="Share status"
              >
                <Send className="size-5" />
              </button>
            </div>
          ) : (
            <p className="text-center text-sm text-white/70">
              <Link href="/sign-in" className="font-semibold underline">
                Sign in
              </Link>{" "}
              to reply
            </p>
          )}
        </div>

        {/* Reaction confirmation pop */}
        {reaction && (
          <div className="pointer-events-none absolute bottom-20 left-0 right-0 z-20 flex justify-center">
            <span className="animate-bounce text-4xl">{reaction}</span>
          </div>
        )}

        {/* Paused indicator */}
        {paused && !inputFocused.current && (
          <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center">
            <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white/90">Paused</span>
          </div>
        )}

        {/* Accessible nav */}
        <button type="button" onClick={goPrev} className="sr-only">
          Previous status
        </button>
        <button type="button" onClick={goNext} className="sr-only">
          Next status
        </button>

        {showViewers && item && (
          <ViewersSheet
            statusId={item.id}
            onClose={() => {
              setShowViewers(false)
              setPaused(false)
            }}
          />
        )}

        {item && group && (
          <ShareSheet
            target={{
              type: "status",
              key: String(item.id),
              title: `${group.authorName}'s status on Frequency`,
              subtitle: item.caption ?? null,
              url: `/u/${group.userId}`,
              image: item.mediaType === "text" ? null : item.mediaUrl ?? null,
              downloadUrl: item.mediaType === "text" ? null : item.mediaUrl ?? null,
              downloadKind: item.mediaType === "video" ? "video" : item.mediaType === "image" ? "image" : null,
            }}
            open={showShare}
            onClose={() => {
              setShowShare(false)
              setPaused(false)
            }}
          />
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Owner-only bottom sheet listing who viewed the status (with reactions). */
function ViewersSheet({ statusId, onClose }: { statusId: number; onClose: () => void }) {
  const [viewers, setViewers] = useState<StatusViewerRow[] | null>(null)

  useEffect(() => {
    let active = true
    getStatusViewers(statusId).then((v) => {
      if (active) setViewers(v)
    })
    return () => {
      active = false
    }
  }, [statusId])

  return (
    <div className="absolute inset-0 z-40 flex items-end bg-black/50" onClick={onClose}>
      <div
        className="max-h-[70%] w-full overflow-y-auto rounded-t-2xl bg-card p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <Eye className="size-4" /> {viewers ? `${viewers.length} ${viewers.length === 1 ? "view" : "views"}` : "Viewers"}
        </p>
        {viewers === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : viewers.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No views yet.</p>
        ) : (
          <ul className="space-y-1">
            {viewers.map((v) => (
              <li key={v.viewerId} className="flex items-center gap-3 rounded-lg px-1 py-2">
                <Avatar className="size-9">
                  <AvatarFallback className={v.color}>{v.initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 leading-tight">
                  <Link href={`/u/${v.viewerId}`} className="text-sm font-medium hover:underline">
                    {v.viewerName}
                  </Link>
                  <p className="text-xs text-muted-foreground">{v.viewedAt}</p>
                </div>
                {v.reaction && <span className="text-lg">{v.reaction}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
