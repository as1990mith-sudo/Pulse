"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { X, Loader2 } from "lucide-react"
import { listFollowers, listFollowing } from "@/app/actions/follow"
import type { ProfileSummary } from "@/lib/profile"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

type Mode = "followers" | "following"

export function ProfileFollowStats({
  userId,
  followers,
  following,
}: {
  userId: string
  followers: number
  following: number
}) {
  const [mode, setMode] = useState<Mode | null>(null)

  return (
    <div className="flex items-stretch justify-center">
      <button
        type="button"
        onClick={() => setMode("followers")}
        className="group flex min-w-20 flex-col items-center gap-0.5 rounded-xl px-5 py-0.5 transition-colors hover:bg-foreground/5"
      >
        <span className="text-lg font-bold tabular-nums text-foreground">{followers}</span>
        <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground">Followers</span>
      </button>

      <div className="h-9 w-px self-center bg-border/70" aria-hidden />

      <button
        type="button"
        onClick={() => setMode("following")}
        className="group flex min-w-20 flex-col items-center gap-0.5 rounded-xl px-5 py-0.5 transition-colors hover:bg-foreground/5"
      >
        <span className="text-lg font-bold tabular-nums text-foreground">{following}</span>
        <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground">Following</span>
      </button>

      {mode && <FollowListDialog userId={userId} mode={mode} onClose={() => setMode(null)} />}
    </div>
  )
}

function FollowListDialog({ userId, mode, onClose }: { userId: string; mode: Mode; onClose: () => void }) {
  const [users, setUsers] = useState<ProfileSummary[] | null>(null)

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  useEffect(() => {
    let active = true
    const fetcher = mode === "followers" ? listFollowers : listFollowing
    fetcher(userId).then((rows) => {
      if (active) setUsers(rows)
    })
    return () => {
      active = false
    }
  }, [userId, mode])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "followers" ? "Followers" : "Following"}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h2 className="text-sm font-semibold capitalize">{mode}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {users === null ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {mode === "followers" ? "No followers yet." : "Not following anyone yet."}
            </p>
          ) : (
            users.map((u) => (
              <Link
                key={u.id}
                href={`/u/${u.id}`}
                onClick={onClose}
                className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary"
              >
                <Avatar className="size-9">
                  <AvatarImage src={u.image ?? undefined} alt={u.name} />
                  <AvatarFallback className={cn("text-xs", u.color)}>{u.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.handle}</p>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
