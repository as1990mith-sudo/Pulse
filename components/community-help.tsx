"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import useSWR from "swr"
import {
  ArrowLeft,
  Check,
  Copy,
  Flame,
  ImagePlus,
  Info,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Share2,
  Trash2,
  User,
  VenetianMask,
  X,
} from "lucide-react"
import { CommentIcon } from "@/components/comment-icon"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ShareSheet } from "@/components/share-sheet"
import type { ShareTarget } from "@/lib/share-types"
import { renderMessageBody } from "@/lib/rich-text"
import { compressImage, cropImageToAspect, uploadMedia } from "@/lib/upload-media"
import { useAutoHideChatChrome, useChatChromeHidden } from "@/lib/chat-chrome"
import { cn } from "@/lib/utils"
import {
  createCommunityPost,
  deleteCommunityPost,
  editCommunityPost,
  getCommunityPosts,
  type CommunityPostView,
} from "@/app/actions/community"
import { MiniChatProvider, useMiniChat } from "@/components/mini-chat"
import { CommunityConversation } from "@/components/community-conversation"
import { FeedVideo } from "@/components/feed-video"
import { VideoLightbox } from "@/components/community-video-lightbox"
import { ImageLightbox } from "@/components/image-lightbox"
import {
  ANON_AVATAR,
  ANON_NAME,
  BibleChips,
  CommunityAvatar,
  FeedPostImage,
  LikeButton,
  PostMeta,
  SaveButton,
} from "@/components/community-help-shared"
import { ClampedText, CLAMP_LINES } from "@/components/clamped-text"

/* -------------------------------------------------------------------------- */
/*  Question text with graceful "See more" collapse                           */
/* -------------------------------------------------------------------------- */

function QuestionText({ text, onOpen }: { text: string; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
      className="mt-1 cursor-pointer outline-none"
    >
      {/* Six-line preview, then an inline "Read more" that expands in place and
          collapses again — the reader stays in the timeline rather than being
          navigated into the post. */}
      <ClampedText
        lines={CLAMP_LINES.POST}
        className="whitespace-pre-wrap break-words text-[15.5px] leading-relaxed text-foreground text-pretty"
      >
        {renderMessageBody(text, { link: true, mention: true })}
      </ClampedText>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Feed video                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A post's attached video in the feed. Uses the shared FeedVideo player so the
 * clip auto-plays when it scrolls into view (and pauses when it leaves) — the
 * same behavior as the reels/mind feed. Feed media uses just two card shapes: a
 * clip that is exactly 1:1 or 16:9 keeps its own ratio, and EVERYTHING else
 * (portrait 9:16, 4:5, or any other crop) is presented in a uniform 4:5 portrait
 * card. The clip always `object-cover`-fills that card (no letterbox bars); the
 * untouched full ratio is revealed when it's tapped open full screen (onExpand).
 */
function FeedPostVideo({ src }: { src: string }) {
  // Default to 4:5 before metadata loads (the common portrait case here), then
  // settle onto the clip's true ratio once known.
  const [ratio, setRatio] = useState<number>(4 / 5)
  // Tapping the clip opens the shared full-screen viewer.
  const [fullscreen, setFullscreen] = useState(false)
  // 1:1 and 16:9 fill their own card; any other ratio (incl. 9:16) is framed 4:5.
  const isStandard = [1, 16 / 9].some((a) => Math.abs(ratio - a) < 0.02)
  const aspect = isStandard ? ratio : 4 / 5
  return (
    <div
      className="relative mt-3 w-full overflow-hidden rounded-md border border-border/60 bg-black"
      style={{ aspectRatio: String(aspect), maxHeight: "32rem" }}
    >
      {/* While the full-screen viewer is open the inline clip is unmounted so
          only one <video> plays. Both instances share a playback position by
          `src`, so remounting with `resume` on close continues seamlessly with
          the same sound state — the expand feels instant, not a fresh load. */}
      {!fullscreen && (
        <FeedVideo
          src={src}
          className="h-full w-full object-cover"
          onAspectRatio={setRatio}
          resume
          onExpand={() => setFullscreen(true)}
        />
      )}
      {fullscreen && <VideoLightbox src={src} onClose={() => setFullscreen(false)} />}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Post (feed row)                                                           */
/* -------------------------------------------------------------------------- */

function PostItem({
  post,
  onDeleted,
  onOpen,
  highlighted = false,
}: {
  post: CommunityPostView
  onDeleted: (id: number) => void
  onOpen: () => void
  highlighted?: boolean
}) {
  const { openProfile } = useMiniChat()
  const [shareOpen, setShareOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(post.body)
  const [draft, setDraft] = useState(post.body)
  const [edited, setEdited] = useState(post.edited)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Tapping attached media opens it full screen (image lightbox / video overlay)
  // instead of the conversation, so the media can be viewed at its true ratio.
  const [mediaOpen, setMediaOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [menuOpen])

  const shareTarget: ShareTarget = {
    type: "community",
    key: String(post.id),
    title: "A question on Community Help",
    subtitle: body.length > 120 ? `${body.slice(0, 120)}…` : body,
    url: `/chatrooms/community?q=${post.id}`,
    image: null,
    downloadUrl: null,
    downloadKind: null,
  }

  function handleDelete() {
    setMenuOpen(false)
    startTransition(async () => {
      try {
        await deleteCommunityPost(post.id)
        onDeleted(post.id)
      } catch {
        /* ignore */
      }
    })
  }

  async function handleCopy() {
    setMenuOpen(false)
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  function startEdit() {
    setMenuOpen(false)
    setDraft(body)
    setError(null)
    setEditing(true)
  }

  function saveEdit() {
    const text = draft.trim()
    if (!text || text === body) {
      setEditing(false)
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const updated = await editCommunityPost({ postId: post.id, body: text })
        setBody(updated)
        setEdited(true)
        setEditing(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save your changes.")
      }
    })
  }

  return (
    <article
      id={`q-${post.id}`}
      className={cn(
        "scroll-mt-24 px-4 py-5 transition-colors sm:px-6",
        highlighted && "bg-emerald-500/5",
      )}
    >
      {/* Header: the avatar and the name/date sit on ONE centered row, so the
          name aligns to the vertical middle of the avatar rather than its top.
          The body, media and actions then flow in an indented block below. */}
      <div className="flex items-center gap-3">
        <CommunityAvatar post={post} onAuthorClick={openProfile} />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <PostMeta post={post} edited={edited} onAuthorClick={openProfile} />
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className={cn(
                "-mr-1 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                menuOpen && "bg-secondary text-foreground",
              )}
              aria-label="Post options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal className="size-5" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-2xl border border-border/60 bg-card p-1 shadow-xl duration-150 animate-in fade-in zoom-in-95"
              >
                {post.isSelf && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={startEdit}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
                  >
                    <Pencil className="size-4" /> Edit
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleCopy}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
                >
                  <Copy className="size-4" /> Copy text
                </button>
                {post.isSelf && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleDelete}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="size-4" /> Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body, media and actions — indented (pl-14) to align under the name,
          clearing the avatar gutter (avatar size-11 + gap-3). Pulled up with a
          negative margin so the body sits closer to the name line, absorbing the
          whitespace left by centering the name in the tall avatar. Anonymous
          posts carry a single-line identity (no handle beneath the name), so
          they get a larger pull-up to close the extra gap. */}
      <div className={cn(post.anonymous ? "-mt-3" : "-mt-1", "pl-14")}>
        {editing ? (
          <div className="mt-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              maxLength={1000}
              autoFocus
              className="resize-none rounded-2xl text-[17px]"
            />
            {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
            <div className="mt-2 flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={() => setEditing(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="button" size="sm" className="gap-1.5 rounded-full" onClick={saveEdit} disabled={isPending || !draft.trim()}>
                {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            {body && <QuestionText text={body} onOpen={onOpen} />}
            <BibleChips text={body} className="mt-3" />
          </>
        )}

        {post.imageUrl && <FeedPostImage src={post.imageUrl} onClick={() => setMediaOpen(true)} className="mt-3" />}

        {post.videoUrl && <FeedPostVideo src={post.videoUrl} />}

        {/* Engagement actions — spread evenly across the width so Like, Reply,
            Share and Save sit at consistent intervals under the post. */}
        <div className="mt-3 flex items-center justify-between">
          <LikeButton postId={post.id} initialLikes={post.likes} initialLiked={post.liked} variant="row" />
          <button
            type="button"
            onClick={onOpen}
            aria-label="Reply"
            className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <CommentIcon className="size-5" />
            {post.commentCount > 0 && <span className="tabular-nums">{post.commentCount}</span>}
          </button>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            aria-label="Share"
            className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Share2 className="size-5" />
          </button>
          <SaveButton postId={post.id} variant="row" />
        </div>
        {copied && (
          <span className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5" /> Copied
          </span>
        )}
      </div>

      {/* Full-screen photo, opened by tapping the attached image. Video has its
          own in-component full-screen viewer (see FeedPostVideo). */}
      {mediaOpen && post.imageUrl && (
        <ImageLightbox src={post.imageUrl} alt="Attached to the question" onClose={() => setMediaOpen(false)} />
      )}

      <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />
    </article>
  )
}

/* -------------------------------------------------------------------------- */
/*  Skeleton (first load)                                                     */
/* -------------------------------------------------------------------------- */

function FeedSkeleton() {
  return (
    <div className="divide-y divide-border/60">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex animate-pulse gap-3 px-4 py-5 sm:px-6">
          <div className="size-11 shrink-0 rounded-full bg-secondary" />
          <div className="flex-1">
            <div className="space-y-2">
              <div className="h-3.5 w-24 rounded-full bg-secondary" />
              <div className="h-2.5 w-16 rounded-full bg-secondary/70" />
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-4 w-11/12 rounded-full bg-secondary" />
              <div className="h-4 w-3/4 rounded-full bg-secondary/80" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Composer (ask anonymously)                                                */
/* -------------------------------------------------------------------------- */

// Aspect ratios a user can crop an attached photo to. Square first as the
// safest, most neutral default.
const ASPECT_RATIOS = [
  { label: "1:1", w: 1, h: 1 },
  { label: "4:5", w: 4, h: 5 },
  { label: "16:9", w: 16, h: 9 },
  { label: "9:16", w: 9, h: 16 },
  ] as const

/** Resolve an image's natural pixel dimensions from an object URL. */
function loadImageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = reject
    img.src = url
  })
}

/**
 * Interactive crop frame. Shows the photo scaled to *cover* a box of the chosen
 * aspect ratio; the user drags to reposition it, and whatever fills the frame is
 * exactly what gets cropped. The drag maps to a normalized pan offset (0..1 per
 * axis) that mirrors `cropImageToAspect`'s math: on the trimmed axis, offset 0 =
 * top/left edge, 1 = bottom/right edge. Only the over-flowing axis can move.
 */
function CropFrame({
  src,
  ratio,
  natural,
  offset,
  onCommit,
  uploading,
  progress,
  onRemove,
}: {
  src: string
  ratio: (typeof ASPECT_RATIOS)[number]
  natural: { w: number; h: number } | null
  offset: { x: number; y: number }
  onCommit: (next: { x: number; y: number }) => void
  uploading: boolean
  progress: number
  onRemove: () => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  // Live offset during a drag (committed on pointer up to trigger the re-crop).
  const [live, setLive] = useState(offset)
  const drag = useRef<{ startX: number; startY: number; base: { x: number; y: number } } | null>(null)
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

  useEffect(() => {
    setLive(offset)
  }, [offset])

  const frameRatio = ratio.w / ratio.h
  const imgRatio = natural ? natural.w / natural.h : frameRatio
  // Which axis overflows the frame (that's the one the user can pan).
  const canPanX = imgRatio > frameRatio + 1e-3
  const canPanY = imgRatio < frameRatio - 1e-3

  // Convert the current offset into a CSS object-position percentage.
  const posX = canPanX ? clamp01(live.x) * 100 : 50
  const posY = canPanY ? clamp01(live.y) * 100 : 50

  function onPointerDown(e: React.PointerEvent) {
    if (uploading || (!canPanX && !canPanY)) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, startY: e.clientY, base: live }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    const frame = frameRef.current
    if (!d || !frame) return
    const rect = frame.getBoundingClientRect()
    // Dragging right should reveal the left of the photo, so invert the delta.
    // Scale by the overflow amount so a full-width drag spans the whole range.
    const overflowX = rect.width * (imgRatio / frameRatio - 1)
    const overflowY = rect.height * (frameRatio / imgRatio - 1)
    const nx = canPanX && overflowX > 0 ? clamp01(d.base.x - (e.clientX - d.startX) / overflowX) : live.x
    const ny = canPanY && overflowY > 0 ? clamp01(d.base.y - (e.clientY - d.startY) / overflowY) : live.y
    setLive({ x: nx, y: ny })
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!drag.current) return
    drag.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
    // Only re-crop if the pan actually changed.
    if (Math.abs(live.x - offset.x) > 1e-3 || Math.abs(live.y - offset.y) > 1e-3) onCommit(live)
  }

  const canPan = canPanX || canPanY

  return (
    <div className="mt-3 flex justify-center">
      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ aspectRatio: `${ratio.w} / ${ratio.h}` }}
        className={cn(
          "relative w-full max-w-xs touch-none select-none overflow-hidden rounded-lg border border-border/60 bg-secondary",
          canPan && !uploading ? "cursor-grab active:cursor-grabbing" : "",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src || "/placeholder.svg"}
          alt="Selected attachment preview"
          draggable={false}
          style={{ objectPosition: `${posX}% ${posY}%` }}
          className="pointer-events-none h-full w-full object-cover"
        />
        {uploading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60 backdrop-blur-sm">
            <Loader2 className="size-6 animate-spin text-foreground" />
            <span className="text-xs font-medium text-foreground tabular-nums">{progress}%</span>
          </div>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
          aria-label="Remove attachment"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}

function Composer({
  open,
  onClose,
  onCreated,
  homeId,
}: {
  open: boolean
  onClose: () => void
  onCreated: (p: CommunityPostView) => void
  homeId?: string | null
}) {
  const [body, setBody] = useState("")
  // The author's identity choice for this post. Anonymous by default so the
  // room stays a safe place to ask; the user can opt to post identifiably.
  const [anonymous, setAnonymous] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Attached media (image OR video): a local object-URL preview while the file
  // uploads to Blob in the background, then the final public URL once the
  // upload resolves.
  const [mediaKind, setMediaKind] = useState<"image" | "video" | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  // Keep the originally-picked file so we can re-crop to a different aspect
  // ratio (or a new pan position) without asking the user to choose the photo
  // again (images only).
  const [rawFile, setRawFile] = useState<File | null>(null)
  const [ratio, setRatio] = useState<(typeof ASPECT_RATIOS)[number]>(ASPECT_RATIOS[0])
  // Natural pixel size of the picked photo + the current pan offset (0..1 on
  // each axis, 0.5 = centered) so the user can drag the image within the frame.
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null)
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 })
  // Monotonic token so a late-finishing crop/upload can't overwrite a newer one
  // (rapid ratio switches or pan adjustments each supersede the previous).
  const cropTokenRef = useRef(0)

  function resetMedia() {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setMediaKind(null)
    setImageUrl(null)
    setVideoUrl(null)
    setUploading(false)
    setProgress(0)
    setRawFile(null)
    setRatio(ASPECT_RATIOS[0])
    setImgNatural(null)
    setOffset({ x: 0.5, y: 0.5 })
    // Invalidate any in-flight crop/upload.
    cropTokenRef.current++
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 50)
    else {
      setBody("")
      setError(null)
      setAnonymous(true)
      resetMedia()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open || typeof document === "undefined") return null

  // Crops the raw photo to the chosen aspect ratio + pan offset, then
  // compresses + uploads. Runs on first pick and again whenever the ratio or
  // pan position changes. The on-screen preview is the live interactive frame
  // (CropFrame), so this only produces the final blob to post — it never
  // touches `preview`. A token guards against out-of-order results.
  async function processImage(
    file: File,
    r: (typeof ASPECT_RATIOS)[number],
    off: { x: number; y: number },
  ) {
    const token = ++cropTokenRef.current
    setError(null)
    setImageUrl(null)
    setUploading(true)
    setProgress(0)
    try {
      const cropped = await cropImageToAspect(file, r.w, r.h, off.x, off.y)
      const compressed = await compressImage(cropped)
      const uploaded = await uploadMedia(compressed, "community", file.name, (p) => {
        if (cropTokenRef.current === token) setProgress(p)
      })
      if (cropTokenRef.current !== token) return // superseded by a newer crop
      setImageUrl(uploaded.url)
    } catch {
      if (cropTokenRef.current === token) {
        setError("That image couldn't be uploaded. Please try another.")
        resetMedia()
      }
    } finally {
      if (cropTokenRef.current === token) setUploading(false)
    }
  }

  // Videos aren't cropped/compressed in the browser — they upload as-is (Blob
  // multipart parallelizes large files) with a live progress indicator.
  async function processVideo(file: File) {
    setError(null)
    setVideoUrl(null)
    setUploading(true)
    setProgress(0)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
    try {
      const uploaded = await uploadMedia(file, "community", file.name, setProgress)
      setVideoUrl(uploaded.url)
    } catch {
      setError("That video couldn't be uploaded. Please try another.")
      resetMedia()
    } finally {
      setUploading(false)
    }
  }

  async function handlePickMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const isImage = file.type.startsWith("image/")
    const isVideo = file.type.startsWith("video/")
    if (!isImage && !isVideo) {
      setError("Please choose an image or a video file.")
      return
    }
    // Guard against absurdly large uploads. Images are recompressed anyway; the
    // cap really matters for video.
    if (isVideo && file.size > 128 * 1024 * 1024) {
      setError("That video is too large. Please choose one under 128 MB.")
      return
    }
    setRawFile(isImage ? file : null)
    setMediaKind(isImage ? "image" : "video")
    if (isImage) {
      // Show the original photo in the interactive crop frame right away…
      const url = URL.createObjectURL(file)
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
      const centered = { x: 0.5, y: 0.5 }
      setOffset(centered)
      try {
        setImgNatural(await loadImageSize(url))
      } catch {
        setImgNatural(null)
      }
      // …and upload a first (centered) crop in the background.
      await processImage(file, ratio, centered)
    } else {
      await processVideo(file)
    }
  }

  // Switching ratio recenters the pan and re-crops.
  function applyRatio(r: (typeof ASPECT_RATIOS)[number]) {
    if (uploading || r.label === ratio.label) return
    setRatio(r)
    const centered = { x: 0.5, y: 0.5 }
    setOffset(centered)
    if (rawFile) void processImage(rawFile, r, centered)
  }

  // Called when the user finishes dragging the photo — re-crop at the new pan.
  function commitCrop(next: { x: number; y: number }) {
    setOffset(next)
    if (rawFile && mediaKind === "image") void processImage(rawFile, ratio, next)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text && !imageUrl && !videoUrl) return
    if (uploading) return
    setError(null)
    startTransition(async () => {
      try {
        const created = await createCommunityPost(text, imageUrl, videoUrl, anonymous, homeId)
        onCreated(created)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not post your question.")
      }
    })
  }

  const canPost = (!!body.trim() || !!imageUrl || !!videoUrl) && !uploading && !isPending

  // Character budget feedback: silent until the last stretch, then it earns
  // attention. Showing "0/1000" from the first keystroke is noise.
  const remaining = 1000 - body.length
  const showCount = body.length > 800

  return createPortal(
    // z-60 (not z-50) because the global BottomNav is itself fixed at z-50: at
    // equal stacking the nav covered the pinned footer and the Post button with
    // it. A modal dialog should sit above the app chrome it blocks anyway.
    <div className="fixed inset-0 z-60 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      {/* Three-part shell: fixed header, scrolling body, pinned footer. The
          submit action stays reachable no matter how much has been typed or how
          tall the media preview is, instead of scrolling away with the form. */}
      <div className="relative z-10 flex max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border/60 bg-card shadow-2xl duration-200 animate-in slide-in-from-bottom sm:max-h-[90dvh] sm:rounded-3xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-border/50 px-4 py-3.5">
          {anonymous ? (
            <Avatar className="size-9 shrink-0 ring-1 ring-border">
              <AvatarImage src={ANON_AVATAR || "/placeholder.svg"} alt="" />
              <AvatarFallback className="bg-muted text-sm font-bold text-muted-foreground">?</AvatarFallback>
            </Avatar>
          ) : (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-border">
              <User className="size-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight text-foreground">
              {anonymous ? ANON_NAME : "Posting as yourself"}
            </p>
            <p className="truncate text-xs leading-tight text-muted-foreground">
              {anonymous ? "Your identity stays private" : "Your name and photo will be shown"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="-mr-1 shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {/* Identity choice — anonymous (default) or identifiable. */}
          <div
            role="radiogroup"
            aria-label="Post identity"
            className="grid grid-cols-2 gap-1 rounded-lg bg-secondary/60 p-1"
          >
            {(
              [
                { on: true, icon: VenetianMask, label: "Anonymous" },
                { on: false, icon: User, label: "Show my name" },
              ] as const
            ).map((opt) => {
              const active = anonymous === opt.on
              return (
                <button
                  key={opt.label}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setAnonymous(opt.on)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[13px] font-semibold transition-colors",
                    active
                      ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <opt.icon className="size-3.5" />
                  {opt.label}
                </button>
              )
            })}
          </div>

          <form id="community-composer" onSubmit={handleSubmit} className="mt-3">
            {/* Fixed-height writing surface. The shared Textarea sets
                `field-sizing-content`, which grew the box with every new line and
                pushed the rest of the composer down the screen; `field-sizing-fixed`
                pins it so long text scrolls inside a stable frame instead. */}
            <Textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ask anything… what's on your heart?"
              maxLength={1000}
              className="field-sizing-fixed h-32 min-h-0 resize-none overflow-y-auto rounded-xl bg-secondary/30 px-3.5 py-3 text-base leading-relaxed"
            />

            {/* Media preview (image or video) with upload progress + remove control */}
            {preview && (
              <>
                {mediaKind === "video" ? (
                  <div className="mt-3 flex justify-center">
                    <div className="relative inline-block overflow-hidden rounded-lg border border-border/60">
                      <video src={preview} controls playsInline className="max-h-72 max-w-full bg-black object-contain" />
                      {uploading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60 backdrop-blur-sm">
                          <Loader2 className="size-6 animate-spin text-foreground" />
                          <span className="text-xs font-medium text-foreground tabular-nums">{progress}%</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={resetMedia}
                        className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
                        aria-label="Remove attachment"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <CropFrame
                      src={preview}
                      ratio={ratio}
                      natural={imgNatural}
                      offset={offset}
                      onCommit={commitCrop}
                      uploading={uploading}
                      progress={progress}
                      onRemove={resetMedia}
                    />

                    {/* Aspect ratio picker — images only (video can't be cropped here) */}
                    <div className="mt-3 flex items-center justify-center gap-1.5">
                      {ASPECT_RATIOS.map((r) => (
                        <button
                          key={r.label}
                          type="button"
                          onClick={() => applyRatio(r)}
                          disabled={uploading}
                          aria-pressed={ratio.label === r.label}
                          className={cn(
                            "rounded-md border px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors disabled:opacity-50",
                            ratio.label === r.label
                              ? "border-emerald-500/70 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "border-border/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
                          )}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-center text-xs text-muted-foreground">Drag the photo to reposition it</p>
                  </>
                )}
              </>
            )}

            <input ref={fileInputRef} type="file" accept="image/*,video/*" className="sr-only" onChange={handlePickMedia} />

            {error && <p className="mt-2.5 text-xs font-medium text-destructive">{error}</p>}
          </form>
        </div>

        {/* Extra bottom inset on the sheet layout keeps the Post button clear of
            the iOS home indicator; the centered dialog (sm+) needs no inset. */}
        <footer className="flex shrink-0 items-center gap-2 border-t border-border/50 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:pb-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!!preview}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-40 dark:text-emerald-400"
          >
            <ImagePlus className="size-4" />
            {preview ? "Attached" : "Photo or video"}
          </button>
          {showCount && (
            <span
              className={cn(
                "ml-auto text-xs font-medium tabular-nums",
                remaining <= 50 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {remaining}
            </span>
          )}
          <Button
            type="submit"
            form="community-composer"
            className={cn("h-9 gap-1.5 rounded-lg px-4", !showCount && "ml-auto")}
            disabled={!canPost}
          >
            {isPending || uploading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {uploading ? "Uploading…" : "Post"}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

/* -------------------------------------------------------------------------- */
/*  Info modal                                                                */
/* -------------------------------------------------------------------------- */

// Exported so the Chat Rooms two-tab hub can trigger the same information from
// the info (ⓘ) button beside the "Community Help" tab label — the standalone
// header that used to hold it is hidden in embedded mode.
export function CommunityHelpInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open || typeof document === "undefined") return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full max-w-lg rounded-t-3xl border border-border/60 bg-card p-6 shadow-2xl duration-200 animate-in slide-in-from-bottom sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">How Community Help works</h2>
          <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-secondary" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <div className="flex gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 font-bold text-white">?</span>
            <p>
              <span className="font-semibold text-foreground">Ask anonymously.</span> Tap{" "}
              <span className="font-medium text-foreground">Ask</span> to post a question or prayer request. It appears
              as <span className="font-medium text-foreground">&ldquo;Anonymous&rdquo;</span> to everyone, so you can
              share honestly without revealing who you are.
            </p>
          </div>
          <div className="flex gap-3">
            <CommentIcon className="mt-0.5 size-7 shrink-0 text-primary" />
            <p>
              <span className="font-semibold text-foreground">Replies are personal.</span> When you answer to help
              someone, your real name and photo are shown — so encouragement comes from real, accountable people the
              community can trust.
            </p>
          </div>
          <div className="flex gap-3">
            <Flame className="mt-0.5 size-7 shrink-0 text-primary" />
            <p>
              <span className="font-semibold text-foreground">Testimonies live in iTestify.</span> Switch to the{" "}
              <span className="font-medium text-foreground">iTestify</span> tab to celebrate answered prayers and share
              what God has done.
            </p>
          </div>
          <div className="flex gap-3">
            <Info className="mt-0.5 size-7 shrink-0 text-primary" />
            <p>
              <span className="font-semibold text-foreground">A safe, respectful space.</span> Be kind and gentle, keep
              things confidential, and treat every question as someone genuinely reaching out for support.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* -------------------------------------------------------------------------- */
/*  Root                                                                      */
/* -------------------------------------------------------------------------- */

export function CommunityHelp({
  initialPosts,
  // When rendered inside the Chat Rooms two-tab hub the page IS /chatrooms, so
  // the "Back to chatrooms" arrow would loop back to itself — hide it there.
  embedded = false,
  // When set, this is a PRIVATE Home Community Help: posts are fetched and
  // created scoped to that Home, and never mix with the Universal room.
  homeId = null,
}: {
  initialPosts: CommunityPostView[]
  embedded?: boolean
  homeId?: string | null
}) {
  const {
    data: posts = initialPosts,
    isLoading,
    mutate: mutatePosts,
  } = useSWR(
    homeId ? ["community-posts", homeId] : "community-posts",
    () => getCommunityPosts(homeId),
    {
      fallbackData: initialPosts,
      refreshInterval: 20000,
    },
  )
  const [composerOpen, setComposerOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [highlightedQ, setHighlightedQ] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  // One-shot flag consumed by the history effect below: true only for the
  // conversation opened directly by an incoming ?q=<id> deep link (e.g. tapping
  // a post on someone's profile). In that case the current history entry already
  // represents this view, so we must NOT push another one.
  const openedViaDeepLinkRef = useRef(false)
  // Stays true while that deep-linked conversation is the active screen, so the
  // in-UI close button also returns to the origin page (the profile) rather than
  // peeling back to the Community Help feed the user never intended to visit.
  const deepLinkCloseRef = useRef(false)
  // Auto-hide the global app header as the feed scrolls (Instagram/Telegram feel).
  const onFeedScroll = useAutoHideChatChrome()
  const chromeHidden = useChatChromeHidden()

  // Pull-to-refresh (touch): pull distance while dragging + a refreshing flag.
  const scrollerRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  function handleTouchStart(e: React.TouchEvent) {
    const el = scrollerRef.current
    touchStartY.current = el && el.scrollTop <= 0 ? e.touches[0].clientY : null
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartY.current === null || refreshing) return
    const el = scrollerRef.current
    const dy = e.touches[0].clientY - touchStartY.current
    // Upward drag, or the list has actually scrolled — hand control back to
    // native scrolling so the gesture never fights momentum (the smooth feel).
    if (dy <= 0 || (el && el.scrollTop > 0)) {
      if (pull !== 0) setPull(0)
      return
    }
    setPull(Math.min(72, dy * 0.5))
  }
  async function handleTouchEnd() {
    if (touchStartY.current === null) return
    touchStartY.current = null
    if (pull > 52 && !refreshing) {
      setRefreshing(true)
      setPull(44)
      try {
        await mutatePosts()
      } finally {
        setRefreshing(false)
        setPull(0)
      }
    } else {
      setPull(0)
    }
  }

  const activePost = activeId === null ? null : posts.find((p) => p.id === activeId) ?? null
  const relatedPosts = activeId === null ? [] : posts.filter((p) => p.id !== activeId).slice(0, 5)

  // Deep link: arriving with ?q=<id> from a shared link opens that conversation
  // directly (falling back to a gentle scroll+highlight if it isn't loaded).
  useEffect(() => {
    if (typeof window === "undefined") return
    const targetId = new URLSearchParams(window.location.search).get("q")
    if (!targetId) return
    const numeric = Number(targetId)
    if (posts.some((p) => p.id === numeric)) {
      openedViaDeepLinkRef.current = true
      deepLinkCloseRef.current = true
      setActiveId(numeric)
      return
    }
    const t = setTimeout(() => {
      const el = document.getElementById(`q-${targetId}`)
      if (!el) return
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      setHighlightedQ(targetId)
      setTimeout(() => setHighlightedQ(null), 2400)
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Treat the expanded conversation as a navigable screen: opening it pushes a
  // history entry so the phone/browser Back button returns to the feed preview
  // (just closing the overlay) instead of navigating away from Community Help.
  const conversationOpen = activeId !== null
  useEffect(() => {
    if (!conversationOpen || typeof window === "undefined") return
    // Deep-linked open: the current history entry IS this conversation view, so
    // adding another would make Back merely peel the overlay onto the feed. Skip
    // the push so Back returns to the origin page (the profile) in a single step.
    // Applies to the initial open only; later in-feed opens push as normal.
    if (openedViaDeepLinkRef.current) {
      openedViaDeepLinkRef.current = false
      return
    }
    // A normal in-feed open is not a deep-link screen anymore.
    deepLinkCloseRef.current = false
    window.history.pushState({ chConversation: true }, "")
    const onPop = () => setActiveId(null)
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [conversationOpen])

  // Closing via the UI (X button / backdrop / delete) consumes the history entry
  // we pushed so the Back button doesn't need an extra press; the popstate
  // handler above then clears activeId. Falls back to a direct clear otherwise.
  function closeConversation() {
    const state = typeof window !== "undefined" ? (window.history.state as { chConversation?: boolean } | null) : null
    if (state?.chConversation) {
      // In-feed open: pop the entry we pushed, returning to the feed preview.
      window.history.back()
    } else if (deepLinkCloseRef.current && typeof window !== "undefined" && window.history.length > 1) {
      // Deep-linked open (e.g. from a profile): go back to the origin page so
      // closing matches the hardware Back button. Fall back to just clearing the
      // overlay when there's no in-app history (a fresh external share link).
      deepLinkCloseRef.current = false
      window.history.back()
    } else {
      setActiveId(null)
    }
  }

  // All three optimistic updates below go through `mutatePosts` — the mutator
  // bound to this instance's own SWR key — rather than the bare string
  // "community-posts". In a private Home the key is ["community-posts", homeId],
  // so writing to the string key updated a cache entry nothing was reading: a
  // new post flashed in from local state and then vanished on the next 20s
  // revalidation.
  function handleCreated(post: CommunityPostView) {
    void mutatePosts((prev: CommunityPostView[] | undefined) => [post, ...(prev ?? [])], { revalidate: false })
  }

  function handleDeleted(id: number) {
    if (activeId === id) closeConversation()
    void mutatePosts((prev: CommunityPostView[] | undefined) => (prev ?? []).filter((p) => p.id !== id), {
      revalidate: false,
    })
  }

  // Keep feed reply counts in sync when replies are added/removed in the
  // conversation screen (optimistic, no refetch).
  function handleCountChange(postId: number, delta: number) {
    void mutatePosts(
      (prev: CommunityPostView[] | undefined) =>
        (prev ?? []).map((p) => (p.id === postId ? { ...p, commentCount: Math.max(0, p.commentCount + delta) } : p)),
      { revalidate: false },
    )
  }

  return (
    <MiniChatProvider>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Standalone header — hidden when embedded in the Chat Rooms hub. */}
        {!embedded && (
          <header
            className={cn(
              "flex items-center gap-3 overflow-hidden border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur transition-[max-height,opacity,padding] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none sm:px-6",
              chromeHidden ? "pointer-events-none max-h-0 border-transparent py-0 opacity-0" : "max-h-24 opacity-100",
            )}
          >
            <Link
              href="/chatrooms"
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Back to chatrooms"
            >
              <ArrowLeft className="size-5" />
            </Link>
            <Avatar className="size-9 ring-2 ring-border/70">
              <AvatarImage src={ANON_AVATAR || "/placeholder.svg"} alt="" />
              <AvatarFallback className="bg-muted font-bold text-muted-foreground">?</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate text-xl font-bold tracking-tight">Community Help</h1>
                <button
                  type="button"
                  onClick={() => setInfoOpen(true)}
                  className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-primary"
                  aria-label="How Community Help works"
                >
                  <Info className="size-4" />
                </button>
              </div>
              <p className="truncate text-sm text-muted-foreground">Ask anonymously · anyone can help</p>
            </div>
          </header>
        )}

        {/* Immersive smooth-scrolling feed with pull-to-refresh */}
        <div
          ref={scrollerRef}
          onScroll={onFeedScroll}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="relative flex-1 overflow-y-auto scroll-smooth overscroll-contain"
        >
          {/* Pull-to-refresh indicator tray — expanding its height gently pushes
              the feed down as you pull, so the list itself is never transformed
              (that keeps native scroll momentum perfectly smooth). */}
          <div
            className="flex items-end justify-center overflow-hidden"
            style={{
              height: refreshing ? 44 : pull,
              transition: touchStartY.current !== null ? "none" : "height 0.25s ease",
            }}
            aria-hidden={pull === 0 && !refreshing}
          >
            <Loader2
              className={cn("mb-2 size-5 text-muted-foreground", refreshing && "animate-spin")}
              style={{
                opacity: Math.min(1, pull / 44),
                transform: refreshing ? undefined : `rotate(${pull * 4}deg)`,
              }}
            />
          </div>

          {/* Keyed fade wrapper: cross-fades between the skeleton, empty state
              and loaded feed using the same `animate-in fade-in duration-500`
              transition as the Articles hub. */}
          <div
            key={isLoading && posts.length === 0 ? "loading" : posts.length === 0 ? "empty" : "list"}
            className="animate-in fade-in duration-500"
          >
          {isLoading && posts.length === 0 ? (
              <FeedSkeleton />
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
                <Avatar className="size-16 ring-2 ring-border/70">
                  <AvatarImage src={ANON_AVATAR || "/placeholder.svg"} alt="" />
                  <AvatarFallback className="bg-muted text-2xl font-bold text-muted-foreground">?</AvatarFallback>
                </Avatar>
                <p className="text-lg font-semibold">No questions yet</p>
                <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                  Be the first to ask the community something — totally anonymously.
                </p>
                <Button onClick={() => setComposerOpen(true)} className="mt-2 gap-2 rounded-full">
                  <Plus className="size-4" /> Ask anonymously
                </Button>
              </div>
            ) : (
              <div className="divide-y-4 divide-border pb-28">
                {posts.map((post) => (
                  <PostItem
                    key={post.id}
                    post={post}
                    onDeleted={handleDeleted}
                    onOpen={() => setActiveId(post.id)}
                    highlighted={highlightedQ === String(post.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Floating ask button — hides on scroll-down, returns on scroll-up. */}
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className={cn(
            "absolute bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-5 z-30 inline-flex w-fit items-center gap-2 rounded-full bg-primary px-4 py-2 text-base font-semibold text-primary-foreground shadow-lg transition-[transform,opacity] duration-300 ease-out hover:scale-105 active:scale-95 sm:right-8",
            chromeHidden ? "pointer-events-none translate-y-[200%] opacity-0" : "translate-y-0 opacity-100",
          )}
        >
          <Plus className="size-5" />
          Ask
        </button>

          <Composer
            open={composerOpen}
            onClose={() => setComposerOpen(false)}
            onCreated={handleCreated}
            homeId={homeId}
          />
        <CommunityHelpInfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />

        {activePost && (
          <CommunityConversation
            post={activePost}
            related={relatedPosts}
            onClose={closeConversation}
            onOpenRelated={(p) => setActiveId(p.id)}
            onCountChange={handleCountChange}
          />
        )}
      </div>
    </MiniChatProvider>
  )
}
