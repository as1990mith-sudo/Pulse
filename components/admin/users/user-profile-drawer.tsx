"use client"

import { useEffect, useState, useTransition } from "react"
import useSWR from "swr"
import {
  BadgeCheck,
  Ban,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  History,
  Monitor,
  RotateCcw,
} from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { StatusBadge } from "@/components/admin/kit"
import { cn } from "@/lib/utils"
import { useOverlayHistory } from "@/lib/navigation/use-overlay-history"
import { fetchUserProfile } from "@/app/actions/admin-users-read"
import {
  suspendUser,
  unsuspendUser,
  banUser,
  unbanUser,
  setVerified,
  warnUser,
  resetWarnings,
  setAdminRole,
} from "@/app/actions/admin-users"
import { ADMIN_ROLES, type AdminRole } from "@/lib/rbac"
import { toast } from "sonner"

type Props = {
  userId: string | null
  onClose: () => void
  canModerate: boolean
  canManageRoles: boolean
}

const tabs = ["Overview", "Moderation", "Login history"] as const

export function UserProfileDrawer({ userId, onClose, canModerate, canManageRoles }: Props) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview")
  const [pending, startTransition] = useTransition()
  // Back / iOS swipe-back closes the drawer instead of leaving the admin users
  // list, which would throw away the surrounding filters and scroll position.
  useOverlayHistory(!!userId, onClose, "admin-user-drawer")
  // Each user opens on Overview. Without this the drawer kept the tab from the
  // previously inspected user, so opening someone new could land on an empty
  // "Login history" and look like missing data.
  useEffect(() => {
    setTab("Overview")
  }, [userId])

  const { data: profile, isLoading, mutate } = useSWR(
    userId ? ["admin-user-profile", userId] : null,
    () => fetchUserProfile(userId!),
  )

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, successMsg: string) {
    startTransition(async () => {
      try {
        const res = await fn()
        if (res.ok) {
          toast.success(successMsg)
          void mutate()
        } else {
          toast.error(res.error ?? "Action failed")
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Action failed")
      }
    })
  }

  function promptReason(label: string): string | null {
    const reason = window.prompt(`${label} — add a reason (shown to the user):`, "")
    return reason
  }

  const u = profile?.user

  return (
    <Sheet open={!!userId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md">
        {isLoading || !u ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <SheetHeader className="border-b border-border p-5">
              <SheetTitle className="sr-only">User profile</SheetTitle>
              <div className="flex items-start gap-4">
                <span
                  className="flex size-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
                  style={{ backgroundColor: u.color }}
                >
                  {u.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.image || "/placeholder.svg"} alt="" className="size-14 rounded-full object-cover" />
                  ) : (
                    u.initials
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h2 className="truncate text-lg font-semibold text-foreground">{u.name}</h2>
                    {u.verified && <BadgeCheck className="size-4 shrink-0 text-sky-400" />}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <StatusBadge
                      tone={
                        u.status === "banned"
                          ? "danger"
                          : u.status === "suspended" || u.status === "warned"
                            ? "warning"
                            : "success"
                      }
                    >
                      {u.status}
                    </StatusBadge>
                    {u.role && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        <ShieldCheck className="size-3" />
                        {u.role.replace(/_/g, " ")}
                      </span>
                    )}
                    {u.warnings > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
                        <AlertTriangle className="size-3" />
                        {u.warnings} warning{u.warnings > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="mt-4 grid grid-cols-4 gap-2">
                {[
                  { label: "Posts", value: profile.stats.posts },
                  { label: "Followers", value: profile.stats.followers },
                  { label: "Following", value: profile.stats.following },
                  { label: "Episodes", value: profile.stats.episodes },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-border bg-muted/30 p-2 text-center">
                    <div className="text-sm font-semibold text-foreground">{s.value}</div>
                    <div className="text-[10px] text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            </SheetHeader>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-border px-5 pt-3">
              {tabs.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "relative pb-2.5 text-xs font-medium transition",
                    tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    "px-2",
                  )}
                >
                  {t}
                  {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
                </button>
              ))}
            </div>

            <div className="flex-1 space-y-5 p-5">
              {tab === "Overview" && (
                <>
                  {u.bio && (
                    <div>
                      <h3 className="mb-1 text-xs font-medium text-muted-foreground">Bio</h3>
                      <p className="text-sm text-foreground">{u.bio}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Field label="User ID" value={u.id} mono />
                    <Field label="Joined" value={new Date(u.createdAt).toLocaleDateString()} />
                    <Field label="Presence" value={u.online ? "Online" : "Offline"} />
                    {u.suspendedUntil && (
                      <Field label="Suspended until" value={new Date(u.suspendedUntil).toLocaleString()} />
                    )}
                  </div>
                  {u.reason && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-400">
                      <span className="font-medium">Reason on file:</span> {u.reason}
                    </div>
                  )}

                  {/* Moderation actions */}
                  {canModerate && (
                    <div className="space-y-3 border-t border-border pt-4">
                      <h3 className="text-xs font-medium text-muted-foreground">Moderation actions</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <ActionButton
                          disabled={pending}
                          onClick={() => run(() => setVerified(u.id, !u.verified), u.verified ? "Unverified" : "Verified")}
                          icon={BadgeCheck}
                          label={u.verified ? "Remove verification" : "Verify account"}
                        />
                        <ActionButton
                          disabled={pending}
                          onClick={() => {
                            const r = promptReason("Warn user")
                            if (r !== null) run(() => warnUser(u.id, r), "Warning issued")
                          }}
                          icon={AlertTriangle}
                          label="Issue warning"
                          tone="warning"
                        />
                        {u.warnings > 0 && (
                          <ActionButton
                            disabled={pending}
                            onClick={() => run(() => resetWarnings(u.id), "Warnings reset")}
                            icon={RotateCcw}
                            label="Reset warnings"
                          />
                        )}
                        {u.status === "suspended" ? (
                          <ActionButton
                            disabled={pending}
                            onClick={() => run(() => unsuspendUser(u.id), "Suspension lifted")}
                            icon={Clock}
                            label="Lift suspension"
                          />
                        ) : (
                          <ActionButton
                            disabled={pending}
                            onClick={() => {
                              const r = promptReason("Suspend user")
                              if (r !== null) {
                                const days = window.prompt("Suspend for how many days? (blank = indefinite)", "7")
                                const until =
                                  days && !isNaN(Number(days))
                                    ? new Date(Date.now() + Number(days) * 86400000).toISOString()
                                    : null
                                run(() => suspendUser(u.id, r, until), "User suspended")
                              }
                            }}
                            icon={Clock}
                            label="Suspend"
                            tone="warning"
                          />
                        )}
                        {u.status === "banned" ? (
                          <ActionButton
                            disabled={pending}
                            onClick={() => run(() => unbanUser(u.id), "Ban lifted")}
                            icon={Ban}
                            label="Lift ban"
                          />
                        ) : (
                          <ActionButton
                            disabled={pending}
                            onClick={() => {
                              const r = promptReason("Ban user")
                              if (r !== null) run(() => banUser(u.id, r), "User banned")
                            }}
                            icon={Ban}
                            label="Ban account"
                            tone="danger"
                          />
                        )}
                      </div>

                      {/* Role management */}
                      {canManageRoles && (
                        <div className="border-t border-border pt-4">
                          <h3 className="mb-2 text-xs font-medium text-muted-foreground">Admin role</h3>
                          <select
                            value={u.role ?? ""}
                            disabled={pending}
                            onChange={(e) =>
                              run(
                                () => setAdminRole(u.id, (e.target.value || null) as AdminRole | null),
                                "Role updated",
                              )
                            }
                            className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary/60"
                          >
                            <option value="">No admin role</option>
                            {ADMIN_ROLES.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {tab === "Moderation" && (
                <div className="space-y-3">
                  {profile.moderationHistory.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No moderation history.</p>
                  ) : (
                    profile.moderationHistory.map((m) => (
                      <div key={m.id} className="flex gap-3 rounded-lg border border-border bg-muted/20 p-3">
                        <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium capitalize text-foreground">{m.action.replace(/[:_]/g, " ")}</p>
                          {m.reason && <p className="text-xs text-muted-foreground">{m.reason}</p>}
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {new Date(m.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === "Login history" && (
                <div className="space-y-2">
                  {profile.loginHistory.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No sessions on record.</p>
                  ) : (
                    profile.loginHistory.map((s) => (
                      <div key={s.id} className="flex gap-3 rounded-lg border border-border bg-muted/20 p-3">
                        <Monitor className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-foreground">{s.userAgent ?? "Unknown device"}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {s.ipAddress ?? "No IP"} · {new Date(s.createdAt).toLocaleString()}
                          </p>
                        </div>
                        {s.current && <StatusBadge tone="success">Active</StatusBadge>}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={cn("truncate text-foreground", mono && "font-mono text-xs")}>{value}</div>
    </div>
  )
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone = "neutral",
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: "neutral" | "warning" | "danger"
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition disabled:opacity-50",
        tone === "danger"
          ? "border-red-500/30 text-red-500 hover:bg-red-500/10"
          : tone === "warning"
            ? "border-amber-500/30 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
            : "border-border text-foreground hover:bg-muted",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}
