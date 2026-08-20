"use client"

import { useEffect, useRef, useState } from "react"
import {
  Church,
  HeartHandshake,
  Sparkles,
  Users,
  Building2,
  CircleEllipsis,
  HandHeart,
  Leaf,
  GraduationCap,
  Briefcase,
  Compass,
  Check,
  ChevronDown,
} from "lucide-react"
import { HOME_ORG_TYPES, type HomeOrgTypeId } from "@/lib/home/org-types"
import { cn } from "@/lib/utils"

const ICONS: Record<HomeOrgTypeId, React.ReactNode> = {
  church: <Church className="size-4" />,
  ministry: <HeartHandshake className="size-4" />,
  christian_organisation: <Building2 className="size-4" />,
  charity: <HandHeart className="size-4" />,
  nonprofit: <Leaf className="size-4" />,
  community: <Users className="size-4" />,
  coaching: <Compass className="size-4" />,
  education: <GraduationCap className="size-4" />,
  youth: <Sparkles className="size-4" />,
  professional: <Briefcase className="size-4" />,
  other: <CircleEllipsis className="size-4" />,
}

/**
 * Futuristic single-select dropdown for the organisation type. Replaces the old
 * two-column tile grid: a compact glassy trigger showing the active type's icon
 * + label, and a click-away panel listing every type with icon, label and a
 * short description. Keeps the same value/onChange contract as before.
 */
export function OrgTypeCards({
  value,
  onChange,
}: {
  value: HomeOrgTypeId
  onChange: (id: HomeOrgTypeId) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = HOME_ORG_TYPES.find((t) => t.id === value) ?? HOME_ORG_TYPES[0]

  // Click-away + Escape close the panel.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border bg-card/80 px-3.5 py-3 text-left backdrop-blur transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open ? "border-primary/60 shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]" : "border-border/60 hover:border-border",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {ICONS[selected.id]}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{selected.label}</span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[52vh] overflow-y-auto rounded-2xl border border-border/70 bg-popover-solid p-1.5 shadow-2xl ring-1 ring-black/5 duration-150 animate-in fade-in-0 zoom-in-95"
        >
          {HOME_ORG_TYPES.map((type) => {
            const active = value === type.id
            return (
              <button
                key={type.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(type.id)
                  setOpen(false)
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                  active ? "bg-primary/10" : "hover:bg-secondary/50",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}
                >
                  {ICONS[type.id]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{type.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{type.description}</span>
                </span>
                {active && <Check className="size-4 shrink-0 text-primary" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
