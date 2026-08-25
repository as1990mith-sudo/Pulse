"use client"

import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { BackButton } from "@/components/back-button"
import { useUrlState } from "@/lib/navigation/use-url-state"
import { LiveNotesBrowser } from "@/components/live-notes-browser"
import { PersonalNotesBrowser } from "@/components/personal-notes-browser"
import type { LiveNoteHostGroup } from "@/app/actions/live-notes"
import type { PersonalNoteView } from "@/app/actions/personal-notes"

const TAB_KEYS = ["personal", "live"] as const
type Tab = (typeof TAB_KEYS)[number]

/**
 * Notes hub. A single destination with two lanes:
 *  - Personal Notes — a plain, always-available notes app.
 *  - Live Notes — the notes auto-captured inside live sessions (unchanged
 *    functionality, restyled for a compact premium look).
 * The segmented control switches between them; each lane keeps its own state.
 */
export function NotesHub({
  initialLiveGroups,
  initialPersonalNotes,
  signedIn,
}: {
  initialLiveGroups: LiveNoteHostGroup[]
  initialPersonalNotes: PersonalNoteView[]
  signedIn: boolean
}) {
  // In the URL so a reload keeps the lane the user was in.
  const [tab, setTab] = useUrlState<Tab>("lane", "personal", { valid: TAB_KEYS })

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-4 sm:px-6">
      {/* Compact top bar: back + title inline, no descriptions. */}
      <div className="mb-4 flex items-center gap-3">
        {/* Unwinds real history — whatever screen the user came from — and only
            falls back to home when Notes was the entry point (deep link). */}
        <BackButton
          fallbackHref="/"
          aria-label="Back"
          className="tap-scale flex size-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-secondary/40 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-5" />
        </BackButton>
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Notes</h1>
      </div>

      {/* Segmented control — a single sliding pill for a premium, futuristic feel. */}
      <div
        role="tablist"
        aria-label="Notes sections"
        className="relative mb-5 grid grid-cols-2 gap-1 rounded-full border border-border/60 bg-secondary/40 p-1 backdrop-blur"
      >
        {/* Sliding highlight */}
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-primary shadow-soft transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: tab === "live" ? "translateX(calc(100% + 0.25rem))" : "translateX(0)" }}
        />
        <TabButton active={tab === "personal"} onClick={() => setTab("personal")} label="Personal Notes" />
        <TabButton active={tab === "live"} onClick={() => setTab("live")} label="Live Notes" />
      </div>

      {tab === "personal" ? (
        <PersonalNotesBrowser initialNotes={initialPersonalNotes} signedIn={signedIn} />
      ) : (
        <LiveNotesBrowser initialGroups={initialLiveGroups} signedIn={signedIn} />
      )}
    </div>
  )
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative z-10 rounded-full py-2 text-center text-sm font-semibold transition-colors duration-200",
        active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  )
}
