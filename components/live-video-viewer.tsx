"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Heart, Loader2, Radio, Share2, UserCheck, UserPlus, Users, Volume2 } from "lucide-react"
import type { LiveStreamView } from "@/app/actions/live"
import { joinBroadcast, getCallState, sendLiveReaction } from "@/app/actions/live"
import { toggleFollow } from "@/app/actions/follow"
import { useLiveVideo } from "@/lib/use-live-video"
import { ReactionLayer, ReactionPicker } from "@/components/live-reactions"
import { VideoCommentStream, VideoCommentComposer } from "@/components/live-video-comments"
import { ShareSheet } from "@/components/share-sheet"
import type { ShareTarget } from "@/lib/share-types"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { cn } from "@/lib/utils"

/** Compact glass follow button for the host info pill. */
function InlineFollowButton({
  targetUserId,
  targetName,
  initialFollowing,
}: {
  targetUserId: string
  targetName: string
  initialFollowing: boolean
}) {
  const [following, setFollowing] = useState(initialFollowing)
  const [isPending, startTransition] = useTransition()

  function onClick() {
    const next = !following
    setFollowing(next)
    startTransition(async () => {
      try {
        await toggleFollow({ targetUserId, follow: next })
      } catch {
        setFollowing(!next)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-label={following ? `Unfollow ${targetName}` : `Follow ${targetName}`}
      className={cn(
        "ml-1 flex h-7 items-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors disabled:opacity-60",
        following ? "bg-white/15 text-white ring-1 ring-inset ring-white/20" : "bg-live text-live-foreground",
      )}
    >
      {following ? <UserCheck className="size-3.5" /> : <UserPlus className="size-3.5" />}
      {following ? "Following" : "Follow"}
    </button>
  )
}

type Burst = { key: string; x: number; y: number }

/**
 * Immersive, full-screen TikTok-style viewer for a live video broadcast. The
 * host's camera fills the screen; glassy overlays carry host info + follow, a
 * live comment stream, a right rail of action buttons (heart, gift, share), and
 * a tap-anywhere-to-heart affordance.
 */
export function LiveVideoViewer({
  stream,
  canWatch,
  currentUserId = null,
  initialFollowing = false,
}: {
  stream: LiveStreamView
  canWatch: boolean
  currentUserId?: string | null
  initialFollowing?: boolean
}) {
  const router = useRouter()
  const [creds, setCreds] = useState<{ token: string; serverUrl: string } | null>(null)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)
  const [hostEnded, setHostEnded] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [bursts, setBursts] = useState<Burst[]>([])
  const [audioBlocked, setAudioBlocked] = useState(false)

  const {
    remoteVideoRef,
    remoteAudioRef,
    connected,
    remoteVideoOn,
    participants,
    error: rtcError,
    disconnect,
  } = useLiveVideo({
    token: creds?.token ?? null,
    serverUrl: creds?.serverUrl ?? null,
    isHost: false,
  })

  async function join() {
    if (!canWatch) return
    setError(null)
    setJoining(true)
    const res = await joinBroadcast({ roomName: stream.roomName })
    setJoining(false)
    if (!res.ok) {
      setError(res.error)
      setEnded(true)
      return
    }
    setCreds({ token: res.token, serverUrl: res.serverUrl })
  }

  useEffect(() => {
    void join()
    return () => disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Browsers may block audio autoplay until a gesture.
  useEffect(() => {
    const el = remoteAudioRef.current
    if (!el) return
    const onPlay = () => setAudioBlocked(false)
    el.addEventListener("playing", onPlay)
    // Detect blocked playback shortly after connecting.
    if (connected) {
      el.play().catch(() => setAudioBlocked(true))
    }
    return () => el.removeEventListener("playing", onPlay)
  }, [connected, remoteAudioRef])

  // Poll for the host ending the broadcast → splash then redirect.
  useEffect(() => {
    if (!canWatch) return
    let cancelled = false
    const tick = async () => {
      const s = await getCallState({ roomName: stream.roomName })
      if (cancelled) return
      if (s.ended) {
        setHostEnded(true)
        disconnect()
        setTimeout(() => router.push("/live"), 2600)
      }
    }
    void tick()
    const iv = setInterval(tick, 3000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWatch, stream.roomName])

  function enableSound() {
    remoteAudioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => {})
  }

  // Tap anywhere on the video to send a heart with a quick burst at the point.
  function handleTapHeart(e: React.MouseEvent<HTMLDivElement>) {
    if (!canWatch || !connected) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setBursts((b) => [...b, { key, x, y }])
    setTimeout(() => setBursts((b) => b.filter((i) => i.key !== key)), 1000)
    void sendLiveReaction({ roomName: stream.roomName, emoji: "❤️", kind: "reaction" }).catch(() => {})
  }

  const shareTarget: ShareTarget = {
    type: "live",
    key: stream.roomName,
    title: stream.title,
    subtitle: `Join ${stream.hostName} live on Frequency`,
    url: `/live/${stream.roomName}`,
    image: stream.cover ?? null,
    downloadUrl: null,
    downloadKind: null,
  }

  const viewers = Math.max(0, participants - 1)
  const isSelf = currentUserId === stream.hostId

  if (hostEnded) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-neutral-950 px-6 text-center text-white">
        <span className="flex size-12 items-center justify-center rounded-full bg-white/10 text-white/80">
          <Radio className="size-6" />
        </span>
        <p className="text-lg font-semibold">Session ended</p>
        <p className="text-sm text-white/60">The host has ended this live. Taking you back to Live…</p>
        <Loader2 className="size-4 animate-spin text-white/60" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-neutral-950 text-white">
      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      {/* Full-bleed host camera + tap-to-heart surface */}
      <div className="absolute inset-0" onClick={handleTapHeart}>
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={cn(
            "h-full w-full object-cover transition-opacity duration-500",
            remoteVideoOn ? "opacity-100" : "opacity-0",
          )}
        />
        {/* Connecting / waiting wash */}
        {!remoteVideoOn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
            {stream.cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={stream.cover || "/placeholder.svg"}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 size-full scale-110 object-cover opacity-20 blur-2xl"
              />
            )}
            <Loader2 className="relative size-7 animate-spin" />
            <p className="relative text-sm font-medium">
              {ended ? error ?? "This stream has ended." : "Connecting to the live…"}
            </p>
          </div>
        )}
        {/* Tap heart bursts */}
        {bursts.map((b) => (
          <span
            key={b.key}
            className="tap-heart pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-4xl"
            style={{ left: `${b.x}%`, top: `${b.y}%` }}
            aria-hidden="true"
          >
            ❤️
          </span>
        ))}
      </div>

      {/* Legibility scrims */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/75"
      />

      {/* Floating reactions + gifts */}
      <ReactionLayer roomName={connected ? stream.roomName : undefined} />

      {/* ── Top bar: back + host pill + live/viewers + close ────────────── */}
      <div className="relative z-20 flex items-start justify-between gap-2 p-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="flex items-center gap-2">
          <Link
            href="/live"
            aria-label="Back to Live"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-colors hover:bg-black/50"
          >
            <ArrowLeft className="size-5" />
          </Link>
          {/* Host info pill */}
          <div className="flex items-center gap-2 rounded-full bg-black/35 py-1 pl-1 pr-1.5 ring-1 ring-inset ring-white/10 backdrop-blur-md">
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-full text-xs font-semibold text-white",
                getAvatarColor(stream.hostId),
              )}
              aria-hidden="true"
            >
              {getInitials(stream.hostName)}
            </span>
            <div className="flex flex-col leading-tight">
              <span className="max-w-28 truncate text-sm font-semibold">{stream.hostName}</span>
              <span className="text-[11px] text-white/60">@{stream.hostHandle}</span>
            </div>
            {!isSelf && (
              <InlineFollowButton
                targetUserId={stream.hostId}
                targetName={stream.hostName}
                initialFollowing={initialFollowing}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <span className="flex items-center gap-1.5 rounded-full bg-live px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-live-foreground shadow-lg">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-live-foreground/70" />
              <span className="relative inline-flex size-2 rounded-full bg-live-foreground" />
            </span>
            Live
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1.5 text-xs font-medium text-white/90 ring-1 ring-inset ring-white/10 backdrop-blur-md">
            <Users className="size-3.5" /> {viewers.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Tap-to-enable-sound (autoplay unblock) */}
      {connected && audioBlocked && (
        <button
          type="button"
          onClick={enableSound}
          className="absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-white/15 px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/20 backdrop-blur-md"
        >
          <Volume2 className="size-4" /> Tap to enable sound
        </button>
      )}

      {/* ── Bottom: comments + composer; right rail of actions ──────────── */}
      <div className="relative z-20 mt-auto flex items-end justify-between gap-3 p-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="pointer-events-none">
            <VideoCommentStream roomName={stream.roomName} />
          </div>
          {canWatch ? (
            <VideoCommentComposer roomName={stream.roomName} placeholder={`Comment as a viewer…`} className="max-w-sm" />
          ) : (
            <p className="rounded-full bg-black/35 px-4 py-2.5 text-sm text-white/80 ring-1 ring-inset ring-white/10 backdrop-blur-md">
              <Link href="/sign-in" className="font-semibold text-white underline">
                Sign in
              </Link>{" "}
              to comment and react.
            </p>
          )}
        </div>

        {/* Right action rail */}
        <div className="flex shrink-0 flex-col items-center gap-4">
          <button
            type="button"
            onClick={() =>
              canWatch && void sendLiveReaction({ roomName: stream.roomName, emoji: "❤️", kind: "reaction" }).catch(() => {})
            }
            disabled={!canWatch || !connected}
            aria-label="Send a heart"
            className="flex size-12 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-all hover:bg-black/50 active:scale-90 disabled:opacity-40"
          >
            <Heart className="size-6 fill-live text-live" />
          </button>
          {/* Reaction + gift picker (glass styled to match the rail) */}
          <ReactionPicker
            roomName={canWatch ? stream.roomName : undefined}
            disabled={!connected}
            className="size-12 bg-black/35 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md hover:bg-black/50"
          />
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            aria-label="Share this live"
            className="flex size-12 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-all hover:bg-black/50 active:scale-90"
          >
            <Share2 className="size-5" />
          </button>
        </div>
      </div>

      {(rtcError || (error && !ended)) && (
        <p className="absolute bottom-2 left-1/2 z-30 -translate-x-1/2 rounded-full bg-destructive px-4 py-1.5 text-sm font-medium text-destructive-foreground shadow-lg">
          {rtcError ?? error}
        </p>
      )}

      {joining && !connected && (
        <span className="sr-only" role="status">
          Connecting to the live stream
        </span>
      )}

      <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  )
}
