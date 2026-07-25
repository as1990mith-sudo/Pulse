"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import { ImageIcon, Loader2, Send, Video, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MediaEditorFlow, type EditedMedia } from "@/components/media-editor/media-editor-flow"
import { createPost, type PostMedia } from "@/app/actions/feed"
import type { CurrentUser } from "@/lib/session"
import { cn } from "@/lib/utils"

const MAX_MEDIA = 10

/**
 * Reads a local video's duration (seconds) without uploading, by loading its
 * metadata into a throwaway <video>. Used to enforce the per-room cap before
 * the editor opens.
 */
function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement("video")
    v.preload = "metadata"
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(v.duration)
    }
    v.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Could not read video."))
    }
    v.src = url
  })
}

/**
 * A focused modal composer for community rooms (iTestify testimonies and
 * Question-of-the-Day responses). Reuses the app's shared MediaEditorFlow for
 * cropping photos and trimming videos, and posts through the same `createPost`
 * action used by the main feed — only scoped to a `channel`.
 */
export function ChannelComposer({
  open,
  onClose,
  onCreated,
  channel,
  currentUser,
  title,
  placeholder,
  submitLabel,
  accent = "primary",
  allowVideo = true,
  maxVideoSeconds = 15 * 60,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
  channel: string
  currentUser: CurrentUser
  title: string
  placeholder: string
  submitLabel: string
  accent?: "primary" | "amber" | "rose"
  allowVideo?: boolean
  maxVideoSeconds?: number
}) {
  const [body, setBody] = useState("")
  const [media, setMedia] = useState<PostMedia[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    } else {
      setBody("")
      setMedia([])
      setPendingFiles(null)
      setError(null)
    }
  }, [open])

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ""
    if (files.length === 0) return
    setError(null)

    const remaining = MAX_MEDIA - media.length
    if (remaining <= 0) {
      setError(`You can attach up to ${MAX_MEDIA} items.`)
      return
    }

    setUploading(true)
    try {
      const valid: File[] = []
      for (const file of files.slice(0, remaining)) {
        const isVideo = file.type.startsWith("video/")
        const isImage = file.type.startsWith("image/")
        if (!isVideo && !isImage) {
          setError("Please choose photos or videos only.")
          continue
        }
        if (isVideo && !allowVideo) {
          setError("Only photos can be attached here.")
          continue
        }
        if (isVideo) {
          const duration = await getVideoDuration(file).catch(() => 0)
          if (duration > maxVideoSeconds + 1) {
            const mins = Math.floor(maxVideoSeconds / 60)
            setError(`Videos can be up to ${mins} minutes. Please trim it and try again.`)
            continue
          }
        }
        valid.push(file)
      }
      if (valid.length > 0) setPendingFiles(valid)
    } finally {
      setUploading(false)
    }
  }

  function handleEditorDone(items: EditedMedia[]) {
    setMedia((prev) =>
      [
        ...prev,
        ...items.map((it) => ({
          url: it.url,
          type: it.type,
          coverImageUrl: it.coverImageUrl,
          trimStart: it.trimStart,
          trimEnd: it.trimEnd,
          aspectRatio: it.aspectRatio,
        })),
      ].slice(0, MAX_MEDIA),
    )
    setPendingFiles(null)
  }

  function removeMediaAt(index: number) {
    setMedia((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text && media.length === 0) return
    setError(null)
    startTransition(async () => {
      try {
        await createPost({ text, media, channel })
        onCreated()
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not post. Please try again.")
      }
    })
  }

  if (!open || typeof document === "undefined") return null

  const ring =
    accent === "amber"
      ? "ring-amber-500/30"
      : accent === "rose"
        ? "ring-rose-500/30"
        : "ring-border/60"

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
        <button className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
        <div className="relative z-10 w-full max-w-lg rounded-t-3xl border border-border/60 bg-card p-5 shadow-2xl duration-200 animate-in slide-in-from-bottom sm:rounded-3xl">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className={cn("size-10 ring-2", ring)}>
                {currentUser.image && <AvatarImage src={currentUser.image || "/placeholder.svg"} alt="" />}
                <AvatarFallback className={currentUser.color}>{currentUser.initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-semibold">{title}</p>
                <p className="truncate text-xs text-muted-foreground">Posting as {currentUser.name}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <Textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={placeholder}
              rows={4}
              maxLength={2000}
              className="resize-none rounded-2xl text-base"
            />

            {media.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {media.map((m, i) => (
                  <div key={`${m.url}-${i}`} className="relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted">
                    {m.type === "video" ? (
                      <video src={m.url} poster={m.coverImageUrl} muted playsInline className="size-full object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url || "/placeholder.svg"} alt="" className="size-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => removeMediaAt(i)}
                      className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-foreground shadow-sm"
                      aria-label="Remove attachment"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center gap-1">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploading || media.length >= MAX_MEDIA}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-50"
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
                Photo
              </button>
              {allowVideo && (
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  disabled={uploading || media.length >= MAX_MEDIA}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  <Video className="size-4" />
                  Video
                </button>
              )}
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">{body.length}/2000</span>
            </div>

            {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              className="mt-3 w-full gap-2 rounded-full"
              disabled={isPending || uploading || (!body.trim() && media.length === 0)}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {submitLabel}
            </Button>
          </form>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={handlePick}
          />
          {allowVideo && (
            <input ref={videoInputRef} type="file" accept="video/*" className="sr-only" onChange={handlePick} />
          )}
        </div>
      </div>

      {pendingFiles && (
        <MediaEditorFlow
          files={pendingFiles}
          uploadFolder="chat"
          maxVideoSeconds={maxVideoSeconds}
          onDone={handleEditorDone}
          onCancel={() => setPendingFiles(null)}
        />
      )}
    </>,
    document.body,
  )
}
