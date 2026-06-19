"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, X, Trash2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { createStatus, deleteStatus, type StatusGroup } from "@/app/actions/status"
import type { CurrentUser } from "@/lib/session"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const MAX_VIDEO_SECONDS = 60
const IMAGE_DURATION_MS = 5000

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
  groups,
  currentUser,
}: {
  groups: StatusGroup[]
  currentUser: CurrentUser | null
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [, startTransition] = useTransition()

  const myGroup = groups.find((g) => g.isSelf) ?? null
  // Everyone else, already ordered connections-first by the server action.
  const otherGroups = groups.filter((g) => !g.isSelf)

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

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
          setError("Videos must be 1 minute or shorter.")
          if (fileInputRef.current) fileInputRef.current.value = ""
          return
        }
      } catch {
        setError("Could not read that video.")
        return
      }
    }

    setUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/upload-chat", { method: "POST", body })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Upload failed.")
      await createStatus({ mediaUrl: data.url, mediaType: isVideo ? "video" : "image" })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function removeStatus(id: number) {
    startTransition(async () => {
      await deleteStatus(id)
      router.refresh()
    })
  }

  // The viewer walks through this ordered list of groups.
  const viewerGroups = myGroup && myGroup.items.length > 0 ? [myGroup, ...otherGroups] : otherGroups

  function openViewerForUser(userId: string) {
    const idx = viewerGroups.findIndex((g) => g.userId === userId)
    if (idx >= 0) setViewerIndex(idx)
  }

  const hasAnything = myGroup !== null || otherGroups.length > 0

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Status updates</h2>
        <span className="text-xs text-muted-foreground">Disappears after 24 hours</span>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-1">
        {/* Your status / add */}
        {currentUser ? (
          <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  myGroup && myGroup.items.length > 0
                    ? openViewerForUser(myGroup.userId)
                    : fileInputRef.current?.click()
                }
                disabled={uploading}
                className={cn(
                  "flex size-16 items-center justify-center rounded-full p-[3px] transition-opacity hover:opacity-90",
                  myGroup && myGroup.items.length > 0 ? "bg-primary" : "bg-secondary",
                )}
                aria-label={myGroup && myGroup.items.length > 0 ? "View your status" : "Add a status"}
              >
                <span className="flex size-full items-center justify-center rounded-full bg-card p-[2px]">
                  <Avatar className="size-full">
                    <AvatarFallback className={currentUser.color}>{currentUser.initials}</AvatarFallback>
                  </Avatar>
                </span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground transition-opacity hover:opacity-90"
                aria-label="Add to your status"
              >
                {uploading ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3.5" />}
              </button>
            </div>
            <span className="w-full truncate text-center text-xs text-muted-foreground">Your status</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={handleFilePick}
            />
          </div>
        ) : (
          <Link
            href="/sign-in"
            className="flex w-16 shrink-0 flex-col items-center gap-1.5"
            aria-label="Sign in to add a status"
          >
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
            className="flex w-16 shrink-0 flex-col items-center gap-1.5"
            aria-label={`View ${g.authorName}'s status`}
          >
            <span
              className={cn(
                "flex size-16 items-center justify-center rounded-full p-[3px]",
                g.isConnection ? "bg-primary" : "bg-muted-foreground/40",
              )}
            >
              <span className="flex size-full items-center justify-center rounded-full bg-card p-[2px]">
                <Avatar className="size-full">
                  {g.authorImage && <AvatarImage src={g.authorImage || "/placeholder.svg"} alt={g.authorName} />}
                  <AvatarFallback className={g.color}>{g.initials}</AvatarFallback>
                </Avatar>
              </span>
            </span>
            <span className="w-full truncate text-center text-xs text-muted-foreground">
              {g.isSelf ? "You" : g.authorName.split(" ")[0]}
            </span>
          </button>
        ))}

        {!hasAnything && (
          <p className="flex items-center text-sm text-muted-foreground">
            No statuses yet. Be the first to share a moment.
          </p>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {viewerIndex !== null && viewerGroups[viewerIndex] && (
        <StatusViewer
          groups={viewerGroups}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onDelete={removeStatus}
        />
      )}
    </Card>
  )
}

function StatusViewer({
  groups,
  startIndex,
  onClose,
  onDelete,
}: {
  groups: StatusGroup[]
  startIndex: number
  onClose: () => void
  onDelete: (id: number) => void
}) {
  const [groupIndex, setGroupIndex] = useState(startIndex)
  const [itemIndex, setItemIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  const group = groups[groupIndex]
  const item = group?.items[itemIndex]

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

  // Reset + drive the progress bar for the active item.
  useEffect(() => {
    setProgress(0)
    if (!item) return
    if (item.mediaType === "video") return // video drives its own progress via timeupdate

    const start = Date.now()
    const interval = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - start) / IMAGE_DURATION_MS) * 100)
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
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
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

  if (typeof document === "undefined" || !group || !item) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
      <div className="relative flex h-full w-full max-w-md flex-col">
        {/* Progress bars */}
        <div className="absolute left-0 right-0 top-0 z-20 flex gap-1 p-3">
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
        <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-3 pb-3 pt-6">
          <div className="flex items-center gap-2">
            <Avatar className="size-9 ring-2 ring-white/40">
              {group.authorImage && (
                <AvatarImage src={group.authorImage || "/placeholder.svg"} alt={group.authorName} />
              )}
              <AvatarFallback className={group.color}>{group.initials}</AvatarFallback>
            </Avatar>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">{group.isSelf ? "Your status" : group.authorName}</p>
              <p className="text-xs text-white/70">{item.postedAt}</p>
            </div>
          </div>
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

        {/* Media */}
        <div className="flex flex-1 items-center justify-center">
          {item.mediaType === "video" ? (
            <video
              ref={videoRef}
              key={item.id}
              src={item.mediaUrl}
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
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.mediaUrl || "/placeholder.svg"} alt="Status" className="max-h-full max-w-full object-contain" />
          )}
        </div>

        {/* Caption */}
        {item.caption && (
          <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/70 to-transparent p-6 pb-8">
            <p className="text-center text-sm text-white">{item.caption}</p>
          </div>
        )}

        {/* Tap zones for prev/next */}
        <button
          type="button"
          onClick={goPrev}
          className="absolute bottom-0 left-0 top-0 z-10 w-1/3"
          aria-label="Previous"
        >
          <ChevronLeft className="ml-1 size-6 text-white/0" />
        </button>
        <button
          type="button"
          onClick={goNext}
          className="absolute bottom-0 right-0 top-0 z-10 w-1/3"
          aria-label="Next"
        >
          <ChevronRight className="mr-1 ml-auto size-6 text-white/0" />
        </button>
      </div>
    </div>,
    document.body,
  )
}
