"use client"

// TEMPORARY debug harness for the live resource panel. Delete after verifying.

import { ResourceProvider } from "@/components/live/resource/resource-context"
import { LiveResourceLayer, DesktopResourceDock } from "@/components/live/resource/live-resource-layer"
import { useLiveResources } from "@/components/live/resource/resource-context"

function Controls() {
  const { openPanel, activePanel } = useLiveResources()
  return (
    <div className="pointer-events-auto fixed left-3 top-3 z-[200] flex flex-col gap-2 rounded-xl bg-black/80 p-3 text-xs text-white">
      <span data-testid="active">active: {String(activePanel)}</span>
      <button data-testid="open-notes" onClick={() => openPanel("notes")} className="rounded bg-white/20 px-2 py-1">
        open notes
      </button>
      <button data-testid="open-pdf" onClick={() => openPanel("pdf")} className="rounded bg-white/20 px-2 py-1">
        open pdf
      </button>
    </div>
  )
}

export default function Page() {
  return (
    <ResourceProvider
      descriptor={{
        roomName: "debug-room",
        streamId: null,
        hostId: null,
        hostName: "Debug Host",
        topic: "Debug topic",
        sessionTitle: "Debug session",
        mode: "video",
        isHost: true,
        currentUser: null,
      }}
    >
      <div className="min-h-dvh bg-zinc-900" />
      <Controls />
      <LiveResourceLayer />
    </ResourceProvider>
  )
}
