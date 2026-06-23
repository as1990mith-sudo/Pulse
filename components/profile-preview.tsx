"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, UserPlus, UserCheck } from "lucide-react"
import { getProfilePreview } from "@/app/actions/users"
import { toggleFollow } from "@/app/actions/follow"
import type { Profile } from "@/lib/profile"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { cn } from "@/lib/utils"

/**
 * A tappable trigger (a chat author's name/avatar) that opens a glanceable
 * profile preview: avatar, name, handle, follower/following counts, a follow
 * toggle, and a link through to the full profile. Used inside the live chat so
 * listeners can quickly check who someone is and follow them without leaving
 * the room.
 */
export function ProfilePreview({
  userId,
  children,
  className,
  disabled = false,
}: {
  userId: string
  children: React.ReactNode
  className?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(true)}
        className={cn("text-left disabled:cursor-default", className)}
      >
        {children}
      </button>
      {open && <ProfilePreviewCard userId={userId} onClose={() => setOpen(false)} />}
    </>
  )
}

function ProfilePreviewCard({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [following, setFollowing] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    getProfilePreview(userId)
      .then((p) => {
        if (cancelled) return
        setProfile(p)
        setFollowing(p?.isFollowing ?? false)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [userId])

  // Close on Escape for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function handleFollow() {
    if (!profile || profile.isSelf || pending) return
    const next = !following
    setFollowing(next)
    setPending(true)
    try {
      await toggleFollow({ targetUserId: profile.id, follow: next })
    } catch {
      setFollowing(!next)
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Profile preview"
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close profile preview"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-xs overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-2xl">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !profile ? (
          <div className="flex h-48 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            This user is no longer available.
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 p-6">
            <Avatar className="size-20 ring-2 ring-primary/20">
              {profile.image ? <AvatarImage src={profile.image} alt={profile.name} /> : null}
              <AvatarFallback className={cn("text-xl", getAvatarColor(profile.id))}>
                {getInitials(profile.name)}
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <p className="text-lg font-semibold leading-tight text-balance">{profile.name}</p>
              <p className="text-sm text-muted-foreground">{profile.handle}</p>
            </div>
            <div className="flex items-center gap-6 text-center">
              <div>
                <p className="text-base font-semibold">{profile.followers.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Followers</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <p className="text-base font-semibold">{profile.following.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Following</p>
              </div>
            </div>
            <div className="mt-1 flex w-full flex-col gap-2">
              {!profile.isSelf && (
                <button
                  type="button"
                  onClick={() => void handleFollow()}
                  disabled={pending}
                  className={cn(
                    "flex h-10 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-60",
                    following
                      ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      : "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                >
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : following ? (
                    <>
                      <UserCheck className="size-4" /> Following
                    </>
                  ) : (
                    <>
                      <UserPlus className="size-4" /> Follow
                    </>
                  )}
                </button>
              )}
              <Link
                href={`/u/${profile.id}`}
                onClick={onClose}
                className="flex h-10 items-center justify-center rounded-full border border-border text-sm font-semibold transition-colors hover:bg-secondary"
              >
                View profile
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
