"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { uploadMedia } from "@/lib/upload-media"
import { CropModal, type AspectOption } from "@/components/media-editor/crop-modal"
import { TrimModal } from "@/components/media-editor/trim-modal"
import { CoverArtModal } from "@/components/media-editor/cover-art-modal"

/** A media item after it has gone through the pre-post editing flow. */
export type EditedMedia = {
  url: string
  type: "image" | "video"
  /** Optional cover thumbnail (video frame or a custom image). */
  coverImageUrl?: string
  /** Trim range in seconds (videos only) — stored as playback metadata. */
  trimStart?: number
  trimEnd?: number
}

type UploadFolder = Parameters<typeof uploadMedia>[1]

type Stage = "init" | "crop" | "trim" | "cover" | "uploading"

type Pending =
  | { type: "image"; mainBlob: Blob; previewUrl: string }
  | { type: "video"; mainBlob: Blob; trimStart: number; trimEnd: number }

/**
 * Drives the WhatsApp-style pre-post editing flow for a batch of freshly picked
 * files, one at a time:
 *
 *   photo → Crop → (optional) Cover art → upload
 *   video → Trim → (optional) Cover art → upload
 *
 * Collects the edited + uploaded results and hands them back via `onDone`.
 * Cancelling a single item discards just that item and moves on to the next.
 */
export function MediaEditorFlow({
  files,
  uploadFolder = "chat",
  cropRatios,
  maxVideoSeconds,
  onDone,
  onCancel,
}: {
  files: File[]
  uploadFolder?: UploadFolder
  cropRatios?: AspectOption[]
  maxVideoSeconds?: number
  onDone: (items: EditedMedia[]) => void
  onCancel: () => void
}) {
  const [index, setIndex] = useState(0)
  const [stage, setStage] = useState<Stage>("init")
  const [srcUrl, setSrcUrl] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  const resultsRef = useRef<EditedMedia[]>([])

  // Set up (or finish) whenever we advance to a new file.
  useEffect(() => {
    if (index >= files.length) {
      const results = resultsRef.current
      if (results.length > 0) onDone(results)
      else onCancel()
      return
    }
    const file = files[index]
    const url = URL.createObjectURL(file)
    setSrcUrl(url)
    setPending(null)
    setError(null)
    setStage(file.type.startsWith("video/") ? "trim" : "crop")
    return () => URL.revokeObjectURL(url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, files])

  function advance() {
    setPending((p) => {
      if (p && p.type === "image") URL.revokeObjectURL(p.previewUrl)
      return null
    })
    setIndex((i) => i + 1)
  }

  function onCropApply(blob: Blob) {
    const previewUrl = URL.createObjectURL(blob)
    setPending({ type: "image", mainBlob: blob, previewUrl })
    setStage("cover")
  }

  function onTrimApply(range: { trimStart: number; trimEnd: number }) {
    setPending({ type: "video", mainBlob: files[index], trimStart: range.trimStart, trimEnd: range.trimEnd })
    setStage("cover")
  }

  async function finalize(cover: Blob | null) {
    if (!pending) return
    setStage("uploading")
    setError(null)
    try {
      const main = await uploadMedia(
        pending.mainBlob,
        uploadFolder,
        pending.type === "image" ? "photo.jpg" : undefined,
      )
      let coverImageUrl: string | undefined
      if (cover) {
        const uploaded = await uploadMedia(cover, uploadFolder, "cover.jpg")
        coverImageUrl = uploaded.url
      }
      resultsRef.current.push({
        url: main.url,
        type: pending.type,
        coverImageUrl,
        trimStart: pending.type === "video" ? pending.trimStart : undefined,
        trimEnd: pending.type === "video" ? pending.trimEnd : undefined,
      })
      advance()
    } catch {
      setError("Upload failed. Please try again.")
      setStage("cover")
    }
  }

  if (stage === "init" || !srcUrl) return null

  if (stage === "uploading") {
    return (
      <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-black">
        <Loader2 className="size-8 animate-spin text-white" />
        <p className="text-sm font-medium text-white/80">Processing…</p>
      </div>
    )
  }

  if (stage === "crop") {
    return <CropModal imageSrc={srcUrl} ratios={cropRatios} onCancel={advance} onApply={onCropApply} />
  }

  if (stage === "trim") {
    return (
      <TrimModal
        videoSrc={srcUrl}
        maxSeconds={maxVideoSeconds}
        onCancel={advance}
        onApply={onTrimApply}
      />
    )
  }

  // stage === "cover"
  return (
    <>
      <CoverArtModal
        kind={pending?.type === "video" ? "video" : "image"}
        videoSrc={pending?.type === "video" ? srcUrl : undefined}
        imageSrc={pending?.type === "image" ? pending.previewUrl : undefined}
        rangeStart={pending?.type === "video" ? pending.trimStart : 0}
        rangeEnd={pending?.type === "video" ? pending.trimEnd : undefined}
        onSkip={() => finalize(null)}
        onDone={(cover) => finalize(cover)}
      />
      {error && (
        <div className="fixed inset-x-0 bottom-24 z-[90] mx-auto w-fit rounded-full bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-lg">
          {error}
        </div>
      )}
    </>
  )
}
