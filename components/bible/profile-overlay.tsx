"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Loader2, MessageCircle, UserCheck, UserPlus, X } from "lucide-react"
import { getProfilePreview } from "@/app/actions/users"
import { toggleFollow } from "@/app/actions/follow"
import type { Profile } from "@/lib/profile"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import { useBibleFellowship } from "./fellowship-context"

/** Context-connected overlay: renders only when a profile is open. */
export function BibleProfileOverlay() {
  const { profileUserId, closeProfile, openChat } = useBibleFellowship()
  if (!profileUserId) return null
  return (
    <ProfileOverlayCard
      key={profileUserId}
      userId={profileUserId}
      onClose={closeProfile}
      onMessage={(reader) => void openChat(reader)}
    />
  )
}

/**
 * A full profile card shown as an overlay above the Bible page. Because it's a
 * fixed portal that never unmounts the reader, closing it returns the user to
 * the exact same chapter and scroll position. "Message" hands off to the
 * floating in-Bible chat rather than navigating to the Messages page.
 */
function ProfileOverlayCard({
  userId,
  onClose,
  onMessage,
}: {
  userId: string
  onClose: () => void
  onMessage: (reader: { userId: string; name: string; image: string | null }) => void
}) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [following, setFollowing] = useState(false)
  const [pending, setPending] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

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
    haptic(next ? "success" : "light")
    try {
      await toggleFollow({ targetUserId: profile.id, follow: next })
    } catch {
      setFollowing(!next)
    } finally {
      setPending(false)
    }
  }

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Reader profile"
    >
      <button
        type="button"
        aria-label="Close profile"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm duration-200 animate-in fade-in"
      />
      <div className="relative w-full max-w-xs overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-2xl duration-300 animate-in fade-in zoom-in-95">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 inline-flex size-8 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur transition-colors hover:bg-background"
        >
          <X className="size-4" />
        </button>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !profile ? (
          <div className="flex h-48 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            This reader is no longer available.
          </div>
        ) : (
          <>
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
                <p className="text-balance text-xl font-bold leading-tight">{profile.name}</p>
                <p className="text-sm text-muted-foreground">{profile.handle}</p>
              </div>

              {profile.bio ? (
                <p className="text-pretty text-center text-sm text-muted-foreground">{profile.bio}</p>
              ) : null}

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
                      "flex h-12 items-center justify-center gap-2 rounded-full text-[15px] font-bold transition-all active:scale-95 disabled:opacity-60",
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
                {!profile.isSelf && (
                  <button
                    type="button"
                    onClick={() => {
                      onMessage({ userId: profile.id, name: profile.name, image: profile.image })
                      onClose()
                    }}
                    className="flex h-12 items-center justify-center gap-2 rounded-full border border-border text-[15px] font-bold transition-colors hover:bg-secondary active:scale-95"
                  >
                    <MessageCircle className="size-5" /> Message
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
