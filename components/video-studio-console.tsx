"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import {
  Check,
  ChevronDown,
  Clock,
  Globe,
  Loader2,
  Lock,
  Mic,
  MicOff,
  MonitorPlay,
  MoreVertical,
  Music,
  LayoutGrid,
  Pencil,
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
  beginRoomRecording,
  endBroadcast,
  joinBroadcast,
  discardRoomReplay,
  getCallState,
  respondToCallRequest,
  removeFromStage,
  setGuestsEnabled,
  setSpotlightGuest,
  heartbeatBroadcast,
  type LiveStreamView,
  type LiveOrientation,
  type LiveVisibility,
} from "@/app/actions/live"
import { LIVE_CATEGORIES } from "@/lib/live-categories"
import { useLiveVideo, isMedianApp, openNativeAppSettings, type RemotePeer } from "@/lib/use-live-video"
import { useLiveProcessing } from "@/components/live-processing-provider"
import { ReactionLayer } from "@/components/live-reactions"
import { LiveChat } from "@/components/live-chat"
import { MusicPanel, type Track } from "@/components/studio-console"
import { BackExitMenu } from "@/components/live-back-menu"
import { SaveEpisodePrompt } from "@/components/live/save-episode-prompt"
import { LiveAudienceSheet } from "@/components/live-audience-sheet"
import { useLivePresence } from "@/lib/use-live-presence"
import { ShareSheet } from "@/components/share-sheet"
import { ConversationVideo } from "@/components/conversation/conversation-video"
import { CoverUpload, SQUARE_RATIO } from "@/components/admin/cover-upload"
import { CoverArt } from "@/components/cover-art"
import { MarqueeTitle } from "@/components/marquee-title"
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
            : "bg-black/40 text-white ring-white/10 backdrop-blur-md hover:bg-black/55",
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
  // Spotlight + remove controls now live in a compact overflow menu anchored to
  // the guest tile's bottom-right corner (instead of two buttons across the top).
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div
      style={stageRectStyle(rect)}
      // Container passes taps through to the tap-capture layer (so tapping a
      // guest video toggles the controls); only the control buttons re-enable
      // pointer events.
      className="pointer-events-none z-20 overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-inset ring-white/10 transition-[top,left,width,height] duration-500 ease-out"
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
      {/* Pinned indicator (read-only badge) — the toggle itself moved into the
          overflow menu below. */}
      {pinned && (
        <span className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
          <Pin className="size-3" /> Spotlight
        </span>
      )}
      {/* Bottom bar: guest name on the left, host overflow menu on the right. */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-white">{peer.name}</span>
        <div className="pointer-events-auto relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={`Options for ${peer.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex size-7 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-md transition-colors hover:bg-black/70 active:scale-90"
          >
            <MoreVertical className="size-3.5" />
          </button>
          {menuOpen && (
            <>
              {/* Backdrop closes the menu on outside tap. */}
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div
                role="menu"
                className="absolute bottom-full right-0 z-50 mb-1.5 w-40 overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 p-1 text-white shadow-xl backdrop-blur-md"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onTogglePin(peer.identity)
                    setMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors hover:bg-white/10"
                >
                  {pinned ? <PinOff className="size-3.5 shrink-0" /> : <Pin className="size-3.5 shrink-0" />}
                  {pinned ? "Remove spotlight" : "Spotlight"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onRemove(peer.identity)
                    setMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-destructive transition-colors hover:bg-destructive/15"
                >
                  <X className="size-3.5 shrink-0" /> Remove guest
                </button>
              </div>
            </>
          )}
        </div>
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
  // True when the replay is recorded SERVER-SIDE by LiveKit Egress. Set from the
  // go-live / resume result. When true the client skips its own MediaRecorder
  // capture and the replay enqueue — egress + the webhook produce the replay.
  const [recordOnServer, setRecordOnServer] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [shareOpen, setShareOpen] = useState(false)
  // Secondary header stats (viewers + elapsed timer) collapse into a top-right
  // overflow menu so the host's name gets the full width of the header pill.
  // Confirmation gate before a host ends the live session, so a mis-tap on the
  // back menu can't drop everyone out of the broadcast.
  const [endConfirmOpen, setEndConfirmOpen] = useState(false)
  // Hands a saved recording to the app-level background processor so the upload
  // + publish happen off-screen and the host is never held on a saving screen.
  const { enqueue: enqueueLiveReplay } = useLiveProcessing()
  // After the room has ended for everyone, the host is asked whether to save the
  // session as an episode. Holds the metadata needed to publish if they say yes.
  const [saveDecision, setSaveDecision] = useState<{ duration: string; durationSec: number } | null>(null)
  // In-flight recording finalization, started the instant the host ends the live
  // so it never blocks the room from closing for participants.
  const recordingPromiseRef = useRef<Promise<Blob | null> | null>(null)
  const startedAtRef = useRef<number | null>(null)

  // Background music playlist — the exact same rich panel used in podcast studio
  // mode (MusicPanel): a queue with transport, scrubber, loop and volume.
  const [musicPanelOpen, setMusicPanelOpen] = useState(false)
  // Tap the camera surface to show/hide the bottom control dock (mic, camera,
  // music, etc.), so the host can preview a clean frame.
  const [controlsVisible, setControlsVisible] = useState(true)
  // Full-screen cover artwork viewer (opened from the Broadcast header).
  const [musicTracks, setMusicTracks] = useState<Track[]>([])
  const [musicActiveIndex, setMusicActiveIndex] = useState<number | null>(null)
  const [musicPlaying, setMusicPlayingState] = useState(false)
  // Default to a clear 0.8. Mic echo cancellation suppresses the host's own
  // speaker output, so the old 0.4 default made background music sound muffled.
  const [musicVolume, setMusicVolumeState] = useState(0.8)
  const [musicMixing, setMusicMixing] = useState(false)
  const [musicLoop, setMusicLoopState] = useState(false)
  const [musicError, setMusicError] = useState<string | null>(null)
  // Host choice: automatically dip music under live speech (default on).
  const [duckEnabled, setDuckEnabled] = useState(true)

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
    // Record the composite in the same shape the audience watched in.
    recordAspect: orientation === "landscape" ? "landscape" : "portrait",
    // When egress is recording server-side, skip the client-side capture.
    recordOnServer,
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
      setRecordOnServer(Boolean(res.recordOnServer))
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

  // Start the SERVER-SIDE replay recording (LiveKit Egress) only once the host
  // is actually connected AND publishing video. Egress composites the room, so
  // starting it before the host's camera is live (as startBroadcast used to)
  // records an empty room and strands the replay at 0:00. Gating on
  // `localVideoReady` guarantees the host's camera track exists in the room
  // first. `beginRoomRecording` is idempotent server-side, and the ref makes
  // sure we only ever fire it once per room even across re-renders/reconnects.
  const recordingBegunRef = useRef(false)
  useEffect(() => {
    if (!recordOnServer || !roomName || !connected || !localVideoReady) return
    if (recordingBegunRef.current) return
    recordingBegunRef.current = true
    void beginRoomRecording({ roomName }).catch(() => {
      // Allow a later retry if the call failed outright (network hiccup).
      recordingBegunRef.current = false
    })
  }, [recordOnServer, roomName, connected, localVideoReady])

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

  // Whether anyone on the call — the host or any guest — is actively speaking.
  const anySpeaking = localSpeaking || peers.some((p) => p.isSpeaking)

  // Release-hold timer so the music doesn't "pump" between words; it only rises
  // back to full once the room has been quiet for a moment.
  const duckReleaseRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sidechain ducking (host-toggleable via the music panel). While anyone is
  // actively speaking, dip the background music so voices cut through cleanly and
  // each speaker's mic echo-canceller/noise-suppressor isn't fighting loud,
  // sustained music bleeding from their device speakers — the real cause of a
  // voice sounding muffled/underwater. Fast attack when speech starts; a short
  // hold + gentle release when it stops. When the host turns ducking off, the
  // music simply holds at its full set volume.
  useEffect(() => {
    if (musicActiveIndex === null || !musicPlaying) return
    if (!duckEnabled) {
      if (duckReleaseRef.current) {
        clearTimeout(duckReleaseRef.current)
        duckReleaseRef.current = null
      }
      duckMusic(false, 300)
      return
    }
    if (anySpeaking) {
      if (duckReleaseRef.current) {
        clearTimeout(duckReleaseRef.current)
        duckReleaseRef.current = null
      }
      duckMusic(true, 140)
    } else {
      duckReleaseRef.current = setTimeout(() => {
        duckMusic(false, 480)
        duckReleaseRef.current = null
      }, 650)
    }
    return () => {
      if (duckReleaseRef.current) {
        clearTimeout(duckReleaseRef.current)
        duckReleaseRef.current = null
      }
    }
  }, [duckEnabled, anySpeaking, musicActiveIndex, musicPlaying, duckMusic])

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
      setRecordOnServer(Boolean(res.recordOnServer))
      setCreds({ token: res.token, serverUrl: res.serverUrl })
      startedAtRef.current = null
      setElapsed(0)
    } catch {
      setError("Something went wrong starting your live. Please try again.")
    } finally {
      setStarting(false)
    }
  }

  // Terminate the live room IMMEDIATELY for everyone. Recording finalization is
  // kicked off first (synchronously stopping the recorder so no footage is lost)
  // but is NOT awaited here — we hold the promise and only resolve it later if
  // the host chooses to save. Ending the broadcast and disconnecting are
  // fire-and-forget so the room closes for participants without waiting on the
  // recording, uploads, episode creation, or the host's save decision.
  function endLiveRoom() {
    // Server-recorded sessions have no client blob to finalize — egress + the
    // webhook produce the replay. Only run the client recorder teardown for the
    // fallback (non-egress) path.
    recordingPromiseRef.current = recordOnServer ? Promise.resolve(null) : stopRecording().catch(() => null)
    if (roomName) void endBroadcast({ roomName }).catch(() => {})
    disconnect()
    setSaveDecision({ duration: formatElapsed(elapsed), durationSec: Math.round(elapsed) })
  }

  // Host chose to save the just-ended session. Instead of blocking on a saving
  // screen, we hand the recording to the app-level background processor: it
  // immediately adds a "Processing…" entry to the Live Catalogue and uploads the
  // COMPLETE recording in the background, then flips the entry to a playable
  // replay and notifies the host. The host exits the studio right away and can
  // keep using Frequency while it finishes.
  function handleSaveEpisode() {
    const dec = saveDecision
    setSaveDecision(null)
    // Server-recorded replays are already being produced by egress + finalized
    // by the webhook into the placeholder episode created at go-live. There's no
    // client blob to upload — keeping the session just means leaving it in place.
    if (recordOnServer) {
      recordingPromiseRef.current = null
      onExit?.()
      return
    }
    if (!dec) {
      onExit?.()
      return
    }
    const blobPromise = recordingPromiseRef.current ?? Promise.resolve(null)
    recordingPromiseRef.current = null
    void enqueueLiveReplay({
      title,
      category,
      duration: dec.duration,
      // Carry over the cover art chosen at setup so the replay shows its poster.
      cover,
      mediaKind: "video",
      fileBaseName: "live-session",
      blobPromise,
      // The live wall-clock length, used to validate the recording isn't a
      // truncated few-seconds clip before the replay is published.
      expectedDurationSec: dec.durationSec,
    })
    onExit?.()
  }

  // Host confirmed they don't want to save. Drop the recording and leave — the
  // live room already ended when they confirmed.
  function handleDiscardEpisode() {
    setSaveDecision(null)
    recordingPromiseRef.current = null
    // For server-recorded sessions, remove the placeholder replay episode (and
    // best-effort delete the stored object) so a discarded session doesn't
    // linger in the catalogue as the webhook tries to finalize it.
    if (recordOnServer && roomName) void discardRoomReplay({ roomName }).catch(() => {})
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

  // ── Broadcast spotlight (portrait) ─────�����──────────────────────────────────
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
  // With 3+ people on a portrait Broadcast the stage grows slightly. These flex
  // ratios are kept identical to the viewer (LiveVideoViewer) so the host's
  // video reads at exactly the same height as the audience sees it.
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
          orientation === "landscape" ? "flex-[1.75]" : tallStage ? "flex-[2.9]" : "flex-[2.5]",
        )}
      >
        {/* Persistent host camera — the live publisher feed (mirrored self-view).
            In a live Conversation the ConversationVideo overlay owns localVideoRef,
            so we skip this element. This single <video> is NEVER remounted; only
            its rect (inline style) changes as the stage reflows between the
            1/2/3/4-person layouts, so the local camera track stays attached. A
            spotlighted guest simply pushes the host into a secondary slot. */}
        {!(live && isGridMeeting) && (
          // Positioned wrapper owns the rect + rounding. Clipping the border
          // radius on this `overflow-hidden` container (instead of directly on
          // the <video>) is what actually rounds the corners — a <video> with
          // object-cover paints its decoded texture past its own border-radius
          // on many browsers, which is why the host frame looked square. This
          // matches how guest tiles and the viewer round their videos.
          <div
            style={live && orientation !== "landscape" ? stageRectStyle(hostRect) : undefined}
            className={cn(
              // Display surface only — let taps fall through to the tap-capture
              // layer below so tapping the video toggles the controls.
              "pointer-events-none transition-[top,left,width,height] duration-500 ease-out",
              orientation === "landscape"
                ? // Landscape letterboxes the feed so nothing is cropped.
                  "absolute inset-0 z-0"
                : live
                  ? // Portrait Broadcast: positioned via hostRect. Always rounded so the
                    // host's own frame matches the viewer's rounded video, even solo.
                    "z-20 overflow-hidden rounded-2xl ring-1 ring-inset ring-white/10"
                  : // Pre-live: full-bleed (the preview element also renders below).
                    "absolute inset-0 z-0",
            )}
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "h-full w-full transition-opacity duration-500 ease-out",
                // Mirror only the front camera; the back camera must render
                // un-mirrored so text/scenes aren't reversed.
                facingMode === "user" && "-scale-x-100",
                orientation === "landscape" ? "object-contain" : "object-cover",
                live && camOn && localVideoReady ? "opacity-100" : "opacity-0",
              )}
            />
          </div>
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
                    onClick={() => {
                      // Connection failed — nothing was broadcast or recorded, so
                      // just tear down the room and leave (no save prompt).
                      if (roomName) void endBroadcast({ roomName }).catch(() => {})
                      disconnect()
                      onExit?.()
                    }}
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

        {/* Broadcast header — always visible. Tapping the stage only toggles the
            bottom control dock, never this header, so the host always sees their
            identity + LIVE status. One compact host pill (cover • name / title)
            on the left, then LIVE • viewers • timer • share on the right. */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <BackExitMenu
              showMenu={live}
              exitLabel="End"
              onExit={live ? () => setEndConfirmOpen(true) : (onExit ?? (() => {}))}
              onMinimize={onMinimize ?? (() => {})}
            />
            {/* Host identity pill: cover thumb + host name (clear) / title. */}
            {live && orientation !== "landscape" ? (
              <div className="flex min-w-0 items-center gap-2 rounded-full bg-black/40 py-1 pl-1 pr-2.5 ring-1 ring-inset ring-white/10 backdrop-blur-md">
                {cover ? (
                  <CoverArt src={cover} alt={`${title} cover artwork`} className="size-8" />
                ) : (
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
                      getAvatarColor(currentUser.id),
                    )}
                    aria-hidden="true"
                  >
                    {getInitials(currentUser.name)}
                  </span>
                )}
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-sm font-semibold text-white">{currentUser.name}</span>
                  <MarqueeTitle text={title} className="text-[11px] text-white/60" />
                </div>
              </div>
            ) : !live ? (
              <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 ring-1 ring-inset ring-white/15 backdrop-blur-md">
                <Video className="size-3.5" /> Video studio
              </span>
            ) : null}
            {/* Elapsed timer — its own dark round pill sitting between the host
                name and the LIVE badge, matching the other header pills. */}
            {live && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1.5 text-[11px] font-medium text-white/90 ring-1 ring-inset ring-white/10 backdrop-blur-md">
                <Clock className="size-3.5 text-white/70" />
                <span className="font-mono tabular-nums">{formatElapsed(elapsed)}</span>
              </span>
            )}
          </div>

          {/* Right cluster: the LIVE badge and the audience count. The count now
              lives directly in the header (replacing the old three-dot menu);
              tapping it still opens the full audience management sheet. */}
          <div className="flex shrink-0 items-center gap-1.5">
            {live && (
              <span className="flex items-center gap-1.5 rounded-full bg-live px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-live-foreground shadow-lg">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-live-foreground/70" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-live-foreground" />
                </span>
                Live
              </span>
            )}
            {live && (
              <LiveAudienceSheet
                count={audienceCount || viewers}
                members={audienceMembers}
                immersive
                isHost
                roomName={roomName ?? undefined}
                blockedUsers={callState?.blockedUsers ?? []}
                onChanged={() => void refreshCalls()}
                // Match the elapsed timer's dark pill (the default immersive
                // trigger uses a light bg-white/10, which read as "no dark
                // background" next to the timer). bg-black/40 wins via cn().
                className="bg-black/40 px-2.5 py-1.5 text-[11px] font-medium text-white/90 ring-1 ring-inset ring-white/10 backdrop-blur-md hover:bg-black/55"
              />
            )}
          </div>
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
              <div className="w-full max-w-md space-y-5 rounded-3xl bg-black/50 p-5 ring-1 ring-inset ring-white/10 backdrop-blur-2xl">
              {/* Header: compact title + subtitle on the left, dismiss on the right. */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold leading-tight tracking-tight text-white">Go live</h2>
                  <p className="mt-0.5 text-[13px] text-white/50">Set up your broadcast</p>
                </div>
                <button
                  type="button"
                  onClick={() => onExit?.()}
                  aria-label="Close"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/20 active:scale-90"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="live-title" className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                    Stream title
                  </label>
                  <span className="text-[11px] tabular-nums text-white/35">{title.length}/80</span>
                </div>
                <div className="relative">
                  <Pencil className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/40" />
                  <input
                    id="live-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={80}
                    placeholder="What's your live about?"
                    className="w-full rounded-2xl bg-white/[0.06] py-3.5 pl-10 pr-4 text-[15px] font-medium text-white ring-1 ring-inset ring-white/10 placeholder:text-white/35 focus:outline-none focus:ring-primary"
                  />
                </div>
              </div>

              {/* Layout chooser: portrait (original full-bleed) vs landscape
                  (Facebook-style 16:9 video + comment feed below). A compact
                  segmented control — roughly an input's height, not two cards.
                  The contextual hint lives on one line beneath it. */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Layout</span>
                <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-white/[0.05] p-1 ring-1 ring-inset ring-white/10">
                  {(
                    [
                      { value: "portrait", label: "Broadcast", icon: Radio },
                      { value: "landscape", label: "Conversation", icon: MonitorPlay },
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
                          "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
                          active
                            ? "bg-primary/15 text-white shadow-[0_0_20px_-8px] shadow-primary/60 ring-1 ring-inset ring-primary/70"
                            : "text-white/55 hover:text-white/80",
                        )}
                      >
                        <Icon className={cn("size-4", active ? "text-primary" : "text-white/45")} />
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11.5px] text-white/45">
                  {orientation === "landscape" ? "A community gathering" : "Stage, teaching & preaching"}
                </p>
              </div>

              {/* Cover artwork — optional, so it's a single compact row rather
                  than a large upload box. Both Broadcast and Conversation carry
                  a cover (the room's identity, shown in the header + lightbox),
                  locked to a 1:1 crop to match the square art used everywhere. */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Cover art</span>
                <CoverUpload value={cover} onChange={setCover} ratios={SQUARE_RATIO} allowFit row hideLabel />
              </div>

              {/* Discussion topic — Conversation rooms only. */}
              {orientation === "landscape" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="live-topic" className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                      Discussion
                    </label>
                    <span className="text-[11px] text-white/35">Optional</span>
                  </div>
                  <input
                    id="live-topic"
                    value={roomTopic}
                    onChange={(e) => setRoomTopic(e.target.value)}
                    maxLength={80}
                    placeholder="What are we gathering around?"
                    className="w-full rounded-2xl bg-white/[0.06] px-4 py-3.5 text-[15px] font-medium text-white ring-1 ring-inset ring-white/10 placeholder:text-white/35 focus:outline-none focus:ring-primary"
                  />
                </div>
              )}

              {/* Category — required. The host must tag their live with one of
                  the known categories; there is no "Uncategorised" option. */}
              <div className="space-y-2">
                <label htmlFor="live-category" className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  Category <span className="text-primary">*</span>
                </label>
                <div className="relative">
                  <LayoutGrid className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/40" />
                  <select
                    id="live-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={cn(
                      "w-full appearance-none rounded-2xl bg-white/[0.06] py-3.5 pl-10 pr-10 text-[15px] font-medium ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-primary [&>option]:bg-neutral-900 [&>option]:text-white",
                      category ? "text-white" : "text-white/40",
                    )}
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
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-white/50" />
                </div>
              </div>

              {/* Privacy — public (discoverable in Live) vs private (link-only). */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Privacy</span>
                <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-white/[0.05] p-1 ring-1 ring-inset ring-white/10">
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
                          "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
                          active
                            ? "bg-primary text-primary-foreground shadow-[0_0_20px_-8px] shadow-primary/70"
                            : "text-white/55 hover:text-white/80",
                        )}
                      >
                        <Icon className="size-4" /> {opt.label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11.5px] text-white/45">
                  {visibility === "public" ? "Anyone can discover and join" : "Invite or link only"}
                </p>
              </div>

              {/* Pre-live summary — a single quiet line confirming the setup at a
                  glance before committing, without adding another section. */}
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/[0.04] px-3 py-2.5 text-xs font-medium ring-1 ring-inset ring-white/10">
                <span className="text-white/80">{orientation === "landscape" ? "Conversation" : "Broadcast"}</span>
                <span className="text-white/25">•</span>
                <span className="text-white/80">{visibility === "public" ? "Public" : "Private"}</span>
                <span className="text-white/25">•</span>
                <span className={cn("truncate", category ? "text-white/80" : "text-white/40")}>
                  {category || "No category"}
                </span>
              </div>

              {error && <p className="text-sm font-medium text-destructive">{error}</p>}

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={goLive}
                  disabled={starting || !category}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-semibold text-live-foreground transition-all active:scale-[0.99]",
                    starting || !category
                      ? "bg-live/40 text-live-foreground/70"
                      : "bg-live shadow-[0_0_34px_-8px] shadow-live/70 hover:opacity-95",
                  )}
                >
                  {starting ? <Loader2 className="size-5 animate-spin" /> : <Radio className="size-5" />}
                  {starting ? "Starting…" : "Go live"}
                </button>
                <button
                  type="button"
                  onClick={() => onExit?.()}
                  className="mx-auto block text-sm font-medium text-white/50 transition-colors hover:text-white/80"
                >
                  Cancel
                </button>
              </div>
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
            {roomName && (
              <GlassButton label="Share this live" onClick={() => setShareOpen(true)}>
                <Send className="size-5" />
              </GlassButton>
            )}
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
            duck={duckEnabled}
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
            onToggleDuck={setDuckEnabled}
            onClose={() => setMusicPanelOpen(false)}
          />
        )}
      </div>

      {/* ── Live chatroom. Call-in guests now overlay the video above, so the
          chat keeps a constant share of the screen. ─────────────���──────────── */}
      <div
        className={cn(
          "min-h-0 border-t border-white/10 bg-neutral-950 transition-[flex-grow] duration-500 ease-out",
          "flex-[1.5]",
        )}
      >
        <LiveChat
          asHost
          showResourceButton
          currentUser={currentUser}
          roomName={live ? roomName! : undefined}
          immersive
          flatText
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

      {/* Post-end save decision. Shown once the room has already closed for
          everyone; choosing "Yes" runs the upload/publish below. */}
      {saveDecision && <SaveEpisodePrompt onSave={() => void handleSaveEpisode()} onDiscard={handleDiscardEpisode} />}

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
                  endLiveRoom()
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

    </div>
  )
}
