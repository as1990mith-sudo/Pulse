"use client"

import { useRef, useState } from "react"
import useSWR from "swr"
import { Download, FileText, Loader2, Bookmark, Upload, Trash2 } from "lucide-react"
import { PdfViewer } from "@/components/library/pdf-viewer"
import { useLiveResources } from "@/components/live/resource/resource-context"
import { getPinnedResources, pinResource, unpinResource } from "@/app/actions/pinned-resources"
import { uploadMedia } from "@/lib/upload-media"

/**
 * Mini PDF panel. Documents behave like the Bible panel: they open inside the
 * floating mini-panel and the live keeps running behind. Everyone reads the PDFs
 * the host has shared; the host additionally gets an "Upload PDF" control here
 * that stores the file to Blob and pins it to the room so every participant sees
 * it instantly. Users read/scroll/zoom inline via the reusable PdfViewer.
 *
 * If the panel was opened with a target doc (e.g. from the Pinned panel) it
 * jumps straight into the reader.
 */
export function MiniPdfPanel() {
  const { descriptor, payload } = useLiveResources()
  const roomName = descriptor?.roomName ?? null
  const isHost = Boolean(descriptor?.isHost)

  const { data, isLoading, mutate } = useSWR(
    roomName ? ["room-pins-pdf", roomName] : null,
    () => getPinnedResources(roomName as string),
    { revalidateOnFocus: false },
  )
  const pdfs = (data ?? []).filter((p) => p.kind === "pdf" && p.url)

  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A doc can be passed in via payload when switching from another panel.
  const initial =
    payload && payload.kind === "pdf" && typeof payload.url === "string"
      ? { url: payload.url, title: payload.title ?? "Document" }
      : null

  const [active, setActive] = useState<{ url: string; title: string } | null>(initial)

  async function handleUpload(file: File) {
    if (!roomName) return
    setError(null)
    // Guard against non-PDFs — the pinned reader only renders PDFs.
    if (file.type && file.type !== "application/pdf") {
      setError("Please choose a PDF file.")
      return
    }
    setUploading(true)
    try {
      const media = await uploadMedia(file, "pinned")
      const title = file.name.replace(/\.pdf$/i, "").slice(0, 300) || "Document"
      const res = await pinResource({ roomName, kind: "pdf", title, url: media.url })
      if (!res.ok) {
        setError("Could not share that document. Please try again.")
        return
      }
      await mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove(id: number) {
    if (!roomName) return
    await unpinResource(id, roomName)
    await mutate()
  }

  if (active) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
          <button
            onClick={() => setActive(null)}
            className="text-sm font-medium text-white/60 transition-colors hover:text-white"
          >
            Back
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-sm font-medium text-white">{active.title}</p>
          <a
            href={active.url}
            download
            aria-label="Download PDF"
            className="rounded-full p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Download className="size-4" />
          </a>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden bg-black/40">
          <PdfViewer fileUrl={active.url} onError={() => {}} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Host-only: a compact "Add PDF" control. Uploaded PDFs become visible to
          every participant instantly. */}
      {isHost && (
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <span className="text-xs font-medium text-white/50">Documents</span>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {uploading ? "Sharing…" : "Add PDF"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleUpload(file)
              e.target.value = ""
            }}
          />
        </div>
      )}
      {isHost && error && <p className="px-3 pt-2 text-xs text-destructive">{error}</p>}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-white/40" />
          </div>
        ) : pdfs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <FileText className="size-7 text-white/25" />
            <p className="text-sm text-white/50">No documents shared yet.</p>
            <p className="max-w-[220px] text-pretty text-xs text-white/30">
              {isHost
                ? "Upload a PDF above to share it with everyone in the room."
                : "When the host shares a PDF or document it will appear here to read without leaving the live."}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {pdfs.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <button
                  onClick={() => setActive({ url: p.url as string, title: p.title })}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left transition-colors hover:bg-white/[0.08]"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
                    <FileText className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">{p.title}</span>
                    {p.subtitle && <span className="block truncate text-xs text-white/40">{p.subtitle}</span>}
                  </span>
                  <Bookmark className="size-4 shrink-0 text-white/25" />
                </button>
                {isHost && (
                  <button
                    type="button"
                    onClick={() => void handleRemove(p.id)}
                    aria-label={`Remove ${p.title}`}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
