"use client"

import { useState } from "react"
import useSWR from "swr"
import { Download, FileText, Loader2, Bookmark } from "lucide-react"
import { PdfViewer } from "@/components/library/pdf-viewer"
import { useLiveResources } from "@/components/live/resource/resource-context"
import { getPinnedResources } from "@/app/actions/pinned-resources"

/**
 * Mini PDF panel. Documents behave like the Bible panel: they open inside the
 * floating mini-panel and the live keeps running behind. Users pick from the
 * documents the host pinned to this room, then read/scroll/zoom inline. The
 * reusable PdfViewer handles rendering, scroll and zoom; we add download + a
 * lightweight local bookmark of the current doc.
 *
 * If the panel was opened with a target doc (e.g. from the Pinned panel) it
 * jumps straight into the reader.
 */
export function MiniPdfPanel() {
  const { descriptor, payload } = useLiveResources()
  const roomName = descriptor?.roomName ?? null

  const { data, isLoading } = useSWR(
    roomName ? ["room-pins-pdf", roomName] : null,
    () => getPinnedResources(roomName as string),
    { revalidateOnFocus: false },
  )
  const pdfs = (data ?? []).filter((p) => p.kind === "pdf" && p.url)

  // A doc can be passed in via payload when switching from another panel.
  const initial =
    payload && payload.kind === "pdf" && typeof payload.url === "string"
      ? { url: payload.url, title: payload.title ?? "Document" }
      : null

  const [active, setActive] = useState<{ url: string; title: string } | null>(initial)

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
            When the host pins a PDF or document it will appear here to read without leaving the live.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {pdfs.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setActive({ url: p.url as string, title: p.title })}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left transition-colors hover:bg-white/[0.08]"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
                  <FileText className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">{p.title}</span>
                  {p.subtitle && <span className="block truncate text-xs text-white/40">{p.subtitle}</span>}
                </span>
                <Bookmark className="size-4 text-white/25" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
