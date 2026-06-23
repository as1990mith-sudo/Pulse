"use client"

import { useState } from "react"
import { Users, X } from "lucide-react"
import type { LiveAudienceMember } from "@/app/actions/live"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ProfilePreview } from "@/components/profile-preview"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { cn } from "@/lib/utils"

/**
 * A compact "N listening" chip that opens a sheet listing everyone currently in
 * the room (host first, then listeners). Each row is tappable to preview that
 * person's profile. Used in both the host studio and the listener view.
 */
export function LiveAudienceSheet({
  count,
  members,
  immersive = false,
  className,
}: {
  count: number
  members: LiveAudienceMember[]
  immersive?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)

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

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
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
              {members.map((m) => (
                <li key={m.userId}>
                  <ProfilePreview
                    userId={m.userId}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 transition-colors hover:bg-secondary"
                  >
                    <Avatar className="size-10 shrink-0">
                      {m.userImage ? <AvatarImage src={m.userImage} alt={m.userName} /> : null}
                      <AvatarFallback className={getAvatarColor(m.userId)}>{getInitials(m.userName)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.userName}</span>
                    {m.isHost && (
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Host
                      </span>
                    )}
                  </ProfilePreview>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
