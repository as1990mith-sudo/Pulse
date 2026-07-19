"use client"

import useSWR from "swr"
import {
  BookOpen,
  ExternalLink,
  FileText,
  Loader2,
  Radio,
  Sparkles,
  BookMarked,
  X,
} from "lucide-react"
import { useLiveResources } from "@/components/live/resource/resource-context"
import { getPinnedResources, unpinResource, type PinKind, type PinnedResourceView } from "@/app/actions/pinned-resources"

const KIND_META: Record<PinKind, { icon: typeof FileText; tint: string }> = {
  verse: { icon: BookMarked, tint: "bg-amber-500/20 text-amber-300" },
  pdf: { icon: FileText, tint: "bg-primary/20 text-primary" },
  book: { icon: BookOpen, tint: "bg-emerald-500/20 text-emerald-300" },
  devotional: { icon: Sparkles, tint: "bg-fuchsia-500/20 text-fuchsia-300" },
  link: { icon: ExternalLink, tint: "bg-sky-500/20 text-sky-300" },
  session: { icon: Radio, tint: "bg-rose-500/20 text-rose-300" },
}

/**
 * Pinned Resources panel. Shows everything the host pinned to the room, and
 * routes each pin to the right experience without leaving the live: verses open
 * the mini-Bible, PDFs/books open their inline readers, links open in a new tab,
 * and sessions/devotionals fall back to their URL. Hosts also get an unpin
 * control inline.
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

  async function remove(id: number) {
    if (!roomName) return
    await unpinResource(id, roomName)
    void mutate()
  }

  return (
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
              ? "Pin verses, documents, books, or links so everyone can follow along."
              : "The host hasn't pinned any resources for this session yet."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {pins.map((pin) => {
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
  )
}
