"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import useSWR from "swr"
import {
  Ban,
  ExternalLink,
  FileText,
  Heart,
  Loader2,
  MessageCircle,
  MoreVertical,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserMinus,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { approveMember, updateMemberRole } from "@/app/actions/home"
import { getMemberDetail } from "@/app/actions/home-members"
import {
  getMemberModeration,
  removeMemberFromHome,
  suspendMember,
  unsuspendMember,
} from "@/app/actions/home-reports"
import { ACTIVITY_META, type MemberActivityItem, type MemberTimeframe } from "@/lib/home/members"
import { HOME_ROLES, homeRoleLabel, type HomeRole } from "@/lib/home/roles"
import {
  MODERATION_ACTION_META,
  SUSPENSION_DURATIONS,
  moderationActionLabel,
  type ModerationActionKind,
  type SuspensionDurationId,
} from "@/lib/home/moderation"
import {
  MemberAvatar,
  formatJoined,
  formatLastActive,
  formatTimelineStamp,
} from "./shared"

const KIND_ICON = { post: FileText, comment: MessageCircle, like: Heart } as const

export function DetailDrawer({
  handle,
  membershipId,
  timeframe,
  canManage,
  onClose,
  onChanged,
}: {
  handle: string
  membershipId: string
  timeframe: MemberTimeframe
  canManage: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [visible, setVisible] = useState(false)
  const [pending, startTransition] = useTransition()
  const [menuOpen, setMenuOpen] = useState(false)
  const [suspendOpen, setSuspendOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [duration, setDuration] = useState<SuspensionDurationId>("24h")
  const menuRef = useRef<HTMLDivElement>(null)

  // Close the ⋮ menu on any outside click.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [menuOpen])

  const { data, isLoading, mutate } = useSWR(["home-member-detail", handle, membershipId, timeframe], () =>
    getMemberDetail(handle, membershipId, timeframe),
  )

  const rowUserId = data?.row?.userId
  // Home-scoped discipline state + history. Only fetched once we know the user
  // and only meaningful for manageable, non-owner members.
  const { data: moderation, mutate: mutateModeration } = useSWR(
    canManage && rowUserId ? ["home-member-moderation", handle, rowUserId] : null,
    () => getMemberModeration(handle, rowUserId as string),
  )

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function close() {
    setVisible(false)
    setTimeout(onClose, 220)
  }

  const row = data?.row

  function changeRole(role: HomeRole) {
    if (!row) return
    startTransition(async () => {
      await updateMemberRole(handle, row.id, role)
      await mutate()
      onChanged()
    })
  }

  function approve() {
    if (!row) return
    startTransition(async () => {
      await approveMember(handle, row.id)
      await mutate()
      onChanged()
    })
  }

  function doSuspend() {
    if (!row) return
    startTransition(async () => {
      await suspendMember(handle, row.userId, duration)
      setSuspendOpen(false)
      await mutateModeration()
      onChanged()
    })
  }

  function doUnsuspend() {
    if (!row) return
    startTransition(async () => {
      await unsuspendMember(handle, row.userId)
      await mutateModeration()
      onChanged()
    })
  }

  function doRemove() {
    if (!row) return
    startTransition(async () => {
      await removeMemberFromHome(handle, row.userId)
      onChanged()
      close()
    })
  }

  // Only ordinary, non-viewer members can be moderated (never an owner/admin).
  const canModerate = !!row && canManage && !row.isViewer && row.role !== "owner" && row.role !== "administrator"

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Member details">
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className={cn(
          "absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        className={cn(
          "absolute bg-card shadow-elevated transition-transform duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
          // Mobile: full-screen sheet from the right
          "inset-0",
          // Desktop: right-side panel
          "sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[440px] sm:border-l sm:border-border/60",
          visible ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Member</p>
            <div className="flex items-center gap-1">
              {canModerate && (
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setMenuOpen((v) => !v)}
                    className="tap-scale flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    aria-label="Moderation actions"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                  >
                    <MoreVertical className="size-5" />
                  </button>
                  {menuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-9 z-10 w-52 overflow-hidden rounded-xl border border-border/60 bg-popover shadow-elevated"
                    >
                      {moderation?.suspended ? (
                        <MenuItem
                          icon={ShieldCheck}
                          label="Lift suspension"
                          onClick={() => {
                            setMenuOpen(false)
                            doUnsuspend()
                          }}
                        />
                      ) : (
                        <MenuItem
                          icon={Ban}
                          label="Suspend"
                          onClick={() => {
                            setMenuOpen(false)
                            setSuspendOpen(true)
                          }}
                        />
                      )}
                      <MenuItem
                        icon={UserMinus}
                        label="Remove from Home"
                        destructive
                        onClick={() => {
                          setMenuOpen(false)
                          setRemoveOpen(true)
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={close}
                className="tap-scale flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto" data-scroll>
            {isLoading || !row ? (
              <DrawerSkeleton />
            ) : (
              <div className="space-y-5 px-4 py-4">
                {/* Identity */}
                <div className="flex items-center gap-3">
                  <MemberAvatar
                    name={row.name}
                    image={row.image}
                    initials={row.initials}
                    color={row.color}
                    className="size-14 text-sm"
                  />
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-lg font-semibold tracking-tight">{row.name}</h2>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.gender ? `${row.gender[0].toUpperCase()}${row.gender.slice(1)}` : "Gender not set"} ·{" "}
                      {row.status === "pending" ? "Pending" : homeRoleLabel(row.role)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">Joined {formatJoined(row.joinedAt, true)}</p>
                  </div>
                </div>

                {/* Overview */}
                <Section title="Overview">
                  <div className="grid grid-cols-3 gap-2">
                    <MiniStat label="Activity">
                      <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", ACTIVITY_META[row.engagement.level].text)}>
                        <span className={cn("size-1.5 rounded-full", ACTIVITY_META[row.engagement.level].dot)} aria-hidden />
                        {ACTIVITY_META[row.engagement.level].label}
                      </span>
                    </MiniStat>
                    <MiniStat label="Last active">
                      <span className="text-sm font-medium">{formatLastActive(row.lastActiveAt)}</span>
                    </MiniStat>
                    <MiniStat label="Score">
                      <span className="font-display text-lg font-semibold tabular-nums">
                        {row.engagement.score.toLocaleString()}
                      </span>
                    </MiniStat>
                  </div>
                </Section>

                {/* Contributions */}
                <Section title="Contributions">
                  <div className="grid grid-cols-3 gap-2">
                    <Contribution icon={FileText} value={row.engagement.posts} label="Posts" />
                    <Contribution icon={MessageCircle} value={row.engagement.comments} label="Comments" />
                    <Contribution icon={Heart} value={row.engagement.likes} label="Likes" />
                  </div>
                </Section>

                {/* Recent activity */}
                <Section title="Recent activity">
                  <Timeline items={data.recent} />
                </Section>

                {/* Admin information */}
                <Section title="Admin information">
                  <dl className="overflow-hidden rounded-xl border border-border/50">
                    <InfoRow label="Gender" value={row.gender ? homeRoleTitle(row.gender) : "Not set"} />
                    <InfoRow label="Role" value={homeRoleLabel(row.role)} />
                    <InfoRow label="Membership" value={row.status === "pending" ? "Pending approval" : "Active"} />
                    <InfoRow label="Joined" value={formatJoined(row.joinedAt, true)} />
                    <InfoRow label="Email" value={row.email} />
                    {row.phone && <InfoRow label="Phone" value={row.phone} />}
                  </dl>
                </Section>

                {/* Moderation — Home-scoped discipline state + history */}
                {canManage && row.role !== "owner" && (
                  <Section title="Moderation">
                    <div className="space-y-2">
                      {moderation?.suspended && (
                        <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2.5">
                          <Ban className="mt-0.5 size-4 shrink-0 text-red-400" />
                          <div className="min-w-0 text-sm">
                            <p className="font-medium text-red-300">
                              Suspended{" "}
                              {moderation.suspendedUntil
                                ? `until ${formatTimelineStamp(moderation.suspendedUntil)}`
                                : "indefinitely"}
                            </p>
                            {moderation.suspendedByName && (
                              <p className="text-xs text-muted-foreground">by {moderation.suspendedByName}</p>
                            )}
                          </div>
                        </div>
                      )}
                      <ModerationHistory items={moderation?.history ?? []} />
                    </div>
                  </Section>
                )}

                {/* Admin actions */}
                <Section title="Actions">
                  <div className="space-y-2">
                    <Link
                      href={`/u/${row.userId}`}
                      className="tap-scale flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5 text-sm font-medium transition-colors hover:bg-foreground/[0.04]"
                    >
                      View profile
                      <ExternalLink className="size-4 text-muted-foreground" />
                    </Link>

                    {canManage && row.status === "pending" && (
                      <button
                        type="button"
                        onClick={approve}
                        disabled={pending}
                        className="tap-scale flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                        style={{ backgroundColor: "var(--home-accent)" }}
                      >
                        {pending ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
                        Approve member
                      </button>
                    )}

                    {canManage && row.role !== "owner" && !row.isViewer && (
                      <label className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5 text-sm">
                        <span className="font-medium">Role</span>
                        <select
                          value={row.role}
                          onChange={(e) => changeRole(e.target.value as HomeRole)}
                          disabled={pending}
                          className="rounded-lg border border-border/60 bg-background px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[var(--home-accent)] [&>option]:bg-background"
                        >
                          {HOME_ROLES.filter((r) => r.id !== "owner").map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                  </div>
                </Section>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Suspend duration selector */}
      {suspendOpen && row && (
        <ConfirmLayer onClose={() => setSuspendOpen(false)} label="Suspend member">
          <h3 className="font-display text-lg font-semibold tracking-tight">Suspend {row.name}</h3>
          <p className="mt-1 text-pretty text-sm text-muted-foreground">
            Pauses their participation in this Home. It does not affect their Frequency account or other Homes.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-1.5">
            {SUSPENSION_DURATIONS.map((d) => {
              const active = duration === d.id
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDuration(d.id)}
                  className={cn(
                    "tap-scale rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                    active ? "border-[var(--home-accent)] text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground",
                  )}
                  style={active ? { backgroundColor: "color-mix(in oklab, var(--home-accent) 12%, transparent)" } : undefined}
                >
                  {d.label}
                </button>
              )
            })}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSuspendOpen(false)}
              className="tap-scale flex-1 rounded-xl border border-border/60 px-3 py-2.5 text-sm font-medium text-muted-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={doSuspend}
              disabled={pending}
              className="tap-scale flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--home-accent)" }}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
              Suspend
            </button>
          </div>
        </ConfirmLayer>
      )}

      {/* Remove confirmation */}
      {removeOpen && row && (
        <ConfirmLayer onClose={() => setRemoveOpen(false)} label="Remove member">
          <h3 className="font-display text-lg font-semibold tracking-tight">Remove member?</h3>
          <p className="mt-1 text-pretty text-sm text-muted-foreground">
            This will remove {row.name} from this Home. Their Frequency account will not be deleted.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRemoveOpen(false)}
              className="tap-scale flex-1 rounded-xl border border-border/60 px-3 py-2.5 text-sm font-medium text-muted-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={doRemove}
              disabled={pending}
              className="tap-scale flex flex-1 items-center justify-center gap-2 rounded-xl bg-destructive px-3 py-2.5 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <UserMinus className="size-4" />}
              Remove from Home
            </button>
          </div>
        </ConfirmLayer>
      )}
    </div>
  )
}

/** A small centered confirm/selector layer that sits above the drawer. */
function ConfirmLayer({
  children,
  onClose,
  label,
}: {
  children: React.ReactNode
  onClose: () => void
  label: string
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 m-3 w-full max-w-sm rounded-3xl border border-border/60 bg-popover p-5 shadow-elevated animate-in fade-in-0 zoom-in-95 duration-150">
        {children}
      </div>
    </div>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: typeof Ban
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-foreground/[0.05]",
        destructive ? "text-destructive" : "text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  )
}

function ModerationHistory({ items }: { items: { id: string; action: ModerationActionKind; reason: string | null; suspendedUntil: string | null; adminName: string; at: string }[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-border/50 py-4 text-center text-xs text-muted-foreground">
        No moderation actions in this Home
      </p>
    )
  }
  return (
    <ol className="space-y-2">
      {items.map((a) => {
        const meta = MODERATION_ACTION_META[a.action]
        return (
          <li key={a.id} className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-background/40 px-3 py-2.5">
            <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", meta ? "" : "bg-muted-foreground")} style={{ backgroundColor: "currentColor" }} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", meta?.text)}>
                {moderationActionLabel(a.action)}
                {a.action === "suspended" && a.suspendedUntil && (
                  <span className="font-normal text-muted-foreground"> · until {formatTimelineStamp(a.suspendedUntil)}</span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {formatTimelineStamp(a.at)} · {a.adminName}
              </p>
              {a.reason && <p className="mt-0.5 text-xs text-muted-foreground">“{a.reason}”</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function homeRoleTitle(v: string) {
  return v.charAt(0).toUpperCase() + v.slice(1)
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function MiniStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/50 bg-background/40 px-3 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function Contribution({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof FileText
  value: number
  label: string
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border/50 bg-background/40 py-3">
      <Icon className="size-4 text-muted-foreground" />
      <span className="font-display text-lg font-semibold tabular-nums">{value.toLocaleString()}</span>
      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
    </div>
  )
}

function Timeline({ items }: { items: MemberActivityItem[] }) {
  if (items.length === 0) {
    return <p className="rounded-xl border border-border/50 py-6 text-center text-xs text-muted-foreground">No activity yet</p>
  }
  return (
    <ol className="relative space-y-3 pl-1">
      {items.map((it) => {
        const Icon = KIND_ICON[it.kind]
        return (
          <li key={it.id} className="flex gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-muted-foreground">
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                {formatTimelineStamp(it.at)}
              </p>
              <p className="text-sm">
                {it.label}
                {it.ref && <span className="text-muted-foreground"> · “{it.ref}”</span>}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2.5 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-right text-sm font-medium">{value}</dd>
    </div>
  )
}

function DrawerSkeleton() {
  return (
    <div className="space-y-5 px-4 py-4">
      <div className="flex items-center gap-3">
        <div className="size-14 animate-pulse rounded-full bg-foreground/[0.06]" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-40 animate-pulse rounded bg-foreground/[0.06]" />
          <div className="h-3 w-24 animate-pulse rounded bg-foreground/[0.06]" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-foreground/[0.06]" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-foreground/[0.06]" />
        ))}
      </div>
    </div>
  )
}
