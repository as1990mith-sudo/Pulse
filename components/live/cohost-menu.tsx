"use client"

import { Crown, Music, PhoneIncoming, PowerOff, UserMinus, X } from "lucide-react"
import type { CallRequestView, CoHostPermissions } from "@/app/actions/live"
import { cn } from "@/lib/utils"

/** Lightweight bottom-sheet shell (kept local to avoid a circular import with
 *  studio-console, which itself imports this menu). */
function MenuSheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 max-h-[80dvh] w-full overflow-y-auto rounded-t-2xl border border-border/60 bg-card p-4 text-foreground sm:max-w-sm sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** A single tickable permission row used in the Manage Co-Host menu. */
function PermissionToggle({
  icon,
  label,
  description,
  enabled,
  disabled,
  onToggle,
}: {
  icon: React.ReactNode
  label: string
  description: string
  enabled: boolean
  disabled?: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled}
      onClick={() => onToggle(!enabled)}
      className="flex w-full items-center gap-3 rounded-xl border border-border/60 p-3 text-left transition-colors hover:bg-secondary/60 disabled:opacity-60"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground [&>svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs leading-snug text-muted-foreground">{description}</span>
      </span>
      <span
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors",
          enabled ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-background shadow transition-transform",
            enabled ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  )
}

/**
 * Context menu the MAIN HOST opens by tapping a speaker on stage.
 * - For an ordinary speaker (guest): offers "Make Co-Host".
 * - For a co-host: shows the three tickable permissions + "Remove Co-Host".
 * Only the main host ever sees this (co-hosts can't manage co-hosts).
 */
export function ManageCoHostMenu({
  speaker,
  onMakeCoHost,
  onTogglePermission,
  onRemoveCoHost,
  onClose,
}: {
  speaker: CallRequestView
  onMakeCoHost: () => void
  onTogglePermission: (permission: keyof CoHostPermissions, enabled: boolean) => void
  onRemoveCoHost: () => void
  onClose: () => void
}) {
  const isCoHost = speaker.role === "cohost"

  return (
    <MenuSheet
      title={speaker.userName}
      subtitle={isCoHost ? "Co-host" : "Speaker"}
      onClose={onClose}
    >
      {isCoHost ? (
        <div className="space-y-2">
          <p className="px-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Permissions
          </p>
          <PermissionToggle
            icon={<PhoneIncoming />}
            label="Accept Call Requests"
            description="Let this co-host approve listeners who ask to speak."
            enabled={speaker.permissions.acceptRequests}
            onToggle={(next) => onTogglePermission("acceptRequests", next)}
          />
          <PermissionToggle
            icon={<Music />}
            label="Control Tracks"
            description="Upload, play, pause and stop the background music. Your music controls pause while they do."
            enabled={speaker.permissions.controlTracks}
            onToggle={(next) => onTogglePermission("controlTracks", next)}
          />
          <PermissionToggle
            icon={<PowerOff />}
            label="End Session"
            description="Allow this co-host to end the whole live session."
            enabled={speaker.permissions.endSession}
            onToggle={(next) => onTogglePermission("endSession", next)}
          />
          <button
            type="button"
            onClick={onRemoveCoHost}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/15"
          >
            <UserMinus className="size-4" /> Remove Co-Host
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onMakeCoHost}
          className="flex w-full items-center gap-3 rounded-xl border border-border/60 p-3 text-left transition-colors hover:bg-secondary/60"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-amber-500 [&>svg]:size-4">
            <Crown />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Make Co-Host</span>
            <span className="block text-xs leading-snug text-muted-foreground">
              Give this speaker a host-like console. They can accept call requests by default.
            </span>
          </span>
        </button>
      )}
    </MenuSheet>
  )
}

/**
 * Prompt shown to the MAIN HOST when a track-controlling co-host asks to take
 * over the music for the first time. Approve grants control until Control
 * Tracks is revoked; Decline leaves music with the host.
 */
export function MusicApprovalPrompt({
  request,
  onApprove,
  onDecline,
}: {
  request: CallRequestView
  onApprove: () => void
  onDecline: () => void
}) {
  return (
    <MenuSheet title="Music control request" onClose={onDecline}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className={cn("flex size-10 items-center justify-center rounded-full text-sm font-semibold", request.color)}>
            {request.initials}
          </span>
          <p className="text-sm text-pretty">
            <span className="font-semibold">{request.userName}</span> wants to control the background music for this
            session.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onApprove}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Music className="size-4" /> Approve
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="flex flex-1 items-center justify-center rounded-xl bg-secondary px-3 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/70"
          >
            Decline
          </button>
        </div>
      </div>
    </MenuSheet>
  )
}
