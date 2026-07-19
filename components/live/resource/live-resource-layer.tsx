"use client"

// The single overlay layer for the Live Resource system. Mounted once per live
// (inside LiveSessionProvider) above the live UI. It renders the floating
// resource button, the resource drawer, and whichever mini-panel is active —
// exactly one at a time. Everything here is an overlay: the live keeps playing
// underneath and the user is never navigated away.

import { useRef } from "react"
import dynamic from "next/dynamic"
import { AnimatePresence } from "motion/react"
import { BookOpen, BookMarked, FileText, Loader2, NotebookPen, Pin } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useLiveResources, type ResourcePanelId } from "./resource-context"
import { LiveResourceButton } from "./live-resource-button"
import { LiveResourceDrawer } from "./live-resource-drawer"
import { MiniPanelShell } from "./mini-panel-shell"
import { MiniBiblePanel } from "./panels/mini-bible-panel"
import { MiniNotesPanel } from "./panels/mini-notes-panel"
import { MiniPinnedPanel } from "./panels/mini-pinned-panel"

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

const PANEL_META: Record<ResourcePanelId, { title: string; icon: LucideIcon }> = {
  bible: { title: "Bible", icon: BookOpen },
  notes: { title: "Live Notes", icon: NotebookPen },
  pdf: { title: "Documents", icon: FileText },
  books: { title: "Books", icon: BookMarked },
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
      {/* Floating button (hidden while a panel is open) */}
      <LiveResourceButton />

      {/* Resource drawer */}
      <LiveResourceDrawer />

      {/* Active mini-panel */}
      <AnimatePresence mode="wait">
        {activePanel && meta && (
          <MiniPanelShell
            key={activePanel}
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
  )
}
