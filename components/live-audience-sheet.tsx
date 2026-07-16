"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Ban, Loader2, Undo2, UserPlus, Users, X } from "lucide-react"
import type { BlockedUserView, LiveAudienceMember } from "@/app/actions/live"
import { blockParticipant, inviteToStage, unblockParticipant } from "@/app/actions/live"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ProfilePreview } from "@/components/profile-preview"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { cn } from "@/lib/utils"

/**
 * A compact "N listening" chip that opens a sheet listing everyone currently in
 * the room (host first, then listeners). Each row is tappable to preview that
 * person's profile. Used in both the host studio and the listener view.
 *
 * When `isHost` + `roomName` are supplied, each non-host row also gets host
 * controls — invite the person on as a guest, or block them from the room — and
 * a "Blocked" section (with Unblock) is shown. Non-host usages omit these props
 * and render exactly as before.
 */
export function LiveAudienceSheet({
  count,
  members,
  immersive = false,
  className,
  isHost = false,
  roomName,
  blockedUsers = [],
  onChanged,
}: {
  count: number
  members: LiveAudienceMember[]
  immersive?: boolean
  className?: string
  isHost?: boolean
  roomName?: string
  blockedUsers?: BlockedUserView[]
  onChanged?: () => void
}) {
  const [open, setOpen] = useState(false)
  // Portals need the DOM; guard against SSR so we only render once mounted.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Per-user in-flight action + transient "Invited" acknowledgements.
  const [busy, setBusy] = useState<Record<string, "invite" | "block" | "unblock" | undefined>>({})
  const [invited, setInvited] = useState<Record<string, boolean>>({})

  const hostControls = isHost && Boolean(roomName)
  const blockedIds = new Set(blockedUsers.map((b) => b.userId))

  async function handleInvite(m: LiveAudienceMember) {
    if (!roomName) return
    setBusy((b) => ({ ...b, [m.userId]: "invite" }))
    try {
      await inviteToStage({ roomName, userId: m.userId, userName: m.userName })
      setInvited((i) => ({ ...i, [m.userId]: true }))
      onChanged?.()
    } catch {
      /* leave state as-is; host can retry */
    } finally {
      setBusy((b) => ({ ...b, [m.userId]: undefined }))
    }
  }

  async function handleBlock(userId: string, userName: string) {
    if (!roomName) return
    setBusy((b) => ({ ...b, [userId]: "block" }))
    try {
      await blockParticipant({ roomName, userId, userName })
      onChanged?.()
    } catch {
      /* no-op */
    } finally {
      setBusy((b) => ({ ...b, [userId]: undefined }))
    }
  }

  async function handleUnblock(userId: string) {
    if (!roomName) return
    setBusy((b) => ({ ...b, [userId]: "unblock" }))
    try {
      await unblockParticipant({ roomName, userId })
      onChanged?.()
    } catch {
      /* no-op */
    } finally {
      setBusy((b) => ({ ...b, [userId]: undefined }))
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${count} listening — view who's here`}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
          immersive
            ? "bg-white/10 text-white/90 hover:bg-white/20"
            : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
          className,
        )}
      >
        <Users className="size-3.5" />
        {count.toLocaleString()}
      </button>

      {open &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              aria-label="Close listeners"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <div className="relative flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-border bg-card text-card-foreground shadow-2xl sm:rounded-3xl">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold">In the room</h2>
                  <p className="text-xs text-muted-foreground">
                    {count.toLocaleString()} {count === 1 ? "listener" : "listeners"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="size-5" />
                </button>
              </div>
              <ul className="flex-1 overflow-y-auto p-2">
                {members.length === 0 && (
                  <li className="px-3 py-8 text-center text-sm text-muted-foreground">No one here yet.</li>
                )}
                {members.map((m) => {
                  const showActions = hostControls && !m.isHost && !blockedIds.has(m.userId)
                  const rowBusy = busy[m.userId]
                  return (
                    <li key={m.userId} className="flex items-center gap-1">
                      <ProfilePreview
                        userId={m.userId}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2 transition-colors hover:bg-secondary"
                      >
                        <Avatar className="size-10 shrink-0">
                          {m.userImage ? <AvatarImage src={m.userImage} alt={m.userName} /> : null}
                          <AvatarFallback className={getAvatarColor(m.userId)}>
                            {getInitials(m.userName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.userName}</span>
                        {m.isHost && (
                          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                            Host
                          </span>
                        )}
                      </ProfilePreview>

                      {showActions && (
                        <div className="flex shrink-0 items-center gap-1 pr-1">
                          <button
                            type="button"
                            onClick={() => void handleInvite(m)}
                            disabled={Boolean(rowBusy) || invited[m.userId]}
                            aria-label={`Invite ${m.userName} to the stage`}
                            className={cn(
                              "flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60",
                              invited[m.userId]
                                ? "bg-primary/15 text-primary"
                                : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                            )}
                          >
                            {rowBusy === "invite" ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <UserPlus className="size-3.5" />
                            )}
                            {invited[m.userId] ? "Invited" : "Invite"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleBlock(m.userId, m.userName)}
                            disabled={Boolean(rowBusy)}
                            aria-label={`Block ${m.userName}`}
                            className="flex items-center justify-center rounded-full p-2 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
                          >
                            {rowBusy === "block" ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Ban className="size-4" />
                            )}
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>

              {/* Blocked participants — host-only management list. */}
              {hostControls && blockedUsers.length > 0 && (
                <div className="border-t border-border p-2">
                  <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Blocked
                  </p>
                  <ul>
                    {blockedUsers.map((b) => (
                      <li key={b.userId} className="flex items-center gap-3 rounded-2xl px-3 py-2">
                        <Avatar className="size-9 shrink-0 opacity-70">
                          <AvatarFallback className={b.color}>{b.initials}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
                          {b.userName}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleUnblock(b.userId)}
                          disabled={busy[b.userId] === "unblock"}
                          className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-60"
                        >
                          {busy[b.userId] === "unblock" ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Undo2 className="size-3.5" />
                          )}
                          Unblock
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
