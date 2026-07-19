"use client"

import { useState } from "react"
import useSWR from "swr"
import { BookOpen, Loader2, Download } from "lucide-react"
import { PdfViewer } from "@/components/library/pdf-viewer"
import { useLiveResources } from "@/components/live/resource/resource-context"
import { getPinnedResources } from "@/app/actions/pinned-resources"

/**
 * Mini Books panel. Shows the books the host pinned to this room. Books open in
 * the same inline reader as PDFs (book files are PDFs) so the live keeps
 * playing behind the floating panel — never a forced fullscreen navigation.
 */
export function MiniBooksPanel() {
  const { descriptor } = useLiveResources()
  const roomName = descriptor?.roomName ?? null

  const { data, isLoading } = useSWR(
    roomName ? ["room-pins-book", roomName] : null,
    () => getPinnedResources(roomName as string),
    { revalidateOnFocus: false },
  )
  const books = (data ?? []).filter((p) => p.kind === "book")

  const [active, setActive] = useState<{ url: string; title: string } | null>(null)

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
            aria-label="Download book"
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
      ) : books.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <BookOpen className="size-7 text-white/25" />
          <p className="text-sm text-white/50">No books shared yet.</p>
          <p className="max-w-[220px] text-pretty text-xs text-white/30">
            Books the host recommends for this session will appear here to read alongside the live.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {books.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => b.url && setActive({ url: b.url, title: b.title })}
                disabled={!b.url}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2.5 text-left transition-colors hover:bg-white/[0.08] disabled:opacity-50"
              >
                <span className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/15">
                  {b.meta && typeof (b.meta as Record<string, unknown>).cover === "string" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={((b.meta as Record<string, unknown>).cover as string) || "/placeholder.svg"}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <BookOpen className="size-5 text-primary" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">{b.title}</span>
                  {b.subtitle && <span className="block truncate text-xs text-white/40">{b.subtitle}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
