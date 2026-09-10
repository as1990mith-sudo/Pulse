"use client"

import { useState, useTransition } from "react"
import { Globe, Lock } from "lucide-react"
import { CoverUpload } from "@/components/admin/cover-upload"
import { AccentPicker } from "@/components/home/onboarding/accent-picker"
import { updateHomeBranding, setHomeVisibility } from "@/app/actions/home"
import type { HomeView } from "@/lib/home/types"

// Branding settings. CoverUpload uploads immediately (a session exists here),
// so we persist each field through updateHomeBranding as it changes.
export function SettingsManager({ home }: { home: HomeView }) {
  const [logo, setLogo] = useState<string | null>(home.orgLogo)
  const [cover, setCover] = useState<string | null>(home.orgCover)
  const [accent, setAccent] = useState(home.accentColor || home.orgColor)
  const [discoverable, setDiscoverable] = useState(home.discoverable)
  const [pending, startTransition] = useTransition()
  const [savedAt, setSavedAt] = useState<number | null>(null)

  function persist(patch: { logo?: string | null; cover?: string | null; accentColor?: string | null }) {
    startTransition(async () => {
      await updateHomeBranding(home.handle, patch)
      setSavedAt(Date.now())
    })
  }

  // Visibility is a separate action with its own permission gate; optimistic UI
  // with rollback if the server rejects.
  function changeVisibility(next: boolean) {
    if (next === discoverable) return
    const prev = discoverable
    setDiscoverable(next)
    startTransition(async () => {
      try {
        await setHomeVisibility(home.handle, next)
        setSavedAt(Date.now())
      } catch {
        setDiscoverable(prev)
      }
    })
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Visibility</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Controls whether people can find this Home.</p>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <VisibilityChoice
            active={discoverable}
            onClick={() => changeVisibility(true)}
            icon={<Globe className="size-4" />}
            title="Discoverable"
            description="Visible on Find a Home"
          />
          <VisibilityChoice
            active={!discoverable}
            onClick={() => changeVisibility(false)}
            icon={<Lock className="size-4" />}
            title="Private"
            description="Hidden — join by key or invite"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Visibility only controls discovery. Your join rules still decide who can become a member.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Organisation logo</h2>
        <CoverUpload
          value={logo}
          onChange={(url) => {
            setLogo(url)
            persist({ logo: url })
          }}
          label="Logo"
          compact
          hideLabel
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Cover image</h2>
        <CoverUpload
          value={cover}
          onChange={(url) => {
            setCover(url)
            persist({ cover: url })
          }}
          label="Cover"
          ratios={[{ label: "Wide", value: 16 / 9 }]}
          hideLabel
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Accent colour</h2>
        <AccentPicker
          value={accent}
          onChange={(c) => {
            setAccent(c)
            persist({ accentColor: c })
          }}
        />
      </section>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {pending ? "Saving…" : savedAt ? "All changes saved." : "Changes save automatically."}
      </p>
    </div>
  )
}

function VisibilityChoice({
  active,
  onClick,
  icon,
  title,
  description,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-all active:scale-[0.98] ${
        active
          ? "border-primary/60 bg-primary/5 ring-2 ring-primary/20"
          : "border-border/60 bg-card hover:border-border hover:bg-secondary/40"
      }`}
    >
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
          active ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  )
}
