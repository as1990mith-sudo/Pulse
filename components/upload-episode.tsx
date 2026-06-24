"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, X, Loader2, Headphones, Video, UploadCloud, CheckCircle2, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CoverUpload } from "@/components/admin/cover-upload"
import { uploadMedia } from "@/lib/upload-media"
import { publishShow } from "@/app/actions/shows"
import { cn } from "@/lib/utils"

// Hard cap for uploaded episode media, mirroring the live recording limit.
const MAX_MEDIA_SECONDS = 60 * 60 // 1 hour

/**
 * Reads a local audio/video file's duration (seconds) by loading its metadata
 * into a throwaway media element — no upload required. Returns 0 on failure.
 */
function getMediaDuration(file: File, kind: "audio" | "video"): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const el = document.createElement(kind)
    el.preload = "metadata"
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(el.duration || 0)
    }
    el.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(0)
    }
    el.src = url
  })
}

function formatDuration(secs: number): string {
  if (!secs || !isFinite(secs)) return ""
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}m ${s.toString().padStart(2, "0")}s`
}

/**
 * Lets a profile owner upload their own audio or video episode to their
 * catalogue. Media uploads straight to Blob (via uploadMedia), then we publish
 * the episode with publishShow. Shown only on the owner's own profile.
 */
export function UploadEpisode() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [kind, setKind] = useState<"audio" | "video">("audio")
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaDuration, setMediaDuration] = useState(0)
  const [cover, setCover] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const mediaInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setMediaFile(null)
    setMediaDuration(0)
    setCover(null)
    setTitle("")
    setCategory("")
    setDescription("")
    setError(null)
    if (mediaInputRef.current) mediaInputRef.current.value = ""
  }

  function close() {
    reset()
    setOpen(false)
  }

  async function handleMediaPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    const isVideo = file.type.startsWith("video/")
    const isAudio = file.type.startsWith("audio/")
    if (kind === "video" && !isVideo) {
      setError("Please choose a video file for a video episode.")
      e.target.value = ""
      return
    }
    if (kind === "audio" && !isAudio) {
      setError("Please choose an audio file for an audio episode.")
      e.target.value = ""
      return
    }
    const duration = await getMediaDuration(file, kind)
    if (duration > MAX_MEDIA_SECONDS + 1) {
      setError("Episodes can be up to 1 hour long. Please trim it and try again.")
      e.target.value = ""
      return
    }
    setMediaFile(file)
    setMediaDuration(duration)
    // Default the title to the file name (sans extension) if empty.
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!mediaFile) {
      setError(`Choose ${kind === "video" ? "a video" : "an audio"} file to upload.`)
      return
    }
    if (!title.trim()) {
      setError("Give your episode a title.")
      return
    }

    startTransition(async () => {
      setUploading(true)
      try {
        const media = await uploadMedia(mediaFile, "episodes")

        const result = await publishShow({
          title: title.trim(),
          tagline: category.trim(),
          category: category.trim(),
          duration: formatDuration(mediaDuration),
          description: description.trim(),
          cover,
          audioUrl: kind === "audio" ? media.url : null,
          videoUrl: kind === "video" ? media.url : null,
        })

        if (!result.ok) {
          setError(result.error)
          return
        }
        close()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed. Please try again.")
      } finally {
        setUploading(false)
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-2xl border border-dashed border-border/70 bg-card/60 px-4 py-3.5 text-left transition-colors hover:border-primary/70 hover:bg-card"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
          <Plus className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Upload to catalogue</span>
          <span className="block text-xs text-muted-foreground">Add an audio or video episode from your device</span>
        </span>
      </button>
    )
  }

  const busy = isPending || uploading

  return (
    <form onSubmit={submit} className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      {/* Header with subtle gradient wash */}
      <div className="flex items-center justify-between border-b border-border/60 bg-gradient-to-r from-primary/10 to-transparent px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm">
            <UploadCloud className="size-4" />
          </span>
          <div>
            <p className="font-display text-base font-semibold leading-tight">New episode</p>
            <p className="text-xs text-muted-foreground">Publish to your catalogue</p>
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {/* Audio / Video kind toggle */}
        <div
          role="tablist"
          aria-label="Episode type"
          className="flex items-center gap-1 rounded-full border border-border/60 bg-background p-1"
        >
          {(
            [
              { key: "audio", label: "Audio", icon: Headphones },
              { key: "video", label: "Video", icon: Video },
            ] as const
          ).map(({ key, label, icon: Icon }) => {
            const active = kind === key
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  if (kind === key) return
                  setKind(key)
                  // Switching kind invalidates a previously chosen file.
                  setMediaFile(null)
                  setMediaDuration(0)
                  if (mediaInputRef.current) mediaInputRef.current.value = ""
                }}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            )
          })}
        </div>

        {/* Media file picker */}
        <button
          type="button"
          onClick={() => mediaInputRef.current?.click()}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
            mediaFile
              ? "border-primary/50 bg-primary/5"
              : "border-dashed border-border/70 bg-background hover:border-primary/70",
          )}
        >
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full",
              mediaFile ? "bg-primary/15 text-primary" : "bg-secondary text-foreground",
            )}
          >
            {mediaFile ? <CheckCircle2 className="size-5" /> : <UploadCloud className="size-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {mediaFile ? mediaFile.name : `Choose ${kind} file`}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {mediaFile && mediaDuration ? (
                <>
                  <Clock className="size-3" />
                  {formatDuration(mediaDuration)}
                </>
              ) : (
                <>{kind === "video" ? "MP4, MOV, WebM" : "MP3, WAV, M4A"} · up to 1 hour</>
              )}
            </span>
          </span>
        </button>
        <input
          ref={mediaInputRef}
          type="file"
          accept={kind === "video" ? "video/*" : "audio/*"}
          className="hidden"
          onChange={handleMediaPick}
        />

        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Episode title"
          aria-label="Episode title"
        />
        <Input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category (e.g. Teaching, Worship)"
          aria-label="Category"
        />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a description (optional)"
          aria-label="Description"
          className="min-h-20 resize-none"
        />

        <CoverUpload value={cover} onChange={setCover} label="Cover art (optional)" />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            {busy ? "Publishing…" : "Publish episode"}
          </Button>
        </div>
      </div>
    </form>
  )
}
