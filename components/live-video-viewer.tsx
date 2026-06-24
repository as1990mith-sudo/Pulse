"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import useSWR from "swr"
import {
  Hand,
  Heart,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  RefreshCw,
  Share2,
  UserCheck,
  UserPlus,
  Users,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react"
import type { CurrentUser } from "@/lib/session"
import type { LiveStreamView } from "@/app/actions/live"
import {
  joinBroadcast,
  getCallState,
  sendLiveReaction,
  requestToJoin,
  removeFromStage,
} from "@/app/actions/live"
import { toggleFollow } from "@/app/actions/follow"
import { useLiveVideo } from "@/lib/use-live-video"
import { ReactionLayer, ReactionPicker } from "@/components/live-reactions"
import { LiveChat } from "@/components/live-chat"
import { BackExitMenu } from "@/components/live-back-menu"
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

/** A guest call-in tile or an empty placeholder slot. */
function SlotTile({
  peer,
  registerEl,
}: {
  peer?: { identity: string; name: string; image: string | null; hasVideo: boolean }
  registerEl: (identity: string, el: HTMLVideoElement | null) => void
}) {
  if (!peer) {
    return (
      <div className="relative flex h-full flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] text-white/40">
        <UserPlus className="size-5" />
        <span className="text-[11px] font-medium">Open call-in slot</span>
      </div>
    )
  }
  return (
    <div className="relative h-full flex-1 overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-inset ring-white/10">
      <video
        ref={(el) => registerEl(peer.identity, el)}
        autoPlay
        playsInline
        muted
        className={cn(
          "h-full w-full object-cover transition-opacity duration-300",
          peer.hasVideo ? "opacity-100" : "opacity-0",
        )}
      />
      {!peer.hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              "flex size-12 items-center justify-center rounded-full text-sm font-semibold text-white",
              getAvatarColor(peer.identity),
            )}
          >
            {getInitials(peer.name)}
          </span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
        <span className="truncate text-[11px] font-semibold text-white">{peer.name}</span>
      </div>
    </div>
  )
}

type Burst = { key: string; x: number; y: number }

/**
 * Immersive viewer for a live video broadcast. The host's camera fills the top
 * half; two call-in slots fill the next quarter (the accepted guests, including
 * this viewer once promoted), and the live chatroom fills the bottom quarter.
 * Viewers can request to join, react, share, and minimise or leave from the
 * back menu.
 */
export function LiveVideoViewer({
  stream,
  canWatch,
  currentUser = null,
  currentUserId = null,
  initialFollowing = false,
  onMinimize,
  onExit,
  onMeta,
}: {
  stream: LiveStreamView
  canWatch: boolean
  currentUser?: CurrentUser | null
  currentUserId?: string | null
  initialFollowing?: boolean
  onMinimize?: () => void
  onExit?: () => void
  onMeta?: (m: { title: string; cover: string | null; live: boolean; subtitle?: string }) => void
}) {
  const [creds, setCreds] = useState<{ token: string; serverUrl: string } | null>(null)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)
  const [hostEnded, setHostEnded] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [bursts, setBursts] = useState<Burst[]>([])
  const [requesting, setRequesting] = useState(false)

  const {
    localVideoRef,
    connected,
    canPublish,
    micOn,
    camOn,
    participants,
    peers,
    error: rtcError,
    audioBlocked,
    registerPeerVideoEl,
    toggleMic,
    toggleCam,
    flipCamera,
    startAudioPlayback,
    disconnect,
  } = useLiveVideo({
    token: creds?.token ?? null,
    serverUrl: creds?.serverUrl ?? null,
    isHost: false,
    hostId: stream.hostId,
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

  // Keep the mini-player meta in sync.
  useEffect(() => {
    onMeta?.({ title: stream.title, cover: stream.cover, live: true, subtitle: `${stream.hostName} · video` })
  }, [stream.title, stream.cover, stream.hostName, onMeta])

  // Poll for the host ending the broadcast + my own call-in status.
  const { data: callState, mutate: refreshCalls } = useSWR(
    canWatch ? ["video-call-state-viewer", stream.roomName] : null,
    () => getCallState({ roomName: stream.roomName }),
    { refreshInterval: 3000 },
  )
  const myStatus = callState?.myStatus ?? null
  const locked = callState?.locked ?? false

  useEffect(() => {
    if (callState?.ended) {
      setHostEnded(true)
      disconnect()
      setTimeout(() => onExit?.(), 2600)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState?.ended])

  async function requestJoin() {
    setRequesting(true)
    const res = await requestToJoin({ roomName: stream.roomName })
    setRequesting(false)
    if (!res.ok && res.error) setError(res.error)
    refreshCalls()
  }
  async function leaveStage() {
    if (!currentUserId) return
    await removeFromStage({ roomName: stream.roomName, userId: currentUserId }).catch(() => {})
    refreshCalls()
  }

  // Tap anywhere on the host video to send a heart with a quick burst.
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

  const hostPeer = peers.find((p) => p.isHost)
  const guestPeers = peers.filter((p) => !p.isHost)
  // Build the two call-in tiles: this viewer's own self-view (if promoted) plus
  // the other guests.
  const slots: ({ self: true } | { self: false; peer: (typeof guestPeers)[number] })[] = []
  if (canPublish) slots.push({ self: true })
  guestPeers.forEach((p) => slots.push({ self: false, peer: p }))
  const viewers = Math.max(0, participants - 1 - peers.length)
  const isSelf = currentUserId === stream.hostId
  const remoteVideoOn = Boolean(hostPeer?.hasVideo)

  if (hostEnded) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-neutral-950 px-6 text-center text-white">
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
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-neutral-950 text-white [isolation:isolate]">
      {/* ── Top half: host camera ─────────────────────────────────────────── */}
      <div className="relative flex-[2] min-h-0 overflow-hidden">
        <div className="absolute inset-0" onClick={handleTapHeart}>
          {hostPeer ? (
            <video
              ref={(el) => registerPeerVideoEl(hostPeer.identity, el)}
              autoPlay
              playsInline
              className={cn(
                "h-full w-full object-cover transition-opacity duration-500",
                remoteVideoOn ? "opacity-100" : "opacity-0",
              )}
            />
          ) : null}
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
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/55"
        />

        {/* Floating reactions + gifts */}
        <ReactionLayer roomName={connected ? stream.roomName : undefined} />

        {/* Top bar: back menu + host pill + live/viewers */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
          <div className="flex items-center gap-2">
            <BackExitMenu
              showMenu
              exitLabel="Leave"
              onExit={() => {
                disconnect()
                onExit?.()
              }}
              onMinimize={onMinimize ?? (() => {})}
            />
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
            onClick={() => void startAudioPlayback()}
            className="absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-white/15 px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/20 backdrop-blur-md"
          >
            <Volume2 className="size-4" /> Tap to enable sound
          </button>
        )}

        {/* Right action rail */}
        <div className="absolute bottom-3 right-3 z-20 flex flex-col items-center gap-3">
          {canPublish ? (
            // Promoted guest controls
            <>
              <button
                type="button"
                onClick={() => void flipCamera()}
                disabled={!camOn}
                aria-label="Flip camera"
                className="flex size-11 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-all hover:bg-black/50 active:scale-90 disabled:opacity-40"
              >
                <RefreshCw className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => void toggleMic()}
                aria-label={micOn ? "Mute" : "Unmute"}
                className={cn(
                  "flex size-11 items-center justify-center rounded-full ring-1 ring-inset backdrop-blur-md transition-all active:scale-90",
                  micOn ? "bg-black/35 text-white ring-white/15 hover:bg-black/50" : "bg-white/90 text-neutral-900 ring-white/40",
                )}
              >
                {micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
              </button>
              <button
                type="button"
                onClick={() => void toggleCam()}
                aria-label={camOn ? "Turn off camera" : "Turn on camera"}
                className={cn(
                  "flex size-11 items-center justify-center rounded-full ring-1 ring-inset backdrop-blur-md transition-all active:scale-90",
                  camOn ? "bg-black/35 text-white ring-white/15 hover:bg-black/50" : "bg-white/90 text-neutral-900 ring-white/40",
                )}
              >
                {camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
              </button>
              <button
                type="button"
                onClick={() => void leaveStage()}
                aria-label="Leave the stage"
                className="flex size-11 items-center justify-center rounded-full bg-destructive text-destructive-foreground ring-1 ring-inset ring-white/20 transition-all hover:opacity-90 active:scale-90"
              >
                <PhoneOff className="size-5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() =>
                  canWatch && void sendLiveReaction({ roomName: stream.roomName, emoji: "❤️", kind: "reaction" }).catch(() => {})
                }
                disabled={!canWatch || !connected}
                aria-label="Send a heart"
                className="flex size-11 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-all hover:bg-black/50 active:scale-90 disabled:opacity-40"
              >
                <Heart className="size-5 fill-live text-live" />
              </button>
              <ReactionPicker
                roomName={canWatch ? stream.roomName : undefined}
                disabled={!connected}
                className="size-11 bg-black/35 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md hover:bg-black/50"
              />
              {/* Request to join the call-in slots */}
              {canWatch && (
                <button
                  type="button"
                  onClick={requestJoin}
                  disabled={requesting || myStatus === "pending" || locked}
                  aria-label="Request to join"
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full ring-1 ring-inset backdrop-blur-md transition-all active:scale-90 disabled:opacity-60",
                    myStatus === "pending"
                      ? "bg-live/80 text-live-foreground ring-white/20"
                      : "bg-black/35 text-white ring-white/15 hover:bg-black/50",
                  )}
                >
                  {requesting ? <Loader2 className="size-5 animate-spin" /> : <Hand className="size-5" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                aria-label="Share this live"
                className="flex size-11 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-all hover:bg-black/50 active:scale-90"
              >
                <Share2 className="size-5" />
              </button>
            </>
          )}
        </div>

        {/* Self-view label for a promoted guest is shown in its slot below. */}
        {myStatus === "pending" && !canPublish && (
          <p className="absolute bottom-3 left-3 z-20 rounded-full bg-black/45 px-3 py-1.5 text-xs font-medium text-white/90 ring-1 ring-inset ring-white/10 backdrop-blur-md">
            Waiting for the host to let you in…
          </p>
        )}
      </div>

      {/* ── Quarter: two call-in slots ────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 gap-2 border-t border-white/10 bg-neutral-950 p-2">
        {[0, 1].map((i) => {
          const slot = slots[i]
          if (slot?.self) {
            return (
              <div
                key="self"
                className="relative h-full flex-1 overflow-hidden rounded-2xl bg-neutral-900 ring-2 ring-inset ring-live"
              >
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={cn(
                    "h-full w-full -scale-x-100 object-cover transition-opacity duration-300",
                    camOn ? "opacity-100" : "opacity-0",
                  )}
                />
                {!camOn && (
                  <div className="absolute inset-0 flex items-center justify-center text-white/50">
                    <VideoOff className="size-6" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                  <span className="text-[11px] font-semibold text-white">You</span>
                </div>
              </div>
            )
          }
          return <SlotTile key={i} peer={slot && !slot.self ? slot.peer : undefined} registerEl={registerPeerVideoEl} />
        })}
      </div>

      {/* ── Quarter: live chatroom ────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 border-t border-white/10 bg-neutral-950">
        {canWatch ? (
          <LiveChat currentUser={currentUser} roomName={stream.roomName} immersive />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-white/70">
            <p>
              <Link href="/sign-in" className="font-semibold text-white underline">
                Sign in
              </Link>{" "}
              to comment, react, and join the call-in.
            </p>
          </div>
        )}
      </div>

      {(rtcError || (error && !ended)) && (
        <p className="absolute bottom-2 left-1/2 z-40 -translate-x-1/2 rounded-full bg-destructive px-4 py-1.5 text-sm font-medium text-destructive-foreground shadow-lg">
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
