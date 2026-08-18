"use client"

import { Check } from "lucide-react"

// A vivid, high-energy palette. Each becomes the Home's primary accent so the
// environment feels like the organisation's own — bright and saturated so it
// reads with punch against both light and dark surfaces.
export const ACCENT_OPTIONS: { name: string; value: string }[] = [
  { name: "Amber", value: "#FF9A1F" },
  { name: "Gold", value: "#FFC22E" },
  { name: "Ember", value: "#FF5A2C" },
  { name: "Coral", value: "#FF5470" },
  { name: "Rose", value: "#FF3D8B" },
  { name: "Fuchsia", value: "#E63CE6" },
  { name: "Violet", value: "#A05CFF" },
  { name: "Indigo", value: "#5568FF" },
  { name: "Ocean", value: "#1FA6FF" },
  { name: "Cyan", value: "#14CCE0" },
  { name: "Teal", value: "#10C9B4" },
  { name: "Emerald", value: "#22C55E" },
  { name: "Lime", value: "#84DB1B" },
]

export const DEFAULT_ACCENT = ACCENT_OPTIONS[0].value

export function AccentPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Accent colour">
      {ACCENT_OPTIONS.map((c) => {
        const active = value.toLowerCase() === c.value.toLowerCase()
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={c.name}
            title={c.name}
            onClick={() => onChange(c.value)}
            className={[
              "flex size-10 items-center justify-center rounded-full transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active ? "ring-2 ring-offset-2 ring-offset-background scale-105" : "hover:scale-105",
            ].join(" ")}
            style={{ backgroundColor: c.value, ...(active ? { ["--tw-ring-color" as string]: c.value } : {}) }}
          >
            {active && <Check className="size-4 text-white drop-shadow" />}
          </button>
        )
      })}
    </div>
  )
}
