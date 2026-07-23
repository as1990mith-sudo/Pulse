"use client"

import { useRef, useState } from "react"
import useSWR from "swr"
import {
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  Radio,
  Send,
  Sparkles,
  StickyNote,
  BookMarked,
  X,
} from "lucide-react"
import { useLiveResources } from "@/components/live/resource/resource-context"
import { getPinnedResources, pinResource, unpinResource } from "@/app/actions/pinned-resources"
import { compressImage, uploadMedia } from "@/lib/upload-media"
import type { PinKind, PinnedResourceView } from "@/lib/pinned-resources"

const KIND_META: Record<PinKind, { icon: typeof FileText; tint: string }> = {
  verse: { icon: BookMarked, tint: "bg-amber-500/20 text-amber-300" },
  pdf: { icon: FileText, tint: "bg-primary/20 text-primary" },
  book: { icon: BookOpen, tint: "bg-emerald-500/20 text-emerald-300" },
  devotional: { icon: Sparkles, tint: "bg-fuchsia-500/20 text-fuchsia-300" },
  link: { icon: ExternalLink, tint: "bg-sky-500/20 text-sky-300" },
  session: { icon: Radio, tint: "bg-rose-500/20 text-rose-300" },
  image: { icon: ImageIcon, tint: "bg-blue-500/20 text-blue-300" },
  text: { icon: StickyNote, tint: "bg-teal-500/20 text-teal-300" },
}

/**
 * Pinned Resources panel. Shows everything the host pinned to the room, and
 * routes each pin to the right experience without leaving the live: verses open
 * the mini-Bible, PDFs/books open their inline readers, links open in a new tab,
 * and sessions/devotionals fall back to their URL.
 *
 * The host also gets an inline composer here with two clearly separated inputs:
 * a text note (posted read-only to everyone) and an image upload (shown to
 * everyone as an expandable, downloadable picture). Every participant sees new
 * pins instantly; hosts additionally get an unpin control per item.
 */
export function MiniPinnedPanel() {
  const { descriptor, openPanel } = useLiveResources()
  const roomName = descriptor?.roomName ?? null
  const isHost = descriptor?.isHost ?? false

  const { data, isLoading, mutate } = useSWR(
    roomName ? ["room-pins", roomName] : null,
    () => getPinnedResources(roomName as string),
    { revalidateOnFocus: false },
  )
  const pins = data ?? []

  const imageInputRef = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState("")
  const [posting, setPosting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The image currently opened in the full-screen lightbox (expanded view).
  const [lightbox, setLightbox] = useState<{ url: string; title: string } | null>(null)

  function open(pin: PinnedResourceView) {
    switch (pin.kind) {
      case "verse":
        openPanel("bible", { kind: "bible", verseId: pin.refId ?? undefined })
        break
      case "pdf":
        if (pin.url) openPanel("pdf", { kind: "pdf", url: pin.url, title: pin.title })
        break
      case "book":
        openPanel("books")
        break
      case "link":
      case "devotional":
      case "session":
        if (pin.url) window.open(pin.url, "_blank", "noopener,noreferrer")
        break
    }
  }

  async function postNote() {
    const body = note.trim()
    if (!body || !roomName || posting) return
    setError(null)
    setPosting(true)
    try {
      const res = await pinResource({ roomName, kind: "text", title: body })
      if (!res.ok) {
        setError("Could not post that note. Please try again.")
        return
      }
      setNote("")
      await mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post note")
    } finally {
      setPosting(false)
    }
  }

  async function uploadImage(file: File) {
    if (!roomName) return
    setError(null)
    if (file.type && !file.type.startsWith("image/")) {
      setError("Please choose an image file.")
      return
    }
    setUploading(true)
    try {
      const compressed = await compressImage(file)
      const media = await uploadMedia(compressed, "pinned", file.name)
      const title = file.name.replace(/\.[^.]+$/, "").slice(0, 300) || "Image"
      const res = await pinResource({ roomName, kind: "image", title, url: media.url })
      if (!res.ok) {
        setError("Could not share that image. Please try again.")
        return
      }
      await mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  async function remove(id: number) {
    if (!roomName) return
    await unpinResource(id, roomName)
    void mutate()
  }

  const busy = posting || uploading

  return (
    <div className="flex h-full flex-col">
      {/* Host-only composer: a note field and an image upload, kept visually
          distinct so it's obvious they're two separate ways to share. */}
      {isHost && (
        <div className="space-y-2 border-b border-white/10 px-3 py-2.5">
          <div className="flex items-end gap-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void postNote()
                }
              }}
              rows={1}
              placeholder="Share a note with everyone…"
              aria-label="Share a note"
              className="max-h-28 min-h-[38px] flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-primary/50"
            />
            <button
              type="button"
              onClick={() => void postNote()}
              disabled={!note.trim() || busy}
              aria-label="Post note"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform active:scale-90 disabled:opacity-50"
            >
              {posting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 bg-white/[0.03] py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
          >
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
            {uploading ? "Sharing image…" : "Add image"}
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void uploadImage(file)
              e.target.value = ""
            }}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-white/40" />
          </div>
        ) : pins.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <BookMarked className="size-7 text-white/25" />
            <p className="text-sm text-white/50">Nothing pinned yet.</p>
            <p className="max-w-[220px] text-pretty text-xs text-white/30">
              {isHost
                ? "Pin verses and documents, post a note, or share an image so everyone can follow along."
                : "The host hasn't pinned any resources for this session yet."}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {pins.map((pin) => {
              // Image pins render as an expandable, downloadable thumbnail.
              if (pin.kind === "image" && pin.url) {
                return (
                  <li key={pin.id} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                    <button
                      type="button"
                      onClick={() => setLightbox({ url: pin.url as string, title: pin.title })}
                      className="block w-full"
                      aria-label={`Expand image ${pin.title}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={pin.url || "/placeholder.svg"}
                        alt={pin.title}
                        className="max-h-52 w-full object-cover"
                      />
                    </button>
                    <div className="flex items-center gap-2 px-3 py-2">
                      <ImageIcon className="size-4 shrink-0 text-blue-300" />
                      <span className="min-w-0 flex-1 truncate text-xs text-white/70">{pin.title}</span>
                      <a
                        href={pin.url}
                        download={pin.title}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Download ${pin.title}`}
                        className="flex size-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <Download className="size-4" />
                      </a>
                      {isHost && (
                        <button
                          type="button"
                          onClick={() => remove(pin.id)}
                          aria-label="Unpin image"
                          className="flex size-8 items-center justify-center rounded-full text-white/30 transition-colors hover:bg-white/10 hover:text-red-400"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                  </li>
                )
              }

              // Text pins render as a read-only note card.
              if (pin.kind === "text") {
                return (
                  <li key={pin.id} className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-teal-500/20 text-teal-300">
                      <StickyNote className="size-4" />
                    </span>
                    <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/90">
                      {pin.title}
                    </p>
                    {isHost && (
                      <button
                        type="button"
                        onClick={() => remove(pin.id)}
                        aria-label="Unpin note"
                        className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-white/30 transition-colors hover:bg-white/10 hover:text-red-400"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </li>
                )
              }

              // Everything else keeps the original tap-to-open row.
              const meta = KIND_META[pin.kind] ?? KIND_META.link
              const Icon = meta.icon
              return (
                <li key={pin.id} className="group flex items-center gap-2">
                  <button
                    onClick={() => open(pin)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left transition-colors hover:bg-white/[0.08]"
                  >
                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${meta.tint}`}>
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white">{pin.title}</span>
                      <span className="block truncate text-xs capitalize text-white/40">
                        {pin.subtitle || pin.kind}
                      </span>
                    </span>
                  </button>
                  {isHost && (
                    <button
                      onClick={() => remove(pin.id)}
                      aria-label="Unpin"
                      className="rounded-full p-2 text-white/30 transition-colors hover:bg-white/10 hover:text-red-400"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Expanded image view — tap the backdrop to close, or download in full. */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.title}
        >
          <div className="flex items-center gap-2 px-4 py-3">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{lightbox.title}</span>
            <a
              href={lightbox.url}
              download={lightbox.title}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Download image"
              className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <Download className="size-4" />
            </a>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              aria-label="Close"
              className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <X className="size-5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="flex min-h-0 flex-1 items-center justify-center p-4"
            aria-label="Close expanded image"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.url || "/placeholder.svg"}
              alt={lightbox.title}
              className="max-h-full max-w-full object-contain"
            />
          </button>
        </div>
      )}
    </div>
  )
}
