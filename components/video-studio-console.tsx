"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import {
  Check,
  ChevronDown,
  Globe,
  HandHeart,
  Loader2,
  Lock,
  Mic,
  MicOff,
  MonitorPlay,
  Music,
  Pin,
  PinOff,
  Radio,
  Smartphone,
  RefreshCw,
  Send,
  Settings,
  UserPlus,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react"
import type { CurrentUser } from "@/lib/session"
import {
  startBroadcast,
  endBroadcast,
  joinBroadcast,
  getCallState,
  respondToCallRequest,
  removeFromStage,
  setGuestsEnabled,
  setSpotlightGuest,
  setPrayerMode,
  heartbeatBroadcast,
  type LiveStreamView,
  type LiveOrientation,
  type LiveVisibility,
} from "@/app/actions/live"
import { LIVE_CATEGORIES } from "@/lib/live-categories"
import { useLiveVideo, isMedianApp, openNativeAppSettings, type RemotePeer } from "@/lib/use-live-video"
import { uploadMedia } from "@/lib/upload-media"
import { publishShow } from "@/app/actions/shows"
import { ReactionLayer } from "@/components/live-reactions"
import { LiveChat } from "@/components/live-chat"
import { MusicPanel, type Track } from "@/components/studio-console"
import { BackExitMenu } from "@/components/live-back-menu"
import { LiveAudienceSheet } from "@/components/live-audience-sheet"
import { useLivePresence } from "@/lib/use-live-presence"
import { ShareSheet } from "@/components/share-sheet"
import { ConversationVideo } from "@/components/conversation/conversation-video"
import { CoverUpload } from "@/components/admin/cover-upload"
import { ImageLightbox } from "@/components/image-lightbox"
import { PrayerOverlay, PrayerEndedToast } from "@/components/conversation/prayer-overlay"
import type { ShareTarget } from "@/lib/share-types"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { broadcastStageRects, stageRectStyle, type StageRect } from "@/lib/broadcast-stage"
import { cn } from "@/lib/utils"

function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m)
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`
}

/** Circular glass control button for the broadcaster dock. */
function GlassButton({
  label,
  onClick,
  disabled,
  active = true,
  tone = "glass",
  size = "md",
  children,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  tone?: "glass" | "danger" | "muted"
  size?: "md" | "lg"
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-center rounded-full ring-1 ring-inset transition-all active:scale-95 disabled:opacity-40",
        size === "lg" ? "size-14" : "size-12",
        tone === "danger"
          ? "bg-destructive text-destructive-foreground ring-white/20 hover:opacity-90"
          : tone === "muted"
            ? "bg-white/90 text-neutral-900 ring-white/40"
            : "bg-white/10 text-white ring-white/15 backdrop-blur-md hover:bg-white/20",
      )}
    >
      {children}
    </button>
  )
}

type PeerLike = { identity: string; name: string; image: string | null; hasVideo: boolean }

/**
 * A guest's camera tile on the dynamic Broadcast stage, absolutely positioned
 * via a percentage rect so it animates smoothly (CSS transition) as the layout
 * reflows between the 1/2/3/4-person arrangements. Includes host controls to
 * spotlight (pin) or remove the guest. `primary` styles the large primary slot.
 */
function StageGuestTile({
  peer,
  rect,
  primary,
  pinned,
  registerEl,
  onTogglePin,
  onRemove,
}: {
  peer: PeerLike
  rect: StageRect
  primary: boolean
  pinned: boolean
  registerEl: (identity: string, el: HTMLVideoElement | null) => void
  onTogglePin: (identity: string) => void
  onRemove: (identity: string) => void
}) {
  // Stable ref callback so React doesn't re-run it (null → element) every render
  // and re-attach the peer track, which would visibly restart the video.
  const videoRef = useCallback(
    (el: HTMLVideoElement | null) => registerEl(peer.identity, el),
    [registerEl, peer.identity],
  )
  return (
    <div
      style={stageRectStyle(rect)}
      className="z-20 overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-inset ring-white/10 transition-[top,left,width,height] duration-500 ease-out"
    >
      <video
        ref={videoRef}
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
              "flex items-center justify-center rounded-full font-semibold text-white",
              primary ? "size-20 text-2xl" : "size-11 text-sm",
              getAvatarColor(peer.identity),
            )}
          >
            {getInitials(peer.name)}
          </span>
        </div>
      )}
      {/* Host controls: pin/unpin (spotlight) + remove */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-1.5">
        <button
          type="button"
          onClick={() => onTogglePin(peer.identity)}
          aria-label={pinned ? `Unpin ${peer.name}` : `Spotlight ${peer.name}`}
          aria-pressed={pinned}
          className={cn(
            "flex size-7 items-center justify-center rounded-full backdrop-blur-md transition-colors",
            pinned ? "bg-primary text-primary-foreground" : "bg-black/50 text-white/90 hover:bg-black/70",
          )}
        >
          {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => onRemove(peer.identity)}
          aria-label={`Remove ${peer.name}`}
          className="flex size-7 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-md transition-colors hover:bg-destructive"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
        <span className="block truncate text-[11px] font-semibold text-white">{peer.name}</span>
      </div>
    </div>
  )
}

/** An open call-in slot placeholder on the Broadcast stage. */
function StageOpenSlot({ rect }: { rect: StageRect }) {
  return (
    <div
      style={stageRectStyle(rect)}
      className="z-10 flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-white/25 bg-black/30 text-white/55 backdrop-blur-sm transition-[top,left,width,height] duration-500 ease-out"
    >
      <UserPlus className="size-5" />
      <span className="px-1 text-center text-[10px] font-medium leading-tight">Open call-in slot</span>
    </div>
  )
}

/**
 * Immersive video broadcast studio. The host's camera fills the top half; two
 * call-in slots fill the next quarter (accepted guests' cameras), and the live
 * chatroom fills the bottom quarter. The host can flip to the back camera,
 * mix in uploaded background music, accept guest call-ins, and minimise or end
 * the session from the back menu.
 */
export function VideoStudioConsole({
  currentUser,
  resumeStream,
  onMinimize,
  onExit,
  onMeta,
}: {
  currentUser: CurrentUser
  resumeStream?: LiveStreamView | null
  onMinimize?: () => void
  onExit?: () => void
  onMeta?: (m: { title: string; cover: string | null; live: boolean; subtitle?: string; roomName?: string | null }) => void
}) {
  const [title, setTitle] = useState(resumeStream?.title ?? `${currentUser.name} — live`)
  // Host-chosen broadcast layout. "portrait" = the original full-bleed vertical
  // design; "landscape" = the Facebook-style 16:9 video + comment feed layout.
  const [orientation, setOrientation] = useState<LiveOrientation>(resumeStream?.orientation ?? "portrait")
  // Host-chosen discoverability: public (listed in Live) vs private (link-only).
  const [visibility, setVisibility] = useState<LiveVisibility>(resumeStream?.visibility ?? "public")
  // Optional topic category for the broadcast (empty = uncategorised).
  const [category, setCategory] = useState<string>(resumeStream?.category ?? "")
  // Both Broadcast (portrait) and Conversation (landscape) rooms carry a cover
  // artwork (the room's identity, shown in the header + opened in the lightbox).
  // Conversation additionally carries an optional discussion topic.
  const [cover, setCover] = useState<string | null>(resumeStream?.cover ?? null)
  const [roomTopic, setRoomTopic] = useState<string>(resumeStream?.topic ?? "")
  const [roomName, setRoomName] = useState<string | null>(resumeStream?.roomName ?? null)
  const [creds, setCreds] = useState<{ token: string; serverUrl: string } | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [shareOpen, setShareOpen] = useState(false)
  // Confirmation gate before a host ends the live session, so a mis-tap on the
  // back menu can't drop everyone out of the broadcast.
  const [endConfirmOpen, setEndConfirmOpen] = useState(false)
  // While the finished recording is being saved (uploaded + auto-published).
  const [saving, setSaving] = useState(false)
  const startedAtRef = useRef<number | null>(null)

  // Background music playlist — the exact same rich panel used in podcast studio
  // mode (MusicPanel): a queue with transport, scrubber, loop and volume.
  const [musicPanelOpen, setMusicPanelOpen] = useState(false)
  // Tap the camera surface to show/hide the bottom control dock (mic, camera,
  // music, etc.), so the host can preview a clean frame.
  const [controlsVisible, setControlsVisible] = useState(true)
  // Full-screen cover artwork viewer (opened from the Broadcast header).
  const [coverOpen, setCoverOpen] = useState(false)
  // Shared Prayer Mode: locally optimistic + reconciled with polled call state.
  const [prayerStartedAt, setPrayerStartedAt] = useState<string | null>(null)
  const [prayerEndedAt, setPrayerEndedAt] = useState<number | null>(null)
  const prevPrayerRef = useRef<string | null>(null)
  const [musicTracks, setMusicTracks] = useState<Track[]>([])
  const [musicActiveIndex, setMusicActiveIndex] = useState<number | null>(null)
  const [musicPlaying, setMusicPlayingState] = useState(false)
  const [musicVolume, setMusicVolumeState] = useState(0.4)
  const [musicMixing, setMusicMixing] = useState(false)
  const [musicLoop, setMusicLoopState] = useState(false)
  const [musicError, setMusicError] = useState<string | null>(null)

  const live = Boolean(roomName && creds)

  const {
    localVideoRef,
    registerLocalVideoEl,
    connected,
    micOn,
    camOn,
    localVideoReady,
    localSpeaking,
    facingMode,
    participants,
    peers,
    error: rtcError,
    clearError: clearRtcError,
    registerPeerVideoEl,
    toggleMic,
    askUnmute,
    toggleCam,
    flipCamera,
    publishMusic,
    setMusicVolume,
    duckMusic,
    setMusicPlaying,
    setMusicLoop,
    seekMusic,
    musicPosition,
    musicDuration,
    setMusicEndedHandler,
    stopMusic,
    stopRecording,
    disconnect,
  } = useLiveVideo({
    token: creds?.token ?? null,
    serverUrl: creds?.serverUrl ?? null,
    isHost: true,
    hostId: currentUser.id,
    // Grid ("landscape") streams are meetings — everyone publishes.
    autoPublish: orientation === "landscape",
  })

  // A live "Grid" stream renders the Meet/Zoom-style meeting grid instead of the
  // broadcast layout below.
  const isGridMeeting = orientation === "landscape"

  // Resume an existing live video the host owns (reopened after minimising).
  const resumedRef = useRef(false)
  useEffect(() => {
    if (!resumeStream || resumedRef.current) return
    resumedRef.current = true
    void (async () => {
      const res = await joinBroadcast({ roomName: resumeStream.roomName }).catch(() => null)
      if (!res || !res.ok) {
        setRoomName(null)
        setError("This live session has already ended.")
        return
      }
      const startedMs = new Date(resumeStream.startedAt).getTime()
      startedAtRef.current = startedMs
      setElapsed(Math.max(0, Math.floor((Date.now() - startedMs) / 1000)))
      setCreds({ token: res.token, serverUrl: res.serverUrl })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeStream])

  // Local-only camera preview before going live, so the host can frame the shot.
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const previewStreamRef = useRef<MediaStream | null>(null)
  useEffect(() => {
    if (live) return
    let cancelled = false
    async function startPreview() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        previewStreamRef.current = stream
        const el = previewVideoRef.current
        if (el) {
          el.srcObject = stream
          el.muted = true
          el.setAttribute("playsinline", "true")
          void el.play().catch(() => {})
        }
      } catch {
        setError("We need camera access to start a video live. Check your browser permissions.")
      }
    }
    void startPreview()
    return () => {
      cancelled = true
      previewStreamRef.current?.getTracks().forEach((t) => t.stop())
      previewStreamRef.current = null
    }
  }, [live])

  // Live duration clock.
  useEffect(() => {
    if (!connected) return
    if (startedAtRef.current == null) startedAtRef.current = Date.now()
    const iv = setInterval(() => {
      if (startedAtRef.current != null) setElapsed((Date.now() - startedAtRef.current) / 1000)
    }, 1000)
    return () => clearInterval(iv)
  }, [connected])

  // Heartbeat: while the video room exists, ping the server every 20s so the
  // stream's lastSeenAt stays fresh and the stale-stream sweep (60s) never
  // auto-ends a session the host didn't end himself. Because the video session
  // is mounted at the app level, this keeps running even while minimised — the
  // host can only lose the session by explicitly ending it. We intentionally do
  // NOT force-disconnect the host on a transient `ended` response; the heartbeat
  // re-marks the stream live, so the host is never silently signed out.
  useEffect(() => {
    if (!live || !roomName) return
    let cancelled = false
    const ping = () => {
      if (cancelled) return
      void heartbeatBroadcast({ roomName }).catch(() => null)
    }
    ping()
    const t = setInterval(ping, 20000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [live, roomName])

  // Keep the app-level mini-player's "now playing" info in sync.
  useEffect(() => {
    // Surface the Conversation cover art on the minimised continue-watching pill.
    onMeta?.({
      title,
      cover,
      live,
      subtitle: live ? "You're live · video" : "Setting up",
      roomName,
    })
  }, [title, live, onMeta, orientation, cover, roomName])

  // Host polls the call-in queue to surface pending guest requests + guests.
  const { data: callState, mutate: refreshCalls } = useSWR(
    live && roomName ? ["video-call-state", roomName] : null,
    () => getCallState({ roomName: roomName! }),
    { refreshInterval: 2500 },
  )
  const pending = callState?.pendingRequests ?? []

  // Guest call-in section toggle (host-controlled). Kept in local state for
  // instant UI feedback and reconciled with the polled server value.
  const [guestsEnabled, setGuestsEnabledState] = useState(true)
  useEffect(() => {
    if (callState?.guestsEnabled !== undefined) setGuestsEnabledState(callState.guestsEnabled)
  }, [callState?.guestsEnabled])
  async function toggleGuests() {
    if (!roomName) return
    const next = !guestsEnabled
    setGuestsEnabledState(next)
    try {
      await setGuestsEnabled({ roomName, enabled: next })
      refreshCalls()
    } catch {
      setGuestsEnabledState(!next)
    }
  }

  // ── Shared Prayer Mode ──────────────────────────────────────────────────
  // Reconcile prayer state from the polled call state; flash a toast when it
  // turns off. The host toggles it; everyone in the room sees the overlay.
  useEffect(() => {
    if (callState?.prayerStartedAt === undefined) return
    const next = callState.prayerStartedAt
    if (prevPrayerRef.current && !next) setPrayerEndedAt(Date.now())
    prevPrayerRef.current = next
    setPrayerStartedAt(next)
  }, [callState?.prayerStartedAt])
  const prayerActive = prayerStartedAt != null
  async function togglePrayer() {
    if (!roomName) return
    const next = !prayerActive
    setPrayerStartedAt(next ? new Date().toISOString() : null)
    if (!next) setPrayerEndedAt(Date.now())
    try {
      await setPrayerMode({ roomName, on: next })
      refreshCalls()
    } catch {
      setPrayerStartedAt(next ? null : new Date().toISOString())
    }
  }

  // Duck the background music under the host's own speech — but never during
  // Prayer Mode, so worship/instrumental music keeps playing naturally.
  useEffect(() => {
    if (musicActiveIndex === null || !musicPlaying) return
    duckMusic(prayerActive ? false : localSpeaking)
  }, [localSpeaking, musicActiveIndex, musicPlaying, prayerActive, duckMusic])

  async function goLive() {
    setError(null)
    // A category is mandatory — the host must pick one before going live.
    if (!category) {
      setError("Please choose a category before going live.")
      return
    }
    setStarting(true)
    try {
      const res = await startBroadcast({
        title: title.trim() || `${currentUser.name} — live`,
        mode: "video",
        orientation,
        visibility,
        category,
        // Cover applies to both Broadcast and Conversation; the discussion topic
        // is Conversation-only.
        cover,
        topic: orientation === "landscape" ? roomTopic.trim() || null : null,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      previewStreamRef.current?.getTracks().forEach((t) => t.stop())
      previewStreamRef.current = null
      setRoomName(res.roomName)
      setCreds({ token: res.token, serverUrl: res.serverUrl })
      startedAtRef.current = null
      setElapsed(0)
    } catch {
      setError("Something went wrong starting your live. Please try again.")
    } finally {
      setStarting(false)
    }
  }

  async function endLive() {
    // Grab the session recording before we tear the room down, then upload it to
    // Blob and auto-publish it as a "live" video episode (files under the
    // catalogue's Live → Video tab). Failures fall through to a clean exit so a
    // host is never trapped on the studio screen.
    setSaving(true)
    const durationStr = formatElapsed(elapsed)
    let videoUrl: string | null = null
    try {
      const blob = await stopRecording()
      if (blob && blob.size > 0) {
        const ext = blob.type.includes("mp4") ? "mp4" : "webm"
        const file = new File([blob], `live-session.${ext}`, { type: blob.type })
        const data = await uploadMedia(file, "episodes")
        videoUrl = data.url
      }
    } catch {
      /* keep going — end the broadcast even if the recording couldn't be saved */
    }

    if (roomName) await endBroadcast({ roomName }).catch(() => {})

    if (videoUrl) {
      await publishShow({
        title,
        tagline: "",
        category,
        duration: durationStr,
        description: "",
        cover: null,
        videoUrl,
        source: "live",
      }).catch(() => {})
    }

    disconnect()
    setSaving(false)
    onExit?.()
  }

  async function acceptCall(id: number) {
    const res = await respondToCallRequest({ id, accept: true })
    if (!res.ok && res.error) setError(res.error)
    refreshCalls()
  }
  async function declineCall(id: number) {
    await respondToCallRequest({ id, accept: false })
    refreshCalls()
  }
  async function dropGuest(identity: string) {
    if (!roomName) return
    await removeFromStage({ roomName, userId: identity })
    refreshCalls()
  }
  async function toggleSpotlight(identity: string) {
    if (!roomName) return
    // Toggle: tapping the already-spotlighted guest clears it.
    const next = spotlightGuestId === identity ? null : identity
    await setSpotlightGuest({ roomName, userId: next })
    refreshCalls()
  }

  // ── Music controls ──────────────────────────────────────────────────────
  // Load (publish) a playlist track and start it playing on its own timeline.
  async function playTrack(index: number) {
    const track = musicTracks[index]
    if (!track) return
    setMusicError(null)
    setMusicMixing(true)
    try {
      await publishMusic(track.url)
      setMusicVolume(musicVolume)
      setMusicActiveIndex(index)
      setMusicPlayingState(true)
    } catch {
      setMusicError("Could not play that track. Try a different audio file.")
    } finally {
      setMusicMixing(false)
    }
  }
  function toggleMusicPlay() {
    if (musicActiveIndex === null) return
    const next = !musicPlaying
    setMusicPlaying(next)
    setMusicPlayingState(next)
  }
  function toggleMusicLoop() {
    const next = !musicLoop
    setMusicLoopState(next)
    setMusicLoop(next)
  }
  function nextTrack() {
    if (musicTracks.length < 2 || musicActiveIndex === null) return
    void playTrack((musicActiveIndex + 1) % musicTracks.length)
  }
  function prevTrack() {
    if (musicTracks.length < 2 || musicActiveIndex === null) return
    void playTrack((musicActiveIndex - 1 + musicTracks.length) % musicTracks.length)
  }
  function changeMusicVolume(value: number) {
    setMusicVolumeState(value)
    setMusicVolume(value)
  }
  async function removeTrack(index: number) {
    const isActive = index === musicActiveIndex
    if (isActive) {
      await stopMusic()
      setMusicPlayingState(false)
      setMusicActiveIndex(null)
    } else if (musicActiveIndex !== null && index < musicActiveIndex) {
      setMusicActiveIndex(musicActiveIndex - 1)
    }
    setMusicTracks((prev) => prev.filter((_, i) => i !== index))
  }

  // Auto-advance to the next track when the current one ends (when 2 are loaded).
  useEffect(() => {
    setMusicEndedHandler(() => {
      if (musicTracks.length >= 2 && musicActiveIndex !== null) {
        void playTrack((musicActiveIndex + 1) % musicTracks.length)
      } else {
        setMusicPlayingState(false)
      }
    })
    return () => setMusicEndedHandler(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicTracks, musicActiveIndex])

  const viewers = Math.max(0, participants - 1 - peers.length)
  // Presence-backed audience (real names + avatars) for the "who's here" sheet.
  const { count: audienceCount, members: audienceMembers } = useLivePresence(roomName, live)
  // Guests are remote publishers (the host publishes locally, not remotely).
  // Broadcast caps the stage at 3 guests (host + 3 = 4 tiles total).
  const guests = peers.slice(0, 3)

  // ── Broadcast spotlight (portrait) ────────────────────────────────────────
  // The host can spotlight ONE called-in guest: that guest moves into the
  // primary slot and the host drops into a secondary slot. Spotlight is stored
  // server-side (gridPinnedId, reused) so viewers see the same swap.
  const spotlightGuestId = (callState?.gridPinnedIds ?? [])[0] ?? null
  const spotlightGuest = spotlightGuestId
    ? guests.find((g) => g.identity === spotlightGuestId) ?? null
    : null

  // Ordered stage tiles. The primary slot (index 0) holds the spotlighted guest
  // if any, otherwise the host. The host always appears exactly once. The stage
  // reflows through the shared 1/2/3/4-person layouts as guests come and go.
  type StageTile = { kind: "host" } | { kind: "guest"; peer: RemotePeer }
  const stageTiles: StageTile[] = spotlightGuest
    ? [
        { kind: "guest", peer: spotlightGuest },
        { kind: "host" },
        ...guests
          .filter((g) => g.identity !== spotlightGuest.identity)
          .map((peer) => ({ kind: "guest" as const, peer })),
      ]
    : [{ kind: "host" }, ...guests.map((peer) => ({ kind: "guest" as const, peer }))]
  const stageRects = broadcastStageRects(stageTiles.length)
  const hostIndex = stageTiles.findIndex((t) => t.kind === "host")
  const hostRect = stageRects[hostIndex] ?? stageRects[0]
  const hostBig = hostIndex === 0
  // Guest tiles paired with their resolved rect.
  const guestTiles = stageTiles
    .map((t, i) => ({ tile: t, rect: stageRects[i] }))
    .filter((x): x is { tile: { kind: "guest"; peer: RemotePeer }; rect: StageRect } => x.tile.kind === "guest")
  // With 3+ people on a portrait Broadcast, give the stage more vertical room
  // (and shrink the chat a touch) so the top host tile reads taller/portrait.
  const tallStage = live && orientation !== "landscape" && stageTiles.length >= 3

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-neutral-950 text-white [isolation:isolate]">
      {/* Conversation (live): the premium community video gathering overlays the
          broadcast layout. Kept as an overlay (not an early return) so the shared
          music "Add track" panel and end-confirm dialog below still render. The
          hidden self-view <video> underneath stays mounted; ConversationVideo
          renders its own tile <video> via localVideoRef. */}
      {live && isGridMeeting && (
        <div className="absolute inset-0 z-40 bg-neutral-950">
          <ConversationVideo
            roomName={roomName as string}
            self={{ identity: currentUser.id, name: currentUser.name, image: currentUser.image ?? null }}
            peers={peers}
            currentUser={currentUser}
            hostId={callState?.hostId ?? currentUser.id}
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
            onOpenMusic={() => setMusicPanelOpen(true)}
            title={title}
            cover={cover}
            hostName={currentUser.name}
            category={category}
            topic={roomTopic || null}
            backSlot={
              <BackExitMenu
                showMenu
                exitLabel="End"
                onExit={() => setEndConfirmOpen(true)}
                onMinimize={onMinimize ?? (() => {})}
              />
            }
            moreSlot={
              <LiveAudienceSheet
                count={audienceCount || viewers}
                members={audienceMembers}
                immersive
                className="px-3 py-1.5 text-xs font-medium"
                isHost
                roomName={roomName ?? undefined}
                blockedUsers={callState?.blockedUsers ?? []}
                onChanged={() => void refreshCalls()}
              />
            }
          />
        </div>
      )}
      {/* ── Host camera — the full stage above the chatroom. In a focused
          (portrait) broadcast, called-in guests overlay on the right and a
          spotlighted guest swaps into this big frame. ─────────────────────── */}
      <div
        className={cn(
          "relative min-h-0 overflow-hidden transition-[flex-grow] duration-500 ease-out",
          orientation === "landscape" ? "flex-[1.75]" : tallStage ? "flex-[3.3]" : "flex-[2.5]",
        )}
      >
        {/* Persistent host camera — the live publisher feed (mirrored self-view).
            In a live Conversation the ConversationVideo overlay owns localVideoRef,
            so we skip this element. This single <video> is NEVER remounted; only
            its rect (inline style) changes as the stage reflows between the
            1/2/3/4-person layouts, so the local camera track stays attached. A
            spotlighted guest simply pushes the host into a secondary slot. */}
        {!(live && isGridMeeting) && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={live && orientation !== "landscape" ? stageRectStyle(hostRect) : undefined}
            className={cn(
              "-scale-x-100 transition-[top,left,width,height,opacity] duration-500 ease-out",
              orientation === "landscape"
                ? // Landscape letterboxes the feed so nothing is cropped.
                  "absolute inset-0 z-0 h-full w-full object-contain"
                : live
                  ? // Portrait Broadcast: positioned via hostRect; rounded when sharing the stage.
                    cn("z-20 object-cover", stageTiles.length > 1 && "rounded-2xl ring-1 ring-inset ring-white/10")
                  : // Pre-live: full-bleed (the preview element also renders below).
                    "absolute inset-0 z-0 h-full w-full object-cover",
              live && camOn && localVideoReady ? "opacity-100" : "opacity-0",
            )}
          />
        )}
        {/* Pre-live preview camera */}
        {!live && (
          <video
            ref={previewVideoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "absolute inset-0 z-0 h-full w-full",
              orientation === "landscape" ? "-scale-x-100 object-contain" : "-scale-x-100 object-cover",
            )}
          />
        )}

        {/* Tap-capture layer: sits above the camera feed but below the chrome
            (top bar, request panels at z-20; dock at z-40) so tapping the bare
            video toggles the control dock without blocking those controls. */}
        {live && (
          <div
            className="absolute inset-0 z-10"
            onClick={() => setControlsVisible((v) => !v)}
            aria-hidden="true"
          />
        )}

        {/* Host secondary-slot overlay — shown when a spotlighted guest has
            pushed the host out of the primary slot: a name tag plus (when the
            camera is off) an avatar, positioned on the host's rect. */}
        {live && orientation !== "landscape" && !hostBig && (
          <div
            style={stageRectStyle(hostRect)}
            className="pointer-events-none z-30 overflow-hidden rounded-2xl transition-[top,left,width,height] duration-500 ease-out"
          >
            {!camOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                <span
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full text-sm font-semibold text-white",
                    getAvatarColor(currentUser.id),
                  )}
                >
                  {getInitials(currentUser.name)}
                </span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
              <span className="block truncate text-[11px] font-semibold text-white">You</span>
            </div>
          </div>
        )}

        {/* Camera-off / connecting wash — over the host's slot (the primary frame
            when the host holds it; a spotlighted guest owns that frame otherwise). */}
        {live && hostBig && (!camOn || !connected || !localVideoReady) && (
          <div
            style={orientation !== "landscape" ? stageRectStyle(hostRect) : undefined}
            className={cn(
              "z-30 flex items-center justify-center bg-neutral-950 px-4 text-center transition-[top,left,width,height] duration-500 ease-out",
              orientation === "landscape" ? "absolute inset-0" : "overflow-hidden rounded-2xl",
            )}
          >
            {!connected ? (
              rtcError ? (
                <div className="flex max-w-sm flex-col items-center gap-3 text-center text-white/80">
                  <VideoOff className="size-8 text-destructive" />
                  <p className="text-sm font-medium text-pretty">{rtcError}</p>
                  <button
                    type="button"
                    onClick={endLive}
                    className="mt-1 rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/20"
                  >
                    Go back
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-white/70">
                  <Loader2 className="size-7 animate-spin" />
                  <p className="text-sm font-medium">Going live…</p>
                </div>
              )
            ) : !camOn ? (
              <div className="flex flex-col items-center gap-2 text-white/60">
                <VideoOff className="size-8" />
                <p className="text-sm font-medium">Camera off</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-white/70">
                <Loader2 className="size-7 animate-spin" />
                <p className="text-sm font-medium">Starting camera…</p>
              </div>
            )}
          </div>
        )}

        {/* Legibility scrims */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/55"
        />

        {/* Floating reactions + gifts */}
        {live && <ReactionLayer roomName={connected ? roomName! : undefined} />}

        {/* ── Broadcast stage guests ───────────────────────────────────────────
            Each called-in guest occupies a slot in the dynamic layout. Tiles
            animate their rect as guests join/leave. The host can spotlight (pin)
            a guest — moving them into the primary slot — or remove them. */}
        {live &&
          orientation !== "landscape" &&
          guestTiles.map(({ tile, rect }) => (
            <StageGuestTile
              key={tile.peer.identity}
              peer={tile.peer}
              rect={rect}
              primary={!!spotlightGuest && tile.peer.identity === spotlightGuest.identity}
              pinned={spotlightGuestId === tile.peer.identity}
              registerEl={registerPeerVideoEl}
              onTogglePin={(id) => void toggleSpotlight(id)}
              onRemove={(id) => void dropGuest(id)}
            />
          ))}

        {/* Premium Broadcast header — back • cover • title/host • LIVE • viewers
            • timer • more. Collapses (fades/slides up) while the host interacts
            with the live so the stage gets maximum space. */}
        <div
          className={cn(
            "absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-4 pt-[calc(env(safe-area-inset-top)+1rem)] transition-all duration-300",
            live && !controlsVisible ? "pointer-events-none -translate-y-2 opacity-0" : "translate-y-0 opacity-100",
          )}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <BackExitMenu
              showMenu={live}
              exitLabel="End"
              onExit={live ? () => setEndConfirmOpen(true) : (onExit ?? (() => {}))}
              onMinimize={onMinimize ?? (() => {})}
            />
            {/* Clickable cover artwork — opens the full-screen viewer. */}
            {live && orientation !== "landscape" && cover && (
              <button
                type="button"
                onClick={() => setCoverOpen(true)}
                aria-label="View cover artwork"
                className="shrink-0 overflow-hidden rounded-xl ring-1 ring-inset ring-white/20 transition-transform active:scale-95"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover || "/placeholder.svg"} alt="Broadcast cover" className="size-10 object-cover" />
              </button>
            )}
            {/* Room title + host name. */}
            {live && orientation !== "landscape" && (
              <div className="flex min-w-0 max-w-[11rem] flex-col justify-center rounded-2xl bg-black/35 px-3 py-1 ring-1 ring-inset ring-white/10 backdrop-blur-md">
                <span className="truncate text-sm font-semibold leading-tight text-white">{title}</span>
                <span className="truncate text-[11px] leading-tight text-white/60">{currentUser.name}</span>
              </div>
            )}
            {live ? (
              <span className="flex items-center gap-1.5 rounded-full bg-live px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-live-foreground shadow-lg">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-live-foreground/70" />
                  <span className="relative inline-flex size-2 rounded-full bg-live-foreground" />
                </span>
                Live
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 ring-1 ring-inset ring-white/15 backdrop-blur-md">
                <Video className="size-3.5" /> Video studio
              </span>
            )}
            {live && (
              <LiveAudienceSheet
                count={audienceCount || viewers}
                members={audienceMembers}
                immersive
                className="px-3 py-1.5 text-xs font-medium"
                isHost
                roomName={roomName ?? undefined}
                blockedUsers={callState?.blockedUsers ?? []}
                onChanged={() => void refreshCalls()}
              />
            )}
            {live && (
              <span className="rounded-full bg-black/35 px-3 py-1.5 font-mono text-xs tabular-nums text-white/90 ring-1 ring-inset ring-white/10 backdrop-blur-md">
                {formatElapsed(elapsed)}
              </span>
            )}
          </div>

          {/* Share the live (host) */}
          {live && roomName && (
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              aria-label="Share this live"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-inset ring-white/15 backdrop-blur-md transition-colors hover:bg-black/50 active:scale-90"
            >
              <Send className="size-5" />
            </button>
          )}
        </div>

        {/* Pending call-in requests (host) — not offered in landscape lives. */}
        {live && orientation !== "landscape" && pending.length > 0 && (
          <div className="absolute left-4 right-4 top-[calc(env(safe-area-inset-top)+4rem)] z-20 flex flex-col gap-2">
            {pending.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 rounded-2xl bg-black/55 p-2 ring-1 ring-inset ring-white/10 backdrop-blur-md"
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white",
                    r.color,
                  )}
                >
                  {r.initials}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  <span className="font-semibold">{r.userName}</span> wants to join
                </span>
                <button
                  type="button"
                  onClick={() => void acceptCall(r.id)}
                  aria-label={`Accept ${r.userName}`}
                  className="flex size-8 items-center justify-center rounded-full bg-live text-live-foreground transition-opacity hover:opacity-90"
                >
                  <Check className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void declineCall(r.id)}
                  aria-label={`Decline ${r.userName}`}
                  className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/20"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pre-live setup card — a fixed, scrollable overlay (like the music
            panel) so it's centered in the full viewport and never clipped by the
            camera region's overflow-hidden. When the card is taller than the
            screen it scrolls, with safe-area padding so the top (stream title)
            stays clear of the status bar. */}
        {!live && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm">
            <div className="flex min-h-full items-center justify-center px-5 py-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
              <div className="w-full max-w-md space-y-4 rounded-3xl bg-black/50 p-5 ring-1 ring-inset ring-white/10 backdrop-blur-2xl">
              {/* Header: title + close, so the host can dismiss setup before going live. */}
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Set up your live</h2>
                <button
                  type="button"
                  onClick={() => onExit?.()}
                  aria-label="Close"
                  className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white/80 ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/20 active:scale-90"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="live-title" className="text-xs font-semibold uppercase tracking-wider text-white/60">
                  Stream title
                </label>
                <input
                  id="live-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  placeholder="What's your live about?"
                  className="w-full rounded-2xl bg-white/10 px-4 py-3 text-base font-medium text-white ring-1 ring-inset ring-white/15 placeholder:text-white/40 focus:outline-none focus:ring-primary"
                />
              </div>

              {/* Layout chooser: portrait (original full-bleed) vs landscape
                  (Facebook-style 16:9 video + comment feed below). */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Layout</span>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
              { value: "portrait", label: "Broadcast", hint: "Stage, teaching & preaching", icon: Radio },
              { value: "landscape", label: "Conversation", hint: "A community gathering", icon: MonitorPlay },
                    ] as const
                  ).map((opt) => {
                    const active = orientation === opt.value
                    const Icon = opt.icon
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setOrientation(opt.value)}
                        aria-pressed={active}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-2xl px-3 py-3 text-center ring-1 ring-inset transition-colors",
                          active
                            ? "bg-primary/20 text-white ring-primary"
                            : "bg-white/5 text-white/70 ring-white/15 hover:bg-white/10",
                        )}
                      >
                        <Icon className="size-5" />
                        <span className="text-sm font-semibold leading-none">{opt.label}</span>
                        <span className="text-[11px] leading-none text-white/50">{opt.hint}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Cover artwork — both Broadcast and Conversation carry a cover
                  (the room's identity, shown in the header + opened in the
                  full-screen lightbox when tapped). */}
              <CoverUpload
                value={cover}
                onChange={setCover}
                label={orientation === "landscape" ? "Room cover" : "Broadcast cover"}
              />

              {/* Discussion topic — Conversation rooms only. */}
              {orientation === "landscape" && (
                <div className="space-y-1.5">
                  <label htmlFor="live-topic" className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    Today&apos;s Discussion <span className="font-medium normal-case tracking-normal text-white/40">(optional)</span>
                  </label>
                  <input
                    id="live-topic"
                    value={roomTopic}
                    onChange={(e) => setRoomTopic(e.target.value)}
                    maxLength={80}
                    placeholder="What are we gathering around?"
                    className="w-full rounded-2xl bg-white/10 px-4 py-3 text-base font-medium text-white ring-1 ring-inset ring-white/15 placeholder:text-white/40 focus:outline-none focus:ring-primary"
                  />
                </div>
              )}

              {/* Category — required. The host must tag their live with one of
                  the known categories; there is no "Uncategorised" option. */}
              <div className="space-y-1.5">
                <label htmlFor="live-category" className="text-xs font-semibold uppercase tracking-wider text-white/60">
                  Category <span className="text-primary">*</span>
                </label>
                <div className="relative">
                  <select
                    id="live-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full appearance-none rounded-2xl bg-white/10 px-4 py-3 pr-10 text-base font-medium text-white ring-1 ring-inset ring-white/15 focus:outline-none focus:ring-primary [&>option]:bg-neutral-900 [&>option]:text-white"
                  >
                    <option value="" disabled>
                      Choose a category…
                    </option>
                    {LIVE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-white/50" />
                </div>
              </div>

              {/* Privacy — public (discoverable in Live) vs private (link-only). */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Privacy</span>
                <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-white/[0.06] p-1">
                  {(
                    [
                      { value: "public", label: "Public", icon: Globe },
                      { value: "private", label: "Private", icon: Lock },
                    ] as const
                  ).map((opt) => {
                    const active = visibility === opt.value
                    const Icon = opt.icon
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setVisibility(opt.value)}
                        aria-pressed={active}
                        className={cn(
                          "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                          active ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white",
                        )}
                      >
                        <Icon className="size-4" /> {opt.label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11px] text-white/50">
                  {visibility === "public"
                    ? "Listed in Live for everyone to discover and join."
                    : "Unlisted — only people with the link can join."}
                </p>
              </div>

              {error && <p className="text-sm font-medium text-destructive">{error}</p>}
              <button
                type="button"
                onClick={goLive}
                disabled={starting || !category}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-live px-6 py-3.5 text-base font-semibold text-live-foreground transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
              >
                {starting ? <Loader2 className="size-5 animate-spin" /> : <Radio className="size-5" />}
                {starting ? "Starting…" : "Go live"}
              </button>
              <p className="text-center text-xs text-white/50">
                {orientation === "landscape"
                  ? "Everyone who joins gets a video tile — like a Meet or Zoom meeting."
                  : "Viewers can comment, react, send gifts, and request to join your call-in slots."}
              </p>
              </div>
            </div>
          </div>
        )}

        {/* Control dock — overlaid at the bottom of the camera region. Sits
            above the camera-off / connecting wash (z-30) so the camera and mic
            controls stay tappable even when the camera is turned off. Live
            Conversations hide this dock entirely: ConversationVideo renders its
            own bottom dock, and this one would otherwise float in the middle of
            the screen (the camera region is only the top portion in grid mode). */}
        {live && !isGridMeeting && (
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 z-40 flex items-center justify-center gap-3 p-3 transition-opacity duration-300",
              controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <GlassButton label="Flip camera" onClick={() => void flipCamera()} disabled={!connected || !camOn}>
              <RefreshCw className="size-5" />
            </GlassButton>
            <GlassButton
              label={micOn ? "Mute microphone" : "Unmute microphone"}
              onClick={() => void toggleMic()}
              disabled={!connected}
              tone={micOn ? "glass" : "muted"}
              active={micOn}
            >
              {micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
            </GlassButton>
            <GlassButton
              label={camOn ? "Turn off camera" : "Turn on camera"}
              onClick={() => void toggleCam()}
              disabled={!connected}
              tone={camOn ? "glass" : "muted"}
              active={camOn}
            >
              {camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
            </GlassButton>
            <GlassButton
              label={guestsEnabled ? "Turn off call-ins" : "Turn on call-ins"}
              onClick={() => void toggleGuests()}
              active={guestsEnabled}
              tone={guestsEnabled ? "glass" : "muted"}
            >
              <Users className="size-5" />
            </GlassButton>
            <GlassButton
              label="Background music"
              onClick={() => setMusicPanelOpen((o) => !o)}
              active={musicTracks.length > 0}
              tone={musicTracks.length > 0 ? "muted" : "glass"}
            >
              <Music className="size-5" />
            </GlassButton>
            <GlassButton
              label={prayerActive ? "End Prayer Mode" : "Start Prayer Mode"}
              onClick={() => void togglePrayer()}
              active={prayerActive}
              tone={prayerActive ? "muted" : "glass"}
            >
              <HandHeart className="size-5" />
            </GlassButton>
          </div>
        )}

        {/* Background music — the exact same playlist panel used in podcast
            studio mode. */}
        {musicPanelOpen && (
          <MusicPanel
            live={live}
            position={musicPosition}
            duration={musicDuration}
            tracks={musicTracks}
            activeIndex={musicActiveIndex}
            playing={musicPlaying}
            volume={musicVolume}
            mixing={musicMixing}
            loop={musicLoop}
            error={musicError}
            onAddTracks={(added) => setMusicTracks((t) => [...t, ...added])}
            onPlayTrack={(i) => void playTrack(i)}
            onTogglePlay={toggleMusicPlay}
            onNext={nextTrack}
            onPrev={prevTrack}
            onToggleLoop={toggleMusicLoop}
            onVolume={changeMusicVolume}
            onSeek={seekMusic}
            onRemoveTrack={(i) => void removeTrack(i)}
            onError={setMusicError}
            onClose={() => setMusicPanelOpen(false)}
          />
        )}
        {/* Shared Prayer Mode overlay + "ended" toast over the video stage. */}
        <PrayerOverlay active={prayerActive} endedAt={prayerEndedAt} />
        <PrayerEndedToast endedAt={prayerEndedAt} />
      </div>

      {/* ── Live chatroom. Call-in guests now overlay the video above, so the
          chat keeps a constant share of the screen. ─────────────���──────────── */}
      <div
        className={cn(
          "min-h-0 border-t border-white/10 bg-neutral-950 transition-[flex-grow] duration-500 ease-out",
          tallStage ? "flex-[1.1]" : "flex-[1.5]",
        )}
      >
        <LiveChat
          asHost
          showResourceButton
          currentUser={currentUser}
          roomName={live ? roomName! : undefined}
          immersive
          placeholder=""
        />
      </div>

      {rtcError && live && connected && (
        <div className="absolute bottom-2 left-1/2 z-40 flex w-[min(92%,30rem)] -translate-x-1/2 items-center gap-2 rounded-2xl bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground shadow-lg">
          <p className="min-w-0 flex-1 text-pretty leading-snug">{rtcError}</p>
          {isMedianApp() && (
            <button
              type="button"
              onClick={() => openNativeAppSettings()}
              className="flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/30"
            >
              <Settings className="size-3.5" />
              Settings
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              clearRtcError()
              if (!camOn) void toggleCam()
            }}
            className="flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/30"
          >
            <RefreshCw className="size-3.5" />
            Retry
          </button>
          <button
            type="button"
            onClick={clearRtcError}
            aria-label="Dismiss"
            className="flex size-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/20"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Saving overlay while the finished recording uploads + auto-publishes. */}
      {saving && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-3 bg-black/80 backdrop-blur-sm px-6 text-center">
          <Loader2 className="size-8 animate-spin text-white" />
          <p className="text-sm font-medium text-white">Saving your live recording…</p>
          <p className="max-w-xs text-xs text-white/60 text-pretty">
            Publishing it to your catalogue under Live. This can take a moment for longer sessions.
          </p>
        </div>
      )}

      {/* End-session confirmation — a host must confirm before the whole
          broadcast is torn down for everyone watching. */}
      {endConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
          <button
            type="button"
            aria-label="Cancel ending the live"
            onClick={() => setEndConfirmOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="end-live-title"
            className="relative z-10 w-full max-w-xs rounded-3xl border border-white/10 bg-zinc-900/95 p-6 text-center shadow-2xl backdrop-blur-xl"
          >
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <Radio className="size-6" />
            </div>
            <h2 id="end-live-title" className="text-lg font-semibold text-white">
              End this live session?
            </h2>
            <p className="mt-1.5 text-sm text-white/60 text-pretty">
              Your broadcast will stop and everyone watching will be disconnected. This can&apos;t be undone.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setEndConfirmOpen(false)
                  void endLive()
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-destructive px-5 py-3 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 active:scale-[0.99]"
              >
                End live session
              </button>
              <button
                type="button"
                onClick={() => setEndConfirmOpen(false)}
                className="w-full rounded-2xl bg-white/10 px-5 py-3 text-sm font-semibold text-white ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/20"
              >
                Keep streaming
              </button>
            </div>
          </div>
        </div>
      )}

      {roomName && (
        <ShareSheet
          target={
            {
              type: "live",
              key: roomName,
              title,
              subtitle: `Join ${currentUser.name} live on Frequency`,
              url: `/live/${roomName}`,
              image: null,
              downloadUrl: null,
              downloadKind: null,
            } satisfies ShareTarget
          }
          open={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      )}

      {coverOpen && cover && (
        <ImageLightbox src={cover} alt={`${title} cover artwork`} onClose={() => setCoverOpen(false)} />
      )}
    </div>
  )
}
