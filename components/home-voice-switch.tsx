"use client"

import { Building2, User } from "lucide-react"
import { cn } from "@/lib/utils"

export type HomeVoice = {
  name: string
  /** The organisation's handle, for linking to its profile at /org/<handle>. */
  handle: string
  image: string | null
  initials: string
}

/**
 * Lets an admin of the active Home choose whether a post or comment speaks for
 * the organisation or for themselves.
 *
 * Deliberately label-only — no helper copy. The two options name the two
 * identities, which is the whole of what the user needs to know; a description
 * underneath would just restate the label. Renders nothing when `voice` is null,
 * so ordinary members never see an inert control.
 */
export function HomeVoiceSwitch({
  voice,
  asHome,
  onChange,
  personalName,
  personalImage = null,
  personalInitials = "",
  size = "default",
  className,
}: {
  voice: HomeVoice | null
  asHome: boolean
  onChange: (asHome: boolean) => void
  /** The viewer's own name, shown as the personal option. */
  personalName: string
  /** The viewer's profile photo, so "post as me" shows the real face. */
  personalImage?: string | null
  /** Initials fallback for the personal option when there is no photo. */
  personalInitials?: string
  /** `sm` fits inline comment boxes; `default` suits the main composer. */
  size?: "sm" | "default"
  className?: string
}) {
  if (!voice) return null

  // Each option carries its real identity image. Choosing between the two is a
  // choice between two *identities*, so both sides show the face/logo the post
  // will actually carry — a generic person glyph for the personal option made it
  // read as an abstract setting rather than "this is me".
  const options = [
    {
      key: "home" as const,
      icon: Building2,
      label: voice.name,
      image: voice.image,
      initials: voice.initials,
      active: asHome,
    },
    {
      key: "self" as const,
      icon: User,
      label: personalName,
      image: personalImage,
      initials: personalInitials,
      active: !asHome,
    },
  ]

  return (
    <div
      role="radiogroup"
      aria-label="Post as"
      className={cn(
        "grid grid-cols-2 gap-1 rounded-full bg-secondary/60 p-1",
        size === "sm" ? "text-[11.5px]" : "text-[13px]",
        className,
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          role="radio"
          aria-checked={opt.active}
          title={opt.label}
          onClick={() => onChange(opt.key === "home")}
          className={cn(
            "flex min-w-0 items-center justify-center gap-1.5 rounded-full font-semibold transition-colors",
            size === "sm" ? "px-2 py-1" : "px-3 py-1.5",
            opt.active
              ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {/* Real avatar first, initials next, and only then the generic glyph —
              so an identity always looks like itself wherever an image exists. */}
          <span
            className={cn(
              "grid shrink-0 place-items-center overflow-hidden rounded-full",
              opt.active ? "ring-1 ring-border/70" : "opacity-80",
              size === "sm" ? "size-4" : "size-5",
            )}
          >
            {opt.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={opt.image || "/placeholder.svg"} alt="" className="size-full object-cover" />
            ) : opt.initials ? (
              <span
                className={cn(
                  "grid size-full place-items-center bg-primary/15 font-bold leading-none text-primary",
                  size === "sm" ? "text-[7px]" : "text-[8px]",
                )}
              >
                {opt.initials}
              </span>
            ) : (
              <opt.icon className={size === "sm" ? "size-3" : "size-3.5"} />
            )}
          </span>
          <span className="truncate">{opt.label}</span>
        </button>
      ))}
    </div>
  )
}
