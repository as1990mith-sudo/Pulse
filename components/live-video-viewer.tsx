"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import useSWR from "swr"
import {
  Ban,
  Check,
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
  Video,
  VideoOff,
  Volume2,
  X,
} from "lucide-react"
import type { CurrentUser } from "@/lib/session"
import type { LiveStreamView, CallRequestView } from "@/app/actions/live"
import {
  joinBroadcast,
  getCallState,
  sendLiveReaction,
  requestToJoin,
  removeFromStage,
  respondToCallRequest,
} from "@/app/actions/live"
import { toggleFollow } from "@/app/actions/follow"
import { useLiveVideo } from "@/lib/use-live-video"
import { useLivePresence } from "@/lib/use-live-presence"
import { ReactionLayer, ReactionPicker } from "@/components/live-reactions"
import { LiveChat } from "@/components/live-chat"
import { BackExitMenu } from "@/components/live-back-menu"
import { LiveAudienceSheet } from "@/components/live-audience-sheet"
import { ShareSheet } from "@/components/share-sheet"
import { MeetingGrid } from "@/components/meeting-grid"
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
          // object-cover so the guest feed fills the tile with no black bars.
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
  const [blocked, setBlocked] = useState(false)
  // A pending "come on stage" invite from the host (accept/decline in-session).
  const [myInvite, setMyInvite] = useState<CallRequestView | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [bursts, setBursts] = useState<Burst[]>([])
  const [requesting, setRequesting] = useState(false)

  // Grid ("landscape") video streams are Meet/Zoom-style meetings: this viewer
  // auto-publishes their own camera + mic and gets a tile.
  const isGridMeeting = stream.orientation === "landscape"
  // Prompt shown when the host asks this viewer to unmute in a grid meeting.
  const [askedToUnmute, setAskedToUnmute] = useState(false)

  const {
    localVideoRef,
    connected,
    canPublish,
    micOn,
    camOn,
    localVideoReady,
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
    autoPublish: isGridMeeting,
    onAskUnmute: () => setAskedToUnmute(true),
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
  // Host can hide the guest call-in section entirely; when off, viewers see no
  // call-in slots and the space is split between the host video and chat.
  const guestsEnabled = callState?.guestsEnabled ?? true

  useEffect(() => {
    if (callState?.ended) {
      setHostEnded(true)
      disconnect()
      setTimeout(() => onExit?.(), 2600)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState?.ended])

  // Host blocked this viewer: disconnect and show the removed splash.
  useEffect(() => {
    if (callState?.blocked) {
      setBlocked(true)
      disconnect()
      setTimeout(() => onExit?.(), 2600)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState?.blocked])

  // Surface a pending stage invite from the host.
  useEffect(() => {
    setMyInvite(callState?.myInvite ?? null)
  }, [callState?.myInvite])

  async function acceptInvite() {
    if (!myInvite) return
    await respondToCallRequest({ id: myInvite.id, accept: true }).catch(() => {})
    setMyInvite(null)
    refreshCalls()
    // Publish permission elevation arrives via LiveKit; the hook enables cam/mic.
  }
  async function declineInvite() {
    if (!myInvite) return
    await respondToCallRequest({ id: myInvite.id, accept: false }).catch(() => {})
    setMyInvite(null)
    refreshCalls()
  }

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
  // Presence-backed audience (real names + avatars) for the "who's here" sheet.
  const { count: presenceCount, members: presenceMembers } = useLivePresence(stream.roomName, canWatch)
  const isSelf = currentUserId === stream.hostId
  const remoteVideoOn = Boolean(hostPeer?.hasVideo)

  if (blocked) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-neutral-950 px-6 text-center text-white">
        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/25">
          <Ban className="size-6" />
        </span>
        <p className="text-lg font-semibold">Removed from live</p>
        <p className="text-sm text-white/60">The host has removed you from this live. Taking you back to Live…</p>
        <Loader2 className="size-4 animate-spin text-white/60" />
      </div>
    )
  }

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

  // ── Grid meeting viewer ───────────────────────────────────────────────────
  // Meet/Zoom-style tile grid: this viewer gets their own tile and publishes
  // camera + mic on join. Everyone in the room appears as a tile.
  if (isGridMeeting) {
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-neutral-950 text-white [isolation:isolate]">
        {/* Top bar: leave/minimise menu + LIVE + audience count. */}
        <div className="flex items-center justify-between gap-2 bg-neutral-900 px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
          <BackExitMenu
            showMenu
            exitLabel="Leave"
            onExit={() => {
              disconnect()
              onExit?.()
            }}
            onMinimize={onMinimize ?? (() => {})}
          />
          <div className="flex min-w-0 flex-1 flex-col px-1 leading-tight">
            <span className="truncate text-sm font-semibold">{stream.title}</span>
            <span className="truncate text-[11px] text-white/60">{stream.hostName} · meeting</span>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-live px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-live-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-live-foreground/70" />
              <span className="relative inline-flex size-2 rounded-full bg-live-foreground" />
            </span>
            Live
          </span>
          <LiveAudienceSheet
            count={presenceCount || participants}
            members={presenceMembers}
            immersive
            className="px-3 py-1.5 text-xs font-medium"
          />
        </div>

        {!connected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-white/70">
            <Loader2 className="size-7 animate-spin" />
            <p className="text-sm font-medium">{ended ? error ?? "This stream has ended." : "Joining the meeting…"}</p>
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <MeetingGrid
              roomName={stream.roomName}
              isHost={false}
              self={{ identity: currentUserId ?? "self", name: currentUser?.name ?? "You", image: currentUser?.image ?? null }}
              peers={peers}
              localVideoRef={localVideoRef}
              registerPeerVideoEl={registerPeerVideoEl}
              micOn={micOn}
              camOn={camOn}
              localVideoReady={localVideoReady}
              onToggleMic={() => void toggleMic()}
              onToggleCam={() => void toggleCam()}
              onFlipCamera={() => void flipCamera()}
              onAskUnmute={() => {}}
              onLeave={() => {
                disconnect()
                onExit?.()
              }}
            />
          </div>
        )}

        {/* Tap-to-enable-sound (autoplay unblock). */}
        {connected && audioBlocked && (
          <button
            type="button"
            onClick={() => void startAudioPlayback()}
            className="absolute left-1/2 top-20 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/15 px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/20 backdrop-blur-md"
          >
            <Volume2 className="size-4" /> Tap to enable sound
          </button>
        )}

        {/* Host asked this viewer to unmute — they must opt in. */}
        {askedToUnmute && !micOn && (
          <div className="absolute inset-x-3 top-20 z-50 flex items-center justify-between gap-3 rounded-2xl border border-live/40 bg-live/15 px-3 py-2.5 shadow-lg backdrop-blur-md">
            <p className="text-sm font-medium text-pretty text-white">The host asked you to unmute.</p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => {
                  setAskedToUnmute(false)
                  void toggleMic()
                }}
                className="flex items-center gap-1 rounded-full bg-live px-3 py-1.5 text-xs font-semibold text-live-foreground"
              >
                <Mic className="size-3.5" /> Unmute
              </button>
              <button
                onClick={() => setAskedToUnmute(false)}
                aria-label="Dismiss"
                className="flex size-7 items-center justify-center rounded-full bg-white/10 text-white/70 ring-1 ring-inset ring-white/15"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        )}

        {(rtcError || (error && !ended)) && (
          <p className="absolute bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-full bg-destructive px-4 py-1.5 text-sm font-medium text-destructive-foreground shadow-lg">
            {rtcError ?? error}
          </p>
        )}

        <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-neutral-950 text-white [isolation:isolate]">
      {/* ── Host camera (1.75/4 of the screen; grows to 2.125 when the host has
          turned off the guest call-in section) ───────────────────────────── */}
      <div className={cn("relative min-h-0 overflow-hidden", guestsEnabled ? "flex-[1.75]" : "flex-[2.125]")}>
        <div className="absolute inset-0" onClick={handleTapHeart}>
          {hostPeer ? (
            <video
              ref={(el) => registerPeerVideoEl(hostPeer.identity, el)}
              autoPlay
              playsInline
              className={cn(
                // object-cover so the portrait feed fills the frame with no
                // black bars on the sides.
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
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <BackExitMenu
              showMenu
              exitLabel="Leave"
              onExit={() => {
                disconnect()
                onExit?.()
              }}
              onMinimize={onMinimize ?? (() => {})}
            />
            <div className="flex min-w-0 items-center gap-2 rounded-full bg-black/35 py-1 pl-1 pr-1.5 ring-1 ring-inset ring-white/10 backdrop-blur-md">
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
                  getAvatarColor(stream.hostId),
                )}
                aria-hidden="true"
              >
                {getInitials(stream.hostName)}
              </span>
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-semibold">{stream.hostName}</span>
                <span className="truncate text-[11px] text-white/60">@{stream.hostHandle}</span>
              </div>
              {!isSelf && (
                <div className="shrink-0">
                  <InlineFollowButton
                    targetUserId={stream.hostId}
                    targetName={stream.hostName}
                    initialFollowing={initialFollowing}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="flex items-center gap-1.5 rounded-full bg-live px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-live-foreground shadow-lg">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-live-foreground/70" />
                <span className="relative inline-flex size-2 rounded-full bg-live-foreground" />
              </span>
              Live
            </span>
            <LiveAudienceSheet
              count={presenceCount || viewers}
              members={presenceMembers}
              immersive
              className="px-3 py-1.5 text-xs font-medium"
            />
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
              {/* Viewers join by tapping an open call-in slot below. */}
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

      </div>

      {/* ── Two call-in slots (0.75/4 of the screen) ───────────────────────── */}
      {/* Occupied slots fill left → right, so the left-most empty slot is the
          next one a viewer can claim by tapping it to request the call-in.
          Hidden entirely when the host turns off the guest section. */}
      {guestsEnabled && (
      <div className="flex flex-[0.75] min-h-0 gap-2 border-t border-white/10 bg-neutral-950 p-2">
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
          // object-cover fills the tile; -scale-x keeps the self-view mirrored.
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
          if (slot && !slot.self) {
            return <SlotTile key={i} peer={slot.peer} registerEl={registerPeerVideoEl} />
          }
          // Empty slot. Only the left-most empty slot is the active call-in
          // target; further slots stay passive until it's filled.
          const isNextOpen = i === slots.length
          if (canWatch && !canPublish && isNextOpen) {
            if (myStatus === "pending") {
              return (
                <div
                  key={i}
                  className="relative flex h-full flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-live/50 bg-live/10 text-live-foreground"
                >
                  <Loader2 className="size-5 animate-spin text-white/80" />
                  <span className="px-2 text-center text-[11px] font-medium text-white/80">
                    Waiting for the host…
                  </span>
                </div>
              )
            }
            return (
              <button
                key={i}
                type="button"
                onClick={requestJoin}
                disabled={requesting || locked}
                aria-label="Tap to call in"
                className="relative flex h-full flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/25 bg-white/[0.04] text-white/70 transition-colors hover:border-live/60 hover:bg-live/10 hover:text-white active:scale-[0.98] disabled:opacity-60"
              >
                {requesting ? <Loader2 className="size-5 animate-spin" /> : <UserPlus className="size-5" />}
                <span className="px-2 text-center text-[11px] font-semibold">
                  {locked ? "Call-ins paused" : "Tap to call in"}
                </span>
              </button>
            )
          }
          return <SlotTile key={i} registerEl={registerPeerVideoEl} />
        })}
      </div>
      )}

      {/* ── Live chatroom (1.5/4; grows to 1.875 when the guest section is off) ── */}
      <div
        className={cn(
          "min-h-0 border-t border-white/10 bg-neutral-950",
          guestsEnabled ? "flex-[1.5]" : "flex-[1.875]",
        )}
      >
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
