"use client"

import { useState, useTransition } from "react"
import { CoverUpload } from "@/components/admin/cover-upload"
import { AccentPicker } from "@/components/home/onboarding/accent-picker"
import { updateHomeBranding } from "@/app/actions/home"
import type { HomeView } from "@/lib/home/types"

// Branding settings. CoverUpload uploads immediately (a session exists here),
// so we persist each field through updateHomeBranding as it changes.
export function SettingsManager({ home }: { home: HomeView }) {
  const [logo, setLogo] = useState<string | null>(home.orgLogo)
  const [cover, setCover] = useState<string | null>(home.orgCover)
  const [accent, setAccent] = useState(home.accentColor || home.orgColor)
  const [pending, startTransition] = useTransition()
  const [savedAt, setSavedAt] = useState<number | null>(null)

  function persist(patch: { logo?: string | null; cover?: string | null; accentColor?: string | null }) {
    startTransition(async () => {
      await updateHomeBranding(home.handle, patch)
      setSavedAt(Date.now())
    })
  }

  return (
    <div className="space-y-8">
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
