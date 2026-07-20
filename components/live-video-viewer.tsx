"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
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
import { useLiveVideo, type RemotePeer } from "@/lib/use-live-video"
import { useLivePresence } from "@/lib/use-live-presence"
import { ReactionLayer, ReactionPicker } from "@/components/live-reactions"
import { LiveChat } from "@/components/live-chat"
import { BackExitMenu } from "@/components/live-back-menu"
import { LiveAudienceSheet } from "@/components/live-audience-sheet"
import { ShareSheet } from "@/components/share-sheet"
import { ConversationVideo } from "@/components/conversation/conversation-video"
import { GridPrejoin } from "@/components/grid-prejoin"
import type { ShareTarget } from "@/lib/share-types"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { broadcastStageRects, stageRectStyle, type StageRect } from "@/lib/broadcast-stage"
import { ImageLightbox } from "@/components/image-lightbox"
import { PrayerOverlay, PrayerEndedToast } from "@/components/conversation/prayer-overlay"
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

/**
 * A remote stage participant (host or called-in guest) positioned on the
 * dynamic Broadcast stage via a percentage rect (view-only, no host controls).
 * Animates its rect as the stage reflows; the <video> is remount-safe because
 * `registerEl` reattaches the track on mount.
 */
function StagePeerView({
  peer,
  rect,
  primary,
  registerEl,
  muted = true,
}: {
  peer: { identity: string; name: string; image: string | null; hasVideo: boolean }
  rect: StageRect
  primary: boolean
  registerEl: (identity: string, el: HTMLVideoElement | null) => void
  muted?: boolean
}) {
  // Stable ref callback: an inline arrow would get a new identity each render,
  // making React re-run it (null → element) and re-attach the track — which
  // visibly restarts the video. Keyed on the (stable) identity + registrar.
  const videoRef = useCallback(
    (el: HTMLVideoElement | null) => registerEl(peer.identity, el),
    [registerEl, peer.identity],
  )
  return (
    <div
      style={stageRectStyle(rect)}
      className={cn(
        "z-10 overflow-hidden bg-neutral-900 transition-[top,left,width,height] duration-500 ease-out",
        primary ? "rounded-none" : "rounded-2xl ring-1 ring-inset ring-white/10",
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={cn(
          "h-full w-full object-cover transition-opacity duration-300",
          peer.hasVideo ? "opacity-100" : "opacity-0",
        )}
      />
      {!peer.hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              "flex items-center justify-center rounded-full font-semibold text-white",
              primary ? "size-20 text-2xl" : "size-11 text-sm",
              getAvatarColor(peer.identity),
            )}
          >
            {getInitials(peer.name)}
          </span>
        </div>
      )}
      {!primary && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
          <span className="block truncate text-[11px] font-semibold text-white">{peer.name}</span>
        </div>
      )}
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
  // Full-screen cover artwork viewer (opened from the Broadcast header).
  const [coverOpen, setCoverOpen] = useState(false)
  const [bursts, setBursts] = useState<Burst[]>([])
  const [requesting, setRequesting] = useState(false)

  // Grid ("landscape") video streams are Meet/Zoom-style meetings: this viewer
  // auto-publishes their own camera + mic and gets a tile.
  const isGridMeeting = stream.orientation === "landscape"
  // Prompt shown when the host asks this viewer to unmute in a grid meeting.
  const [askedToUnmute, setAskedToUnmute] = useState(false)
  // Grid meetings show a pre-join preview first. `entered` flips true once the
  // participant taps "Join meeting"; their device choices seed the hook.
  const [entered, setEntered] = useState(!isGridMeeting)
  const [prejoin, setPrejoin] = useState<{ micOn: boolean; camOn: boolean }>({ micOn: true, camOn: true })

  const {
    localVideoRef,
    registerLocalVideoEl,
    connected,
    canPublish,
    micOn,
    camOn,
    localVideoReady,
    localSpeaking,
    facingMode,
    participants,
    peers,
    error: rtcError,
    clearError: clearRtcError,
    audioBlocked,
    registerPeerVideoEl,
    toggleMic,
    toggleCam,
    flipCamera,
    askUnmute,
    startAudioPlayback,
    disconnect,
  } = useLiveVideo({
    token: creds?.token ?? null,
    serverUrl: creds?.serverUrl ?? null,
    isHost: false,
    hostId: stream.hostId,
    autoPublish: isGridMeeting,
    initialMicOn: prejoin.micOn,
    initialCamOn: prejoin.camOn,
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
    // Grid meetings hold off connecting until the participant finishes the
    // pre-join preview; plain broadcasts join immediately.
    if (!entered) return
    void join()
    return () => disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered])

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
  const viewers = Math.max(0, participants - 1 - peers.length)
  // Presence-backed audience (real names + avatars) for the "who's here" sheet.
  const { count: presenceCount, members: presenceMembers } = useLivePresence(stream.roomName, canWatch)
  const isSelf = currentUserId === stream.hostId
  const remoteVideoOn = Boolean(hostPeer?.hasVideo)

  // ── Broadcast dynamic stage (mirrors the host console) ────────────────────
  // The host can spotlight one called-in guest (or a promoted viewer): that
  // person takes the primary slot and everyone else reflows around them. The
  // spotlight id is stored server-side (gridPinnedIds, reused) so every client
  // renders the same arrangement.
  const spotlightId = (callState?.gridPinnedIds ?? [])[0] ?? null
  const spotlightPeer = spotlightId ? guestPeers.find((p) => p.identity === spotlightId) ?? null : null
  const spotlightIsSelf = !!spotlightId && spotlightId === currentUserId && canPublish
  const hasSpotlight = !!spotlightPeer || spotlightIsSelf

  // Ordered stage tiles: [primary, ...rest]. Primary is the spotlighted person
  // (guest or self), otherwise the host. The host always appears exactly once;
  // this viewer's own "self" tile appears only when promoted (canPublish).
  type VStageTile = { kind: "host" } | { kind: "self" } | { kind: "guest"; peer: RemotePeer }
  const stageTiles: VStageTile[] = []
  if (spotlightPeer) stageTiles.push({ kind: "guest", peer: spotlightPeer })
  else if (spotlightIsSelf) stageTiles.push({ kind: "self" })
  stageTiles.push({ kind: "host" })
  guestPeers
    .filter((p) => p.identity !== spotlightPeer?.identity)
    .forEach((p) => stageTiles.push({ kind: "guest", peer: p }))
  if (canPublish && !spotlightIsSelf) stageTiles.push({ kind: "self" })
  const stageRects = broadcastStageRects(stageTiles.length)
  const selfIndex = stageTiles.findIndex((t) => t.kind === "self")
  const selfRect = selfIndex >= 0 ? stageRects[selfIndex] : null
  const selfIsPrimary = selfIndex === 0
  // Whether the primary frame currently shows a live video (drives the
  // connecting/off overlays): the spotlighted guest, my own cam, or the host.
  const bigVideoOn = spotlightPeer ? spotlightPeer.hasVideo : spotlightIsSelf ? camOn : remoteVideoOn

  // ── Shared Prayer Mode ────────────────────────────────────────────────────
  // The Broadcast viewer mirrors the host's prayer state from the polled call
  // state (the Conversation grid viewer handles its own overlay). A short toast
  // flashes when prayer ends.
  const prayerStartedAt = callState?.prayerStartedAt ?? null
  const prayerActive = prayerStartedAt != null
  const [prayerEndedAt, setPrayerEndedAt] = useState<number | null>(null)
  const prevPrayerRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevPrayerRef.current && !prayerStartedAt) setPrayerEndedAt(Date.now())
    prevPrayerRef.current = prayerStartedAt
  }, [prayerStartedAt])

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

  // ── Grid meeting: pre-join preview ────────────────────────────────────────
  // Before entering, the participant picks camera/mic on/off (still adjustable
  // inside). Choices seed the RTC hook; only then do we connect.
  if (isGridMeeting && !entered) {
    return (
      <GridPrejoin
        title={stream.title}
        hostName={stream.hostName}
        selfName={currentUser?.name ?? "You"}
        joining={joining}
        onEnter={(choices) => {
          setPrejoin(choices)
          setEntered(true)
        }}
      />
    )
  }

  // ── Conversation video viewer ───────���────────────────────────────────────
  // The premium community gathering: this viewer gets their own tile and
  // publishes camera + mic on join. ConversationVideo owns the header, tiles,
  // paging, host controls, prayer, music ducking, chat and floating messages.
  if (isGridMeeting) {
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-neutral-950 text-white [isolation:isolate]">
        <ConversationVideo
          roomName={stream.roomName}
          self={{ identity: currentUserId ?? "self", name: currentUser?.name ?? "You", image: currentUser?.image ?? null }}
          peers={peers}
          currentUser={currentUser}
          hostId={callState?.hostId ?? stream.hostId}
          gridCohostId={callState?.gridCohostId ?? null}
          gridPinnedIds={callState?.gridPinnedIds ?? []}
          gridPinRequest={callState?.gridPinRequest ?? null}
          onRefreshState={() => void refreshCalls()}
          registerLocalVideoEl={registerLocalVideoEl}
          registerPeerVideoEl={registerPeerVideoEl}
          micOn={micOn}
          camOn={camOn}
          localVideoReady={localVideoReady}
          localSpeaking={localSpeaking}
          facingMode={facingMode}
          onToggleMic={() => void toggleMic()}
          onToggleCam={() => void toggleCam()}
          onFlipCamera={() => void flipCamera()}
          onAskUnmute={(id) => void askUnmute(id)}
          rtcError={rtcError}
          onClearError={clearRtcError}
          connected={connected}
          title={stream.title}
          cover={stream.cover ?? null}
          hostName={stream.hostName}
          category={stream.category}
          topic={stream.topic}
          backSlot={
            <BackExitMenu
              showMenu
              exitLabel="Leave"
              onExit={() => {
                disconnect()
                onExit?.()
              }}
              onMinimize={onMinimize ?? (() => {})}
            />
          }
          moreSlot={
            <LiveAudienceSheet
              count={presenceCount || participants}
              members={presenceMembers}
              immersive
              className="px-3 py-1.5 text-xs font-medium"
            />
          }
        />

        {/* Tap-to-enable-sound (autoplay unblock). */}
        {connected && audioBlocked && (
          <button
            type="button"
            onClick={() => void startAudioPlayback()}
            className="absolute left-1/2 top-24 z-[55] flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/15 px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/20 backdrop-blur-md"
          >
            <Volume2 className="size-4" /> Tap to enable sound
          </button>
        )}

        {/* Host asked this viewer to unmute — they must opt in. */}
        {askedToUnmute && !micOn && (
          <div className="absolute inset-x-3 top-24 z-[55] flex items-center justify-between gap-3 rounded-2xl border border-live/40 bg-live/15 px-3 py-2.5 shadow-lg backdrop-blur-md">
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
          <p className="absolute bottom-20 left-1/2 z-[55] -translate-x-1/2 rounded-full bg-destructive px-4 py-1.5 text-sm font-medium text-destructive-foreground shadow-lg">
            {rtcError ?? error}
          </p>
        )}

        <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-neutral-950 text-white [isolation:isolate]">
      {/* ── Broadcast stage — host + up to 3 guests above the chatroom. Tiles
          reflow smoothly through the 1/2/3/4-person layouts; a spotlighted guest
          (or a promoted viewer) takes the primary slot. ──────────────────── */}
      <div className="relative min-h-0 flex-[2.5] overflow-hidden">
        <div className="absolute inset-0" onClick={handleTapHeart}>
          {/* Cover ambiance while the primary video is off. */}
          {!bigVideoOn && stream.cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={stream.cover || "/placeholder.svg"}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 size-full scale-110 object-cover opacity-20 blur-2xl"
            />
          )}

          {/* Host + guest tiles — remote peers use remount-safe callback refs,
              so they can freely reflow as the stage layout changes. */}
          {stageTiles.map((t, i) => {
            if (t.kind === "host") {
              return hostPeer ? (
                <StagePeerView
                  key="host"
                  peer={{ identity: hostPeer.identity, name: stream.hostName, image: null, hasVideo: remoteVideoOn }}
                  rect={stageRects[i]}
                  primary={i === 0}
                  registerEl={registerPeerVideoEl}
                />
              ) : null
            }
            if (t.kind === "guest") {
              return (
                <StagePeerView
                  key={t.peer.identity}
                  peer={t.peer}
                  rect={stageRects[i]}
                  primary={i === 0}
                  registerEl={registerPeerVideoEl}
                />
              )
            }
            return null // self-view is the persistent element below
          })}

          {/* My own self-view — a persistent element (never remounted) so my
              camera track never detaches as the stage reflows. */}
          {canPublish && selfRect && (
            <div
              style={stageRectStyle(selfRect)}
              className={cn(
                "z-20 overflow-hidden bg-neutral-900 ring-2 ring-inset ring-live transition-[top,left,width,height] duration-500 ease-out",
                selfIsPrimary ? "rounded-none" : "rounded-2xl",
              )}
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
                  <VideoOff className={selfIsPrimary ? "size-8" : "size-6"} />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                <span className="text-[11px] font-semibold text-white">You</span>
              </div>
            </div>
          )}

          {/* Connecting / ended overlay — only before the host connects or after
              the stream ends (an off-camera host shows their avatar tile instead). */}
          {(ended || (!hostPeer && !hasSpotlight)) && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 text-white/70">
              {ended ? (
                <p className="relative text-sm font-medium">{error ?? "This stream has ended."}</p>
              ) : (
                <>
                  <Loader2 className="relative size-7 animate-spin" />
                  <p className="relative text-sm font-medium">Connecting to the live…</p>
                </>
              )}
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

        {/* Premium Broadcast header: back • cover • title/host • LIVE • viewers */}
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
            {/* Clickable cover artwork — opens the full-screen viewer. */}
            {stream.cover && (
              <button
                type="button"
                onClick={() => setCoverOpen(true)}
                aria-label="View cover artwork"
                className="shrink-0 overflow-hidden rounded-xl ring-1 ring-inset ring-white/20 transition-transform active:scale-95"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={stream.cover || "/placeholder.svg"} alt="Broadcast cover" className="size-9 object-cover" />
              </button>
            )}
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
                <span className="truncate text-sm font-semibold">{stream.title}</span>
                <span className="truncate text-[11px] text-white/60">
                  {stream.hostName} · @{stream.hostHandle}
                </span>
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

        {/* Action rail — anchored bottom-LEFT so it never collides with the
            call-in rail overlaid on the right. */}
        <div className="absolute bottom-3 left-3 z-20 flex flex-col items-center gap-3">
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

        {/* ── Call-in affordance ───────────────────────────────────────────────
            A floating tap-to-call-in control for signed-in viewers not yet on
            stage. Promoted guests appear as stage tiles above. */}
        {guestsEnabled && canWatch && !canPublish && (
          <div className="absolute bottom-3 right-3 z-30">
            {myStatus === "pending" ? (
              <div className="flex items-center gap-2 rounded-full border border-dashed border-live/50 bg-live/10 px-3.5 py-2 backdrop-blur-md">
                <Loader2 className="size-4 animate-spin text-white/80" />
                <span className="text-xs font-medium text-white/80">Waiting for the host…</span>
              </div>
            ) : guestPeers.length < 3 ? (
              <button
                type="button"
                onClick={requestJoin}
                disabled={requesting || locked}
                aria-label="Tap to call in"
                className="flex items-center gap-2 rounded-full border border-white/25 bg-black/40 px-3.5 py-2 text-white/80 backdrop-blur-md transition-colors hover:border-live/60 hover:bg-live/15 hover:text-white active:scale-95 disabled:opacity-60"
              >
                {requesting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                <span className="text-xs font-semibold">{locked ? "Call-ins paused" : "Call in"}</span>
              </button>
            ) : null}
          </div>
        )}

        {/* Shared Prayer Mode overlay + "ended" toast over the video stage. */}
        <PrayerOverlay active={prayerActive} endedAt={prayerEndedAt} />
        <PrayerEndedToast endedAt={prayerEndedAt} />
      </div>

      {/* ── Live chatroom. Call-in guests overlay the video above, so the chat
          keeps a constant share of the screen. ─────────────────────────────── */}
      <div className="min-h-0 flex-[1.5] border-t border-white/10 bg-neutral-950">
        {canWatch ? (
          <LiveChat currentUser={currentUser} roomName={stream.roomName} immersive showResourceButton />
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

      {coverOpen && stream.cover && (
        <ImageLightbox src={stream.cover} alt={`${stream.title} cover artwork`} onClose={() => setCoverOpen(false)} />
      )}
    </div>
  )
}
