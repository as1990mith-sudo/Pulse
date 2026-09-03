"use client"

// The single overlay layer for the Live Resource system. Mounted once per live
// (inside LiveSessionProvider) above the live UI. It renders the floating
// resource button, the resource drawer, and whichever mini-panel is active —
// exactly one at a time. Everything here is an overlay: the live keeps playing
// underneath and the user is never navigated away.

import { useRef } from "react"
import dynamic from "next/dynamic"
import { AnimatePresence } from "motion/react"
import { BookOpen, BookMarked, FileText, Loader2, NotebookPen, Pin, Video, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLiveResources, type ResourcePanelId } from "./resource-context"
import { LiveResourceDrawer } from "./live-resource-drawer"
import { MiniPanelShell } from "./mini-panel-shell"
import { MiniBiblePanel } from "./panels/mini-bible-panel"
import { MiniNotesPanel } from "./panels/mini-notes-panel"
import { MiniPinnedPanel } from "./panels/mini-pinned-panel"
import { VideoAutoShow } from "./video-autoshow"

// The PDF and Books panels pull in pdf.js, which touches browser-only globals
// (DOMMatrix) at module load. Import them client-side only so they never enter
// the server bundle of the app-wide LiveSessionProvider.
const PanelLoader = () => (
  <div className="flex h-40 items-center justify-center">
    <Loader2 className="size-5 animate-spin text-white/40" />
  </div>
)
const MiniPdfPanel = dynamic(() => import("./panels/mini-pdf-panel").then((m) => m.MiniPdfPanel), {
  ssr: false,
  loading: PanelLoader,
})
const MiniBooksPanel = dynamic(() => import("./panels/mini-books-panel").then((m) => m.MiniBooksPanel), {
  ssr: false,
  loading: PanelLoader,
})
// The video panel loads the YouTube IFrame API and drives an HTML5/YouTube
// player — all browser-only. Keep it client-side so it never enters the
// app-wide LiveSessionProvider's server bundle.
const MiniVideoPanel = dynamic(() => import("./panels/mini-video-panel").then((m) => m.MiniVideoPanel), {
  ssr: false,
  loading: PanelLoader,
})

const PANEL_META: Record<ResourcePanelId, { title: string; icon: LucideIcon }> = {
  bible: { title: "Bible", icon: BookOpen },
  notes: { title: "Live Notes", icon: NotebookPen },
  pdf: { title: "Documents", icon: FileText },
  books: { title: "Books", icon: BookMarked },
  video: { title: "Video", icon: Video },
  pinned: { title: "Pinned", icon: Pin },
}

function PanelBody({ id }: { id: ResourcePanelId }) {
  switch (id) {
    case "bible":
      return <MiniBiblePanel />
    case "notes":
      return <MiniNotesPanel />
    case "pdf":
      return <MiniPdfPanel />
    case "books":
      return <MiniBooksPanel />
    case "video":
      return <MiniVideoPanel />
    case "pinned":
      return <MiniPinnedPanel />
  }
}

export function LiveResourceLayer() {
  const { descriptor, activePanel } = useLiveResources()
  const constraintsRef = useRef<HTMLDivElement>(null)

  // Only meaningful inside a real live session (needs a room to scope data to).
  if (!descriptor?.roomName) return null

  const meta = activePanel ? PANEL_META[activePanel] : null
  const subtitle = descriptor.sessionTitle || descriptor.topic || descriptor.hostName || undefined

  return (
    <div ref={constraintsRef} className="pointer-events-none fixed inset-0 z-[60]">
      {/* Invisible watcher: auto-opens the Video panel for every participant the
          moment the host starts a shared video ("let's watch this together"). */}
      <VideoAutoShow />

      {/* The resource trigger now lives inline in each live interface (in the
          control dock, just before the chat button — or, on the audio podcast,
          in the chat composer beside Send). This layer only hosts the drawer
          and the active mini-panel. */}

      {/* Resource drawer */}
      <LiveResourceDrawer />

      {/* Active mini-panel — a floating, draggable card on mobile only. On
          desktop the same panel is shown docked to the right of the centred
          room instead (see DesktopResourceDock). */}
      <div className="lg:hidden">
        {/* One card, stable key. Switching resources swaps only the BODY inside
            the card — it does not unmount and remount the card itself.
            Previously this was keyed by activePanel with mode="wait", so every
            switch tore the card down and rebuilt it from initial={{opacity:0}},
            and the incoming card could only mount once the outgoing one had
            finished exiting. Any stall in that handoff left activePanel set with
            nothing on screen — the panel "vanishing" while still active. The
            desktop dock below never had the bug because it swaps the body the
            same way. Keeping the card mounted also makes switching instant and
            removes a distracting out/in flash. */}
        <AnimatePresence>
          {activePanel && meta && (
            <MiniPanelShell
              key="live-resource-panel"
              panelId={activePanel}
              title={meta.title}
              subtitle={subtitle}
              icon={meta.icon}
              constraintsRef={constraintsRef}
            >
              <PanelBody id={activePanel} />
            </MiniPanelShell>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

const DOCK_SWITCHER: { id: ResourcePanelId; icon: LucideIcon; label: string }[] = [
  { id: "bible", icon: BookOpen, label: "Bible" },
  { id: "notes", icon: NotebookPen, label: "Notes" },
  { id: "pdf", icon: FileText, label: "PDFs" },
  { id: "video", icon: Video, label: "Video" },
  { id: "pinned", icon: Pin, label: "Pinned" },
]

/**
 * Desktop-only resource dock. Rendered as a fixed-width column beside the centred
 * live room (see LiveRoomStage) — the desktop counterpart to the floating mobile
 * mini-panel. Shows the active panel with a header, quick switcher, and close.
 * Returns nothing until a panel is open, so it takes no space when idle.
 */
export function DesktopResourceDock() {
  const { activePanel, openPanel, closePanel, videoLocked } = useLiveResources()
  if (!activePanel) return null
  const meta = PANEL_META[activePanel]
  const Icon = meta.icon

  return (
    <aside
      aria-label={`${meta.title} panel`}
      className="hidden h-dvh w-[380px] shrink-0 flex-col border-l border-white/10 bg-zinc-950 lg:flex"
    >
      <div className="flex flex-col gap-2 border-b border-white/8 bg-white/[0.03] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Icon className="size-[18px]" strokeWidth={2.1} />
          </span>
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-bold leading-tight text-white">{meta.title}</h2>
          {/* Close is hidden while a host-driven video is playing — participants
              stay on the shared video. */}
          {!videoLocked && (
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close panel"
              className="flex size-8 items-center justify-center rounded-full bg-white/8 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        {/* Switcher hidden while locked: no switching tabs during a shared video. */}
        {!videoLocked && (
        <div className="flex items-center gap-1">
          {DOCK_SWITCHER.map((s) => {
            const SwIcon = s.icon
            const active = activePanel === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => openPanel(s.id)}
                aria-pressed={active}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/6 text-white/55 hover:bg-white/12 hover:text-white",
                )}
              >
                <SwIcon className="size-3.5" strokeWidth={2.3} />
                <span>{s.label}</span>
              </button>
            )
          })}
        </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <PanelBody id={activePanel} />
      </div>
    </aside>
  )
}
