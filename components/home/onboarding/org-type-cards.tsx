"use client"

import { Church, HeartHandshake, Sparkles, Users, Building2, CircleEllipsis } from "lucide-react"
import { HOME_ORG_TYPES, type HomeOrgTypeId } from "@/lib/home/org-types"

const ICONS: Record<HomeOrgTypeId, React.ReactNode> = {
  church: <Church className="size-5" />,
  ministry: <HeartHandshake className="size-5" />,
  youth_ministry: <Sparkles className="size-5" />,
  christian_organisation: <Building2 className="size-5" />,
  christian_community: <Users className="size-5" />,
  other: <CircleEllipsis className="size-5" />,
}

export function OrgTypeCards({
  value,
  onChange,
}: {
  value: HomeOrgTypeId
  onChange: (id: HomeOrgTypeId) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Organisation type">
      {HOME_ORG_TYPES.map((type) => {
        const active = value === type.id
        return (
          <button
            key={type.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(type.id)}
            className={[
              "flex flex-col items-start gap-2.5 rounded-2xl border p-4 text-left transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary bg-primary/5 shadow-soft"
                : "border-border/60 bg-card hover:border-border hover:bg-secondary/40",
            ].join(" ")}
          >
            <span
              className={[
                "flex size-10 items-center justify-center rounded-xl transition-colors",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
              ].join(" ")}
            >
              {ICONS[type.id]}
            </span>
            <span className="text-sm font-semibold leading-tight">{type.label}</span>
            <span className="text-xs leading-snug text-muted-foreground">{type.description}</span>
          </button>
        )
      })}
    </div>
  )
}
