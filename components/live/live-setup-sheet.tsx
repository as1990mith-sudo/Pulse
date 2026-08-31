"use client"

import type { LucideIcon } from "lucide-react"
import { ArrowLeft, ChevronDown, Globe, LayoutGrid, Loader2, Lock, Pencil, Radio } from "lucide-react"
import { cn } from "@/lib/utils"
import { CoverUpload, SQUARE_RATIO } from "@/components/admin/cover-upload"

export interface LiveLayoutOption {
  value: string
  label: string
  icon: LucideIcon
}

export interface LiveSetupSheetProps {
  /** Stream / room title. */
  title: string
  onTitleChange: (value: string) => void
  titlePlaceholder?: string
  titleMaxLength?: number

  /** Two-option layout segmented control (Broadcast/Conversation, Podcast/Conversation). */
  layoutOptions: LiveLayoutOption[]
  layoutValue: string
  onLayoutSelect: (value: string) => void
  /** One-line contextual description shown beneath the layout control. */
  layoutHint: string
  /** Short label for this layout in the pre-live summary row (e.g. "Broadcast"). */
  summaryLayoutLabel: string

  /** Cover art (optional or required). */
  cover: string | null
  onCoverChange: (url: string | null) => void
  coverRequired?: boolean

  /** Optional free-text topic/discussion field. Omit to hide the section. */
  topic?: {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    label?: string
    maxLength?: number
  } | null

  /** Required category dropdown. */
  category: string
  onCategoryChange: (value: string) => void
  categoryOptions: readonly string[]

  /** Public / private visibility segmented control. */
  visibility: "public" | "private"
  onVisibilityChange: (value: "public" | "private") => void

  error?: string | null

  submitting?: boolean
  submittingLabel?: string
  onSubmit: () => void
  onCancel: () => void

  /** Full-viewport backdrop behind the centered card. Video overlays the camera
   *  (translucent + blur); audio has nothing behind it (opaque). */
  backdropClassName?: string
}

/**
 * The one shared "Go live" setup interface, used by all three live consoles —
 * Video (video-studio-console), Audio Podcast (studio-console) and Audio
 * Conversation (conversation-room). Keeping it in a single component guarantees
 * the audio and video setup screens are literally the same interface: a compact
 * centered card with a title input, a layout segmented control, an optional
 * cover-art row, an optional topic field, a required category, a privacy
 * segmented control, a pre-live summary line and a circular Go live button.
 */
export function LiveSetupSheet({
  title,
  onTitleChange,
  titlePlaceholder = "What's your live about?",
  titleMaxLength = 80,
  layoutOptions,
  layoutValue,
  onLayoutSelect,
  layoutHint,
  summaryLayoutLabel,
  cover,
  onCoverChange,
  coverRequired = false,
  topic,
  category,
  onCategoryChange,
  categoryOptions,
  visibility,
  onVisibilityChange,
  error,
  submitting = false,
  submittingLabel = "Starting…",
  onSubmit,
  onCancel,
  backdropClassName = "bg-black/50 backdrop-blur-sm",
}: LiveSetupSheetProps) {
  const disabled = submitting || !category || (coverRequired && !cover)

  return (
    <div className={cn("fixed inset-0 z-50 flex flex-col", backdropClassName)}>
      {/* Full-viewport scrim so the immersive page stays legible whether it sits
          over the live camera (video) or an opaque backdrop (audio). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-black/15 to-black/55"
      />

      {/* Immersive header: a back arrow returns to the Live tab where setup was
          opened (onCancel), replacing the old pop-up's dismiss X. */}
      <header
        className="relative z-10 flex items-center gap-3 px-4 pb-3"
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.75rem)" }}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/20 active:scale-90"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight tracking-tight text-white">Go live</h1>
          <p className="text-[12px] text-white/50">Set up your broadcast</p>
        </div>
      </header>

      {/* Scrollable body, held to a comfortable reading column on wide screens. */}
      <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        <div className="mx-auto w-full max-w-lg space-y-5">
          {/* Stream title */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="live-title" className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                Stream title
              </label>
              <span className="text-[11px] tabular-nums text-white/35">
                {title.length}/{titleMaxLength}
              </span>
            </div>
            <div className="relative">
              <Pencil className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/40" />
              <input
                id="live-title"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                maxLength={titleMaxLength}
                placeholder={titlePlaceholder}
                className="w-full rounded-2xl bg-white/[0.06] py-3.5 pl-10 pr-4 text-[15px] font-medium text-white ring-1 ring-inset ring-white/10 placeholder:text-white/35 focus:outline-none focus:ring-primary"
              />
            </div>
          </div>

          {/* Layout — a compact segmented control (roughly an input's height),
              with the contextual hint on one line beneath it. */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Layout</span>
            <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-white/[0.05] p-1 ring-1 ring-inset ring-white/10">
              {layoutOptions.map((opt) => {
                const active = layoutValue === opt.value
                const Icon = opt.icon
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onLayoutSelect(opt.value)}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
                      active
                        ? "bg-primary/15 text-white shadow-[0_0_20px_-8px] shadow-primary/60 ring-1 ring-inset ring-primary/70"
                        : "text-white/55 hover:text-white/80",
                    )}
                  >
                    <Icon className={cn("size-4", active ? "text-primary" : "text-white/45")} />
                    {opt.label}
                  </button>
                )
              })}
            </div>
            <p className="text-[11.5px] text-white/45">{layoutHint}</p>
          </div>

          {/* Cover art — a single compact row rather than a large upload box. */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Cover art</span>
            <CoverUpload
              value={cover}
              onChange={onCoverChange}
              ratios={SQUARE_RATIO}
              allowFit
              row
              hideLabel
              rowHint={coverRequired ? "Required · shown on the Live shelf" : "Optional · shown on the Live shelf"}
            />
          </div>

          {/* Topic / discussion — optional, only rendered when provided. */}
          {topic && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="live-topic" className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  {topic.label ?? "Discussion"}
                </label>
                <span className="text-[11px] text-white/35">Optional</span>
              </div>
              <input
                id="live-topic"
                value={topic.value}
                onChange={(e) => topic.onChange(e.target.value)}
                maxLength={topic.maxLength ?? 120}
                placeholder={topic.placeholder ?? "What are we gathering around?"}
                className="w-full rounded-2xl bg-white/[0.06] px-4 py-3.5 text-[15px] font-medium text-white ring-1 ring-inset ring-white/10 placeholder:text-white/35 focus:outline-none focus:ring-primary"
              />
            </div>
          )}

          {/* Category — required. */}
          <div className="space-y-2">
            <label htmlFor="live-category" className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
              Category <span className="text-primary">*</span>
            </label>
            <div className="relative">
              <LayoutGrid className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/40" />
              <select
                id="live-category"
                value={category}
                onChange={(e) => onCategoryChange(e.target.value)}
                className={cn(
                  "w-full appearance-none rounded-2xl bg-white/[0.06] py-3.5 pl-10 pr-10 text-[15px] font-medium ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-primary [&>option]:bg-neutral-900 [&>option]:text-white",
                  category ? "text-white" : "text-white/40",
                )}
              >
                <option value="" disabled>
                  Choose a category…
                </option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-white/50" />
            </div>
          </div>

          {/* Privacy — public (discoverable) vs private (link-only). */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Privacy</span>
            <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-white/[0.05] p-1 ring-1 ring-inset ring-white/10">
              {(
                [
                  { value: "public", label: "Public", icon: Globe },
                  { value: "private", label: "Private", icon: Lock },
                ] as const
              ).map((opt) => {
                const active = visibility === opt.value
                const Icon = opt.icon
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onVisibilityChange(opt.value)}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
                      active
                        ? "bg-primary text-primary-foreground shadow-[0_0_20px_-8px] shadow-primary/70"
                        : "text-white/55 hover:text-white/80",
                    )}
                  >
                    <Icon className="size-4" /> {opt.label}
                  </button>
                )
              })}
            </div>
            <p className="text-[11.5px] text-white/45">
              {visibility === "public" ? "Anyone can discover and join" : "Invite or link only"}
            </p>
          </div>

          {/* Pre-live summary — one quiet line confirming the setup at a glance. */}
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/[0.04] px-3 py-2.5 text-xs font-medium ring-1 ring-inset ring-white/10">
            <span className="text-white/80">{summaryLayoutLabel}</span>
            <span className="text-white/25">•</span>
            <span className="text-white/80">{visibility === "public" ? "Public" : "Private"}</span>
            <span className="text-white/25">•</span>
            <span className={cn("truncate", category ? "text-white/80" : "text-white/40")}>
              {category || "No category"}
            </span>
          </div>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}

          {/* Go live — an actual circular button, with its label + Cancel below. */}
          <div className="flex flex-col items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onSubmit}
              disabled={disabled}
              aria-label={submitting ? submittingLabel : "Go live"}
              className={cn(
                "flex size-[72px] items-center justify-center rounded-full text-live-foreground transition-all active:scale-95",
                disabled
                  ? "bg-live/40 text-live-foreground/70"
                  : "bg-live shadow-[0_0_40px_-6px] shadow-live/70 hover:opacity-95",
              )}
            >
              {submitting ? (
                <Loader2 className="size-7 animate-spin" />
              ) : (
                <Radio className="size-7" strokeWidth={2.5} />
              )}
            </button>
            <span className="text-sm font-semibold text-white/90">{submitting ? submittingLabel : "Go live"}</span>
            <button
              type="button"
              onClick={onCancel}
              className="text-sm font-medium text-white/50 transition-colors hover:text-white/80"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
