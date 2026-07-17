"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import {
  Check,
  ChevronDown,
  FastForward,
  Globe,
  Loader2,
  Lock,
  Mic,
  MicOff,
  MonitorPlay,
  Music,
  Pause,
  Play,
  Radio,
  Smartphone,
  RefreshCw,
  Rewind,
  Send,
  Settings,
  SkipBack,
  SkipForward,
  Trash2,
  UserPlus,
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
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
  heartbeatBroadcast,
  type LiveStreamView,
  type LiveOrientation,
  type LiveVisibility,
} from "@/app/actions/live"
import { LIVE_CATEGORIES } from "@/lib/live-categories"
import { useLiveVideo, isMedianApp, openNativeAppSettings } from "@/lib/use-live-video"
import { uploadMedia } from "@/lib/upload-media"
import { publishShow } from "@/app/actions/shows"
import { ReactionLayer } from "@/components/live-reactions"
import { LiveChat } from "@/components/live-chat"
import { BackExitMenu } from "@/components/live-back-menu"
import { LiveAudienceSheet } from "@/components/live-audience-sheet"
import { useLivePresence } from "@/lib/use-live-presence"
import { ShareSheet } from "@/components/share-sheet"
import { MeetingGrid } from "@/components/meeting-grid"
import type { ShareTarget } from "@/lib/share-types"
import { getAvatarColor, getInitials } from "@/lib/identity"
import { cn } from "@/lib/utils"

function formatTime(s: number) {
  const total = Math.max(0, Math.floor(s))
  const m = Math.floor(total / 60)
  const sec = total % 60
  return `${m}:${sec.toString().padStart(2, "0")}`
}

/** How many backing tracks the host can keep loaded at once. */
const MAX_MUSIC_TRACKS = 4

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

/** A single guest call-in tile (accepted guest's camera) or an empty slot. */
function GuestSlot({
  peer,
  registerEl,
  onRemove,
}: {
  peer?: { identity: string; name: string; image: string | null; hasVideo: boolean }
  registerEl: (identity: string, el: HTMLVideoElement | null) => void
  onRemove?: (identity: string) => void
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
          // object-cover so the guest feed fills the slot with no black bars.
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
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
        <span className="truncate text-[11px] font-semibold text-white">{peer.name}</span>
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(peer.identity)}
            aria-label={`Remove ${peer.name}`}
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-black/50 text-white/90 transition-colors hover:bg-destructive"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
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
  onMeta?: (m: { title: string; cover: string | null; live: boolean; subtitle?: string }) => void
}) {
  const [title, setTitle] = useState(resumeStream?.title ?? `${currentUser.name} — live`)
  // Host-chosen broadcast layout. "portrait" = the original full-bleed vertical
  // design; "landscape" = the Facebook-style 16:9 video + comment feed layout.
  const [orientation, setOrientation] = useState<LiveOrientation>(resumeStream?.orientation ?? "portrait")
  // Host-chosen discoverability: public (listed in Live) vs private (link-only).
  const [visibility, setVisibility] = useState<LiveVisibility>(resumeStream?.visibility ?? "public")
  // Optional topic category for the broadcast (empty = uncategorised).
  const [category, setCategory] = useState<string>(resumeStream?.category ?? "")
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

  // Music state — a small playlist (up to MAX_MUSIC_TRACKS) with the active
  // track scrubbable on its own timeline, mirroring the audio studio.
  const [musicPanelOpen, setMusicPanelOpen] = useState(false)
  // Tap the camera surface to show/hide the bottom control dock (mic, camera,
  // music, etc.), so the host can preview a clean frame.
  const [controlsVisible, setControlsVisible] = useState(true)
  const [musicTracks, setMusicTracks] = useState<{ url: string; name: string }[]>([])
  const [musicActiveIndex, setMusicActiveIndex] = useState<number | null>(null)
  const [musicPlaying, setMusicPlayingState] = useState(false)
  const [musicVolume, setMusicVolumeState] = useState(0.4)
  const [musicUploading, setMusicUploading] = useState(false)
  const [musicError, setMusicError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const live = Boolean(roomName && creds)

  const {
    localVideoRef,
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
    setMusicPlaying,
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
    onMeta?.({ title, cover: null, live, subtitle: live ? "You're live · video" : "Setting up" })
  }, [title, live, onMeta])

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

  // ── Music controls ──────────────────────────────────────────────────────
  // Load (publish) a playlist track and start it playing on its own timeline.
  async function playTrack(index: number) {
    const track = musicTracks[index]
    if (!track) return
    setMusicError(null)
    try {
      await publishMusic(track.url)
      setMusicVolume(musicVolume)
      setMusicActiveIndex(index)
      setMusicPlayingState(true)
    } catch {
      setMusicError("Could not play that track. Try a different audio file.")
    }
  }
  async function onPickMusic(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ""
    if (files.length === 0) return
    setMusicError(null)
    setMusicUploading(true)
    try {
      const room = MAX_MUSIC_TRACKS - musicTracks.length
      const added: { url: string; name: string }[] = []
      for (const file of files.slice(0, room)) {
        if (!file.type.startsWith("audio/")) continue
        const { url } = await uploadMedia(file, "live-music")
        added.push({ url, name: file.name.replace(/\.[^.]+$/, "") })
      }
      if (added.length) {
        const startWasEmpty = musicTracks.length === 0
        setMusicTracks((prev) => [...prev, ...added].slice(0, MAX_MUSIC_TRACKS))
        // Auto-play the first track if nothing is loaded yet.
        if (startWasEmpty) {
          await publishMusic(added[0].url)
          setMusicVolume(musicVolume)
          setMusicActiveIndex(0)
          setMusicPlayingState(true)
        }
      }
    } catch {
      setMusicError("Could not add that track. Try a different audio file.")
    } finally {
      setMusicUploading(false)
    }
  }
  function toggleMusicPlay() {
    if (musicActiveIndex === null) return
    const next = !musicPlaying
    setMusicPlaying(next)
    setMusicPlayingState(next)
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
  async function stopMusicTrack() {
    await stopMusic()
    setMusicTracks([])
    setMusicActiveIndex(null)
    setMusicPlayingState(false)
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
  const guests = peers.slice(0, 2)

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-neutral-950 text-white [isolation:isolate]">
      {/* Grid meeting (live): a Meet/Zoom-style tile grid overlays the broadcast
          layout. Kept as an overlay (not an early return) so the shared music
          "Add track" panel and end-confirm dialog below still render. The
          hidden self-view <video> in the layout underneath stays mounted, so
          MeetingGrid renders its own tile <video> instead. */}
      {live && isGridMeeting && (
        <div className="absolute inset-0 z-40 flex flex-col bg-neutral-950">
          {/* Video Live header — kept visible on the host's grid too. */}
          <div className="flex items-center justify-between gap-2 bg-neutral-900 px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
            <BackExitMenu
              showMenu
              exitLabel="End"
              onExit={() => setEndConfirmOpen(true)}
              onMinimize={onMinimize ?? (() => {})}
            />
            <div className="flex min-w-0 flex-1 flex-col px-1 leading-tight">
              <span className="truncate text-sm font-semibold">{title}</span>
              <span className="truncate text-[11px] text-white/60">You&apos;re live · meeting</span>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-live px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-live-foreground">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-live-foreground/70" />
                <span className="relative inline-flex size-2 rounded-full bg-live-foreground" />
              </span>
              Live
            </span>
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
          </div>
          <div className="min-h-0 flex-1">
          <MeetingGrid
            roomName={roomName as string}
            self={{ identity: currentUser.id, name: currentUser.name, image: currentUser.image ?? null }}
            peers={peers}
            currentUser={currentUser}
            hostId={callState?.hostId ?? currentUser.id}
            gridCohostId={callState?.gridCohostId ?? null}
            gridPinnedId={callState?.gridPinnedId ?? null}
            gridPinRequest={callState?.gridPinRequest ?? null}
            onRefreshState={() => void refreshCalls()}
            localVideoRef={localVideoRef}
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
            onAddTrack={() => setMusicPanelOpen(true)}
          />
          </div>
        </div>
      )}
      {/* ── Host camera (1.75/4 of the screen; grows to 2.125 when the guest
          section is off, taking half the freed call-in row) ──────────────── */}
      <div
        className={cn(
          "relative min-h-0 overflow-hidden",
          orientation !== "landscape" && !guestsEnabled ? "flex-[2.125]" : "flex-[1.75]",
        )}
      >
        {/* Full-bleed camera — live publisher feed (mirrored self-view). In a
            live grid meeting the MeetingGrid overlay owns localVideoRef, so we
            skip this element to avoid two <video>s claiming the same ref. */}
        {!(live && isGridMeeting) && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "absolute inset-0 z-0 h-full w-full transition-opacity duration-500",
              // Landscape broadcasts letterbox the feed so nothing is cropped.
              // Portrait: object-cover so the feed fills the whole frame with no
              // black bars on the sides. -scale-x keeps the self-view mirrored.
              orientation === "landscape" ? "-scale-x-100 object-contain" : "-scale-x-100 object-cover",
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

        {/* Camera-off / connecting wash */}
        {live && (!camOn || !connected || !localVideoReady) && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-neutral-950 px-6">
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

        {/* Top bar: back menu + LIVE/viewers/timer */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <BackExitMenu
              showMenu={live}
              exitLabel="End"
              onExit={live ? () => setEndConfirmOpen(true) : (onExit ?? (() => {}))}
              onMinimize={onMinimize ?? (() => {})}
            />
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
                      { value: "portrait", label: "Focused", hint: "Full-screen vertical", icon: Smartphone },
                      { value: "landscape", label: "Grid", hint: "Meeting with everyone", icon: MonitorPlay },
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
            controls stay tappable even when the camera is turned off. Grid
            meetings hide this dock entirely: MeetingGrid renders its own bottom
            dock, and this one would otherwise float in the middle of the screen
            (the camera region is only the top portion in grid mode). */}
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
          </div>
        )}

        {/* Music panel — a fixed, centered overlay so it's never clipped by the
            camera region's overflow-hidden (which previously hid the top of the
            panel, including the upload button, "up in the frame"). It scrolls
            internally if it ever exceeds the viewport height. */}
        {live && musicPanelOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
              type="button"
              aria-label="Close music panel"
              onClick={() => setMusicPanelOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <div className="relative z-10 max-h-[80vh] w-72 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Background music</p>
              <button
                type="button"
                onClick={() => setMusicPanelOpen(false)}
                aria-label="Close music panel"
                className="text-white/50 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              multiple
              onChange={onPickMusic}
              className="hidden"
            />
            <div className="space-y-3">
              {/* Now playing: scrubbable timeline + transport */}
              {musicActiveIndex !== null && musicTracks[musicActiveIndex] && (
                <div className="space-y-2.5 rounded-xl bg-white/5 p-3 ring-1 ring-inset ring-white/10">
                  <p className="truncate text-sm font-semibold">{musicTracks[musicActiveIndex].name}</p>

                  {/* Timeline scrubber */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => seekMusic(Math.max(0, musicPosition - 15))}
                      aria-label="Back 15 seconds"
                      className="text-white/60 transition-colors hover:text-white"
                    >
                      <Rewind className="size-4" />
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={musicDuration || 0}
                      step={1}
                      value={Math.min(musicPosition, musicDuration || 0)}
                      onChange={(e) => seekMusic(Number(e.target.value))}
                      aria-label="Seek background music"
                      className="h-1.5 w-full cursor-pointer accent-primary"
                    />
                    <button
                      type="button"
                      onClick={() => seekMusic(musicPosition + 15)}
                      aria-label="Forward 15 seconds"
                      className="text-white/60 transition-colors hover:text-white"
                    >
                      <FastForward className="size-4" />
                    </button>
                  </div>
                  <div className="flex justify-between font-mono text-[10px] tabular-nums text-white/50">
                    <span>{formatTime(musicPosition)}</span>
                    <span>{formatTime(musicDuration || 0)}</span>
                  </div>

                  {/* Transport */}
                  <div className="flex items-center justify-center gap-5">
                    <button
                      type="button"
                      onClick={prevTrack}
                      disabled={musicTracks.length < 2}
                      aria-label="Previous track"
                      className="text-white/80 transition-colors hover:text-white disabled:opacity-40"
                    >
                      <SkipBack className="size-4 fill-current" />
                    </button>
                    <button
                      type="button"
                      onClick={toggleMusicPlay}
                      aria-label={musicPlaying ? "Pause music" : "Play music"}
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    >
                      {musicPlaying ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
                    </button>
                    <button
                      type="button"
                      onClick={nextTrack}
                      disabled={musicTracks.length < 2}
                      aria-label="Next track"
                      className="text-white/80 transition-colors hover:text-white disabled:opacity-40"
                    >
                      <SkipForward className="size-4 fill-current" />
                    </button>
                  </div>

                  {/* Volume */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => changeMusicVolume(musicVolume === 0 ? 0.4 : 0)}
                      aria-label={musicVolume === 0 ? "Unmute music" : "Mute music"}
                      className="text-white/60 transition-colors hover:text-white"
                    >
                      {musicVolume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={musicVolume}
                      onChange={(e) => changeMusicVolume(Number(e.target.value))}
                      aria-label="Music volume"
                      className="h-1.5 w-full cursor-pointer accent-primary"
                    />
                  </div>
                </div>
              )}

              {/* Playlist (up to MAX_MUSIC_TRACKS) */}
              {musicTracks.length > 0 && (
                <ul className="space-y-1.5">
                  {musicTracks.map((t, i) => {
                    const isActive = i === musicActiveIndex
                    return (
                      <li
                        key={t.url}
                        className={cn(
                          "flex items-center gap-2 rounded-xl p-1.5 ring-1 ring-inset transition-colors",
                          isActive ? "bg-primary/15 ring-primary/30" : "bg-white/5 ring-white/10",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => void playTrack(i)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <span
                            className={cn(
                              "flex size-7 shrink-0 items-center justify-center rounded-full",
                              isActive && musicPlaying
                                ? "bg-primary text-primary-foreground"
                                : "bg-white/10 text-white",
                            )}
                          >
                            {isActive && musicPlaying ? (
                              <Pause className="size-3.5" />
                            ) : (
                              <Play className="size-3.5 translate-x-px" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-medium">{t.name}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeTrack(i)}
                          aria-label={`Remove ${t.name}`}
                          className="flex size-7 shrink-0 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              {/* Add / upload tracks */}
              {musicTracks.length < MAX_MUSIC_TRACKS && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={musicUploading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/20 disabled:opacity-60"
                >
                  {musicUploading ? <Loader2 className="size-4 animate-spin" /> : <Music className="size-4" />}
                  {musicUploading
                    ? "Uploading…"
                    : musicTracks.length === 0
                      ? "Upload tracks (up to 2)"
                      : "Add another track"}
                </button>
              )}
              {musicTracks.length > 0 && (
                <button
                  type="button"
                  onClick={() => void stopMusicTrack()}
                  className="w-full rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 ring-1 ring-inset ring-white/10 hover:bg-white/10"
                >
                  Clear all
                </button>
              )}
            </div>
            {musicError && <p className="mt-2 text-xs text-destructive">{musicError}</p>}
            </div>
          </div>
        )}
      </div>

      {/* ── Two guest call-in slots (0.75/4 of the screen) ─────────────────────
          Landscape lives are host-only broadcasts, so the call-in row is hidden
          and that space goes to the camera + comment feed instead. The host can
          also hide it in portrait via the guest toggle. */}
      {orientation !== "landscape" && guestsEnabled && (
        <div className="flex flex-[0.75] min-h-0 gap-2 border-t border-white/10 bg-neutral-950 p-2">
          <GuestSlot peer={guests[0]} registerEl={registerPeerVideoEl} onRemove={live ? dropGuest : undefined} />
          <GuestSlot peer={guests[1]} registerEl={registerPeerVideoEl} onRemove={live ? dropGuest : undefined} />
        </div>
      )}

      {/* ── Live chatroom (1.5/4; grows to 1.875 when the guest section is off,
          taking the other half of the freed call-in row) ─────────────────── */}
      <div
        className={cn(
          "min-h-0 border-t border-white/10 bg-neutral-950",
          orientation !== "landscape" && !guestsEnabled ? "flex-[1.875]" : "flex-[1.5]",
        )}
      >
        <LiveChat asHost currentUser={currentUser} roomName={live ? roomName! : undefined} immersive />
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
    </div>
  )
}
