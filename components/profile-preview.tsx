"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, MessageCircle, UserPlus, UserCheck } from "lucide-react"
import { getProfilePreview } from "@/app/actions/users"
import { toggleFollow } from "@/app/actions/follow"
import { getOrCreateConversation } from "@/app/actions/dm"
import type { Profile } from "@/lib/profile"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { cn } from "@/lib/utils"

/**
 * A tappable trigger (a chat author's name/avatar) that opens a glanceable
 * profile preview: avatar, name, handle, follower/following counts, a follow
 * toggle, and a shortcut to message them. Used inside the live chat so
 * listeners can quickly check who someone is without leaving the room.
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
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [following, setFollowing] = useState(false)
  const [pending, setPending] = useState(false)
  const [messaging, startMessaging] = useTransition()

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

  function handleMessage() {
    if (!profile) return
    startMessaging(async () => {
      const conversationId = await getOrCreateConversation(profile.id)
      router.push(`/messages/${conversationId}`)
    })
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
          <>
            {/* Immersive banner — a soft gradient pulled from the user's avatar
                colors, with the avatar overlapping its lower edge. */}
            <div
              className="h-24"
              style={{
                backgroundImage: `linear-gradient(135deg, color-mix(in oklab, var(${profile.gradient.from}) 75%, transparent) 0%, color-mix(in oklab, var(${profile.gradient.to}) 55%, transparent) 100%)`,
              }}
            />

            <div className="flex flex-col items-center gap-3 px-6 pb-6">
              <Avatar className="-mt-12 size-24 ring-4 ring-card">
                {profile.image ? <AvatarImage src={profile.image} alt={profile.name} /> : null}
                <AvatarFallback className={cn("text-2xl", getAvatarColor(profile.id))}>
                  {getInitials(profile.name)}
                </AvatarFallback>
              </Avatar>

              <div className="text-center">
                <p className="text-xl font-bold leading-tight text-balance">{profile.name}</p>
                <p className="text-sm text-muted-foreground">{profile.handle}</p>
              </div>

              <div className="flex items-center gap-6 text-center">
                <div>
                  <p className="text-lg font-bold">{profile.followers.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Followers</p>
                </div>
                <div className="h-9 w-px bg-border" />
                <div>
                  <p className="text-lg font-bold">{profile.following.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Following</p>
                </div>
              </div>

              <div className="mt-2 flex w-full flex-col gap-2">
                {!profile.isSelf && (
                  <button
                    type="button"
                    onClick={() => void handleFollow()}
                    disabled={pending}
                    className={cn(
                      "flex h-12 items-center justify-center gap-2 rounded-full text-[15px] font-bold transition-colors disabled:opacity-60",
                      following
                        ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        : "bg-primary text-primary-foreground hover:bg-primary/90",
                    )}
                  >
                    {pending ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : following ? (
                      <>
                        <UserCheck className="size-5" /> Following
                      </>
                    ) : (
                      <>
                        <UserPlus className="size-5" /> Follow
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleMessage}
                  disabled={messaging}
                  className="flex h-12 items-center justify-center gap-2 rounded-full border border-border text-[15px] font-bold transition-colors hover:bg-secondary disabled:opacity-60"
                >
                  {messaging ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <>
                      <MessageCircle className="size-5" /> Message
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
