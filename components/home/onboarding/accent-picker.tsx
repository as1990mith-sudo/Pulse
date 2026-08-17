"use client"

import { Check } from "lucide-react"

// A restrained, premium palette. Each becomes the Home's primary accent so the
// environment feels like the organisation's own.
export const ACCENT_OPTIONS: { name: string; value: string }[] = [
  { name: "Amber", value: "#E08A3C" },
  { name: "Ember", value: "#D9603B" },
  { name: "Rose", value: "#D6567A" },
  { name: "Violet", value: "#8B6DD6" },
  { name: "Indigo", value: "#5B6EE0" },
  { name: "Ocean", value: "#3B93C4" },
  { name: "Teal", value: "#2FA69A" },
  { name: "Forest", value: "#4E9E63" },
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
