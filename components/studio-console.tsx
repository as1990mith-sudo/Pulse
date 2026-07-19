"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import {
  CheckCircle2,
  ChevronDown,
  Crown,
  Globe,
  HandHeart,
  Loader2,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  Music,
  Palette,
  Pause,
  Phone,
  PhoneOff,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Rewind,
  FastForward,
  Send,
  SkipBack,
  SkipForward,
  Trash2,
  Upload,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import type { CurrentUser } from "@/lib/session"
import { publishShow, updateEpisode } from "@/app/actions/shows"
import {
  startBroadcast,
  endBroadcast,
  joinBroadcast,
  heartbeatBroadcast,
  getCallState,
  respondToCallRequest,
  removeFromStage,
  setLiveTheme,
  makeCoHost,
  setCoHostPermission,
  removeCoHost,
  resolveMusicControl,
  resolveEndSession,
  setPrayerMode,
  type CallRequestView,
  type CoHostPermissions,
  type LiveStreamView,
} from "@/app/actions/live"
import { ManageCoHostMenu, MusicApprovalPrompt, EndSessionPrompt, CoHostsPanel } from "@/components/live/cohost-menu"
import { useLiveAudio } from "@/lib/use-live-audio"
import { uploadMedia } from "@/lib/upload-media"
import { LiveChat } from "@/components/live-chat"
import { CoverArt } from "@/components/cover-art"
import { ShareSheet } from "@/components/share-sheet"
import type { ShareTarget } from "@/lib/share-types"
import { LiveStage, MAX_GUESTS, QualityIcon } from "@/components/live-stage"
import { LiveAudienceSheet } from "@/components/live-audience-sheet"
import { useLivePresence } from "@/lib/use-live-presence"
import { LIVE_THEMES, liveThemeStyle } from "@/lib/live-themes"
import { LIVE_CATEGORIES } from "@/lib/live-categories"
import { LiveBadge } from "@/components/live-badge"
import { ReactionLayer } from "@/components/live-reactions"
import { PrayerOverlay, PrayerEndedToast } from "@/components/conversation/prayer-overlay"
import { BackExitMenu } from "@/components/live-back-menu"
import { CoverUpload } from "@/components/admin/cover-upload"
import { AudioFormatSelector } from "@/components/audio-format-selector"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
}

function formatDuration(s: number) {
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${(m % 60).toString().padStart(2, "0")}m`
}

type EndedSession = { title: string; duration: string; audioBlob: Blob | null; cover: string | null } | null
export type Track = { url: string; name: string }

export function StudioConsole({
  currentUser,
  resumeStream,
  onMinimize,
  onExit,
  onMeta,
}: {
  currentUser: CurrentUser
  // When provided, the host is rejoining an already-live stream of theirs (e.g.
  // after signing back in or reopening their own live URL) instead of starting
  // a new one. The console mounts straight into the on-air state and reconnects.
  resumeStream?: LiveStreamView | null
  onMinimize?: () => void
  onExit?: () => void
  onMeta?: (m: { title: string; cover: string | null; live: boolean; subtitle?: string; roomName?: string | null }) => void
}) {
  const {
    state,
    speakers,
    connect,
    disconnect,
    toggleMic,
    publishMusic,
    setMusicVolume,
    setMusicPlaying,
    seekMusic,
    setMusicLoop,
    setMusicEndedHandler,
    stopMusic,
    startRecording,
    stopRecording,
  } = useLiveAudio()
  // "On air" is an intent that persists across a dropped/recovering connection,
  // so a transient network blip never flips the host back to the offline setup
  // screen (which is what made it feel like the app "signed you out" of a live).
  // The actual transport status lives in state.connected / state.reconnecting.
  // When resuming an already-live broadcast we start on-air immediately so the
  // host lands in the live console (never a flash of the setup screen).
  const [onAir, setOnAir] = useState(!!resumeStream)
  const live = onAir
  // True while we have the intent to broadcast but the transport isn't fully up.
  const reconnecting = onAir && (state.reconnecting || !state.connected)
  const micOn = state.micEnabled
  // Mirrors of values the disconnect-recovery callback needs without going stale.
  const onAirRef = useRef(false)
  const roomNameRef = useRef<string | null>(null)
  const recoverRef = useRef<() => void>(() => {})
  const [elapsed, setElapsed] = useState(0)
  const [title, setTitle] = useState(resumeStream?.title ?? `${currentUser.name} — live session`)
  const [cover, setCover] = useState<string | null>(resumeStream?.cover ?? null)
  // Host-chosen room privacy (only settable before going live). Public rooms are
  // listed in discovery; private rooms are unlisted and link-only.
  const [visibility, setVisibility] = useState<"public" | "private">(resumeStream?.visibility ?? "public")
  // Optional topic category for the session (empty = uncategorised).
  const [category, setCategory] = useState<string>(resumeStream?.category ?? "")
  // Optional free-text room topic (e.g. "Faith & finance"). Not required.
  const [roomTopic, setRoomTopic] = useState<string>(resumeStream?.topic ?? "")
  const [endedSession, setEndedSession] = useState<EndedSession>(null)
  const [roomName, setRoomName] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  // The most recent captured recording blob, kept when the host stops recording
  // mid-session so it can still be published when they go off air.
  const recordedBlobRef = useRef<Blob | null>(null)
  // Which slide-up panel is open. Only one at a time keeps the studio compact.
  const [panel, setPanel] = useState<null | "music" | "people" | "theme" | "cohosts">(null)
  // Confirmation gate before the host ends the live session, so a mis-tap on the
  // back menu can't drop everyone out of the broadcast (mirrors the video studio).
  const [endConfirmOpen, setEndConfirmOpen] = useState(false)
  // Immersive studio theme (persisted server-side, applied live to listeners).
  const [theme, setTheme] = useState(resumeStream?.theme ?? "default")

  // ── Background-music playlist (lifted here so it survives closing the music
  // panel and minimising the whole console — the audio engine itself lives in
  // the persistent useLiveAudio hook, so playback never stops on its own). ──
  const [musicTracks, setMusicTracks] = useState<Track[]>([])
  const [musicActiveIndex, setMusicActiveIndex] = useState<number | null>(null)
  const [musicPlaying, setMusicPlayingState] = useState(false)
  const [musicVolume, setMusicVolumeState] = useState(0.4)
  const [musicMixing, setMusicMixing] = useState(false)
  const [musicError, setMusicError] = useState<string | null>(null)
  // Loop the current track instead of advancing to the next one when it ends.
  const [musicLoop, setMusicLoopState] = useState(false)

  // Mix a playlist track into the broadcast and mark it now-playing.
  async function playMusicTrack(index: number) {
    const track = musicTracks[index]
    if (!track) return
    setMusicError(null)
    setMusicMixing(true)
    try {
      await publishMusic(track.url)
      setMusicVolume(musicVolume)
      setMusicActiveIndex(index)
      setMusicPlayingState(true)
    } catch (err) {
      setMusicError(err instanceof Error ? err.message : "Could not mix the track in.")
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

  function changeMusicVolume(value: number) {
    setMusicVolumeState(value)
    setMusicVolume(value)
  }

  function toggleMusicLoop() {
    const next = !musicLoop
    setMusicLoopState(next)
    setMusicLoop(next)
  }

  // Step to another track in the playlist, wrapping around at the ends.
  function skipMusic(delta: number) {
    if (musicTracks.length === 0) return
    const from = musicActiveIndex ?? (delta > 0 ? -1 : 0)
    const next = (from + delta + musicTracks.length) % musicTracks.length
    void playMusicTrack(next)
  }

  // Auto-advance to the next track when one finishes (unless it's looping).
  useEffect(() => {
    setMusicEndedHandler(() => {
      setMusicActiveIndex((cur) => {
        if (cur === null || musicTracks.length === 0) return cur
        const next = (cur + 1) % musicTracks.length
        void playMusicTrack(next)
        return cur
      })
    })
    return () => setMusicEndedHandler(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicTracks, setMusicEndedHandler])

  // Apply a studio theme: update locally at once (snappy), then persist so the
  // change propagates to every listener via their call-state poll.
  function changeTheme(id: string) {
    setTheme(id)
    if (roomName) void setLiveTheme({ roomName, theme: id }).catch(() => {})
  }

  function removeMusicTrack(index: number) {
    setMusicTracks((arr) => arr.filter((_, i) => i !== index))
    setMusicActiveIndex((cur) => {
      if (cur === null) return cur
      if (index === cur) return null
      return index < cur ? cur - 1 : cur
    })
  }

  // If the host goes off air while music is mixed in, tear it down cleanly.
  useEffect(() => {
    if (!live && musicActiveIndex !== null) {
      setMusicActiveIndex(null)
      setMusicPlayingState(false)
      void stopMusic()
    }
  }, [live, musicActiveIndex, stopMusic])

  const viewers = Math.max(0, state.listeners - 1 - speakers.filter((s) => !s.isLocal).length)

  // Presence-backed audience: gives us the actual listener names (not just a
  // count) so the host can see exactly who is in the room.
  const { count: audienceCount, members: audienceMembers } = useLivePresence(roomName, live)

  // Host polls the call state to surface pending guest requests.
  const { data: callState, mutate: refreshCalls } = useSWR(
    live && roomName ? ["call-state", roomName] : null,
    () => getCallState({ roomName: roomName! }),
    { refreshInterval: 2500 },
  )
  const pending = callState?.pendingRequests ?? []
  const guests = callState?.guests ?? []
  const locked = callState?.locked ?? false

  // ── Shared Prayer Mode ──────────────────────────────────────────────────
  // Reconcile from the polled call state; flash a toast when prayer ends. The
  // host toggles it and every listener sees the same overlay.
  const [prayerStartedAt, setPrayerStartedAt] = useState<string | null>(null)
  const [prayerEndedAt, setPrayerEndedAt] = useState<number | null>(null)
  const prevPrayerRef = useRef<string | null>(null)
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
  // Co-host state from the poll. `coHosts` includes everyone granted co-host
  // status (on the call or off it) so the host can manage them all.
  const coHosts = callState?.coHosts ?? []
  const coHostIds = new Set(coHosts.map((c) => c.userId))
  // When a co-host has taken over the music, the host's own music controls are
  // disabled and handed to them.
  const musicControllerId = callState?.musicControllerId ?? null
  const musicHandedOff = Boolean(musicControllerId)
  const musicApprovalRequest = callState?.musicApprovalRequest ?? null
  // A co-host's pending "end live session" request (host sees a 30s prompt).
  const endRequest = callState?.endRequest ?? null

  // When a co-host takes over track control, the host's own music yields: stop
  // any track the host had mixed in so the two never fight over the bus. When
  // control returns (permission revoked), the host's controls re-enable.
  useEffect(() => {
    if (musicHandedOff && musicActiveIndex !== null) {
      setMusicActiveIndex(null)
      setMusicPlayingState(false)
      void stopMusic()
    }
  }, [musicHandedOff, musicActiveIndex, stopMusic])

  // The speaker whose context menu (Make / Manage Co-Host) is open.
  const [menuSpeaker, setMenuSpeaker] = useState<CallRequestView | null>(null)
  // Keep the open menu's data fresh as the poll updates permissions.
  const liveMenuSpeaker = menuSpeaker
    ? (guests.find((g) => g.userId === menuSpeaker.userId) ?? menuSpeaker)
    : null

  function openSpeakerMenu(identity: string) {
    const g = guests.find((x) => x.userId === identity)
    if (g) setMenuSpeaker(g)
  }

  async function handleMakeCoHost(userId: string) {
    if (!roomName) return
    const res = await makeCoHost({ roomName, userId })
    if (!res.ok && res.error) setError(res.error)
    refreshCalls()
  }
  async function handleTogglePermission(userId: string, permission: keyof CoHostPermissions, enabled: boolean) {
    if (!roomName) return
    const res = await setCoHostPermission({ roomName, userId, permission, enabled })
    if (!res.ok && res.error) setError(res.error)
    refreshCalls()
  }
  async function handleRemoveCoHost(userId: string) {
    if (!roomName) return
    const res = await removeCoHost({ roomName, userId })
    if (!res.ok && res.error) setError(res.error)
    setMenuSpeaker(null)
    refreshCalls()
  }
  async function handleResolveMusic(userId: string, approve: boolean) {
    if (!roomName) return
    await resolveMusicControl({ roomName, userId, approve })
    refreshCalls()
  }
  async function handleResolveEnd(approve: boolean) {
    if (!roomName) return
    await resolveEndSession({ roomName, approve })
    refreshCalls()
  }

  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [live])

  // Keep the app-level mini-player's "now playing" info in sync.
  useEffect(() => {
    onMeta?.({ title, cover, live, subtitle: live ? "You're live" : "Setting up", roomName })
  }, [title, cover, live, onMeta, roomName])

  // Guard against an accidental refresh / tab close while broadcasting — it
  // would silently drop the live stream. The browser shows its native prompt.
  useEffect(() => {
    if (!live) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [live])

  // Keep the refs the recovery callback reads in sync with render state.
  useEffect(() => {
    onAirRef.current = onAir
  }, [onAir])
  useEffect(() => {
    roomNameRef.current = roomName
  }, [roomName])

  // Auto-recover from an unexpected hard disconnect: re-mint a token for the
  // same room and reconnect, so the host is never silently dropped from a live
  // they intended to keep running. If the stream has already ended server-side
  // (e.g. it was cleaned up after being abandoned), finalize gracefully.
  recoverRef.current = async () => {
    const rn = roomNameRef.current
    if (!onAirRef.current || !rn) return
    const res = await joinBroadcast({ roomName: rn }).catch(() => null)
    if (!res || !res.ok) {
      onAirRef.current = false
      setOnAir(false)
      setRoomName(null)
      setError("Your live session ended because the connection was lost.")
      return
    }
    await connect({
      serverUrl: res.serverUrl,
      token: res.token,
      publish: true,
      onDisconnected: () => recoverRef.current(),
    }).catch(() => {})
  }

  // Heartbeat: while on air, ping the server so the stream stays marked live.
  // If the server reports it already ended, stop locally to stay in sync.
  useEffect(() => {
    if (!live || !roomName) return
    let cancelled = false
    const ping = async () => {
      const res = await heartbeatBroadcast({ roomName }).catch(() => null)
      if (!cancelled && res?.ended) {
        onAirRef.current = false
        setOnAir(false)
        await disconnect().catch(() => {})
      }
    }
    void ping()
    const t = setInterval(ping, 20000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [live, roomName, disconnect])

  // Resume an existing live stream the host owns: reconnect as host (publisher)
  // rather than dropping them into the listener view or a fresh setup screen.
  const resumedRef = useRef(false)
  useEffect(() => {
    if (!resumeStream || resumedRef.current) return
    resumedRef.current = true
    const rn = resumeStream.roomName
    void (async () => {
      onAirRef.current = true
      roomNameRef.current = rn
      setOnAir(true)
      setRoomName(rn)
      setEndedSession(null)
      // Approximate the elapsed timer from when the stream actually started.
      const startedMs = new Date(resumeStream.startedAt).getTime()
      setElapsed(Math.max(0, Math.floor((Date.now() - startedMs) / 1000)))
      const res = await joinBroadcast({ roomName: rn }).catch(() => null)
      if (!res || !res.ok) {
        onAirRef.current = false
        setOnAir(false)
        setRoomName(null)
        setError("This live session has already ended.")
        return
      }
      await connect({
        serverUrl: res.serverUrl,
        token: res.token,
        publish: true,
        onDisconnected: () => recoverRef.current(),
      }).catch(() => {})
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeStream])

  async function toggleLive() {
    setError(null)
    if (live) {
      // Clear the on-air intent first so the disconnect isn't treated as a drop
      // that should auto-recover.
      onAirRef.current = false
      setOnAir(false)
      const duration = formatDuration(elapsed)
      const audioBlob = recording ? await stopRecording().catch(() => null) : recordedBlobRef.current
      if (roomName) await endBroadcast({ roomName }).catch(() => {})
      await disconnect()
      setRoomName(null)
      setPanel(null)
      setRecording(false)
      recordedBlobRef.current = null
      // Carry the live session's cover art into the auto-published episode so the
      // media player shows the same artwork that was used on air.
      setEndedSession({ title, duration, audioBlob, cover })
      setElapsed(0)
    } else {
      // Cover art is required for audio live sessions.
      if (!cover) {
        setError("Please add cover artwork before going live.")
        return
      }
      // A category is mandatory — the host must pick one before going live.
      if (!category) {
        setError("Please choose a category before going live.")
        return
      }
      setStarting(true)
      const res = await startBroadcast({ title, cover, visibility, category, topic: roomTopic.trim() || null })
      setStarting(false)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onAirRef.current = true
      roomNameRef.current = res.roomName
      setOnAir(true)
      setRoomName(res.roomName)
      setEndedSession(null)
      setElapsed(0)
      await connect({
        serverUrl: res.serverUrl,
        token: res.token,
        publish: true,
        onDisconnected: () => recoverRef.current(),
      })
      startRecording()
      setRecording(true)
    }
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

  // ── Host setup screen (brand-new broadcast) ──────────────────────────────
  // Mirrors the Conversation "Start a gathering" setup exactly so both audio
  // formats share one interface. Only the category control differs in source
  // (LIVE_CATEGORIES vs the conversation list) — the control itself is the same
  // dropdown. Skipped when resuming/ended so the on-air + summary views show.
  if (!live && !endedSession) {
    return (
      <div className="relative flex h-full flex-col overflow-y-auto bg-zinc-950 text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(70% 55% at 20% 0%, color-mix(in oklch, var(--primary) 40%, transparent), transparent 60%), radial-gradient(70% 55% at 90% 15%, color-mix(in oklch, var(--live-accent) 26%, transparent), transparent 55%)",
          }}
        />
        <div className="relative mx-auto w-full max-w-md px-5 pb-10 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
          <button
            type="button"
            onClick={() => onExit?.()}
            className="mb-6 flex size-10 items-center justify-center rounded-full bg-white/15 ring-1 ring-inset ring-white/15 hover:bg-white/25"
            aria-label="Back"
          >
            <X className="size-5" strokeWidth={2.5} />
          </button>

          <div className="mb-6 space-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
              <Mic className="size-3.5" /> Podcast
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-balance">Start a broadcast</h1>
            <p className="text-sm leading-relaxed text-white/60">
              A host-led room where you hold the mic. Set the scene, choose a category, and open the doors.
            </p>
          </div>

          <div className="space-y-5">
            <AudioFormatSelector active="podcast" />

            <CoverUpload value={cover} onChange={setCover} label="Cover artwork (required)" />

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Room name</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`${currentUser.name} — live session`}
                maxLength={80}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-primary/60 focus:outline-none"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                Topic <span className="text-white/40">(optional)</span>
              </span>
              <input
                value={roomTopic}
                onChange={(e) => setRoomTopic(e.target.value)}
                placeholder="What's this room about?"
                maxLength={120}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-primary/60 focus:outline-none"
              />
            </label>

            {/* Category — the same dropdown selector used across both formats. */}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                Category <span className="text-white/40">(required)</span>
              </span>
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 pr-10 text-sm text-white focus:border-primary/60 focus:outline-none [&>option]:bg-neutral-900 [&>option]:text-white"
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
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-white/50" />
              </div>
            </label>

            {/* Privacy — public (discoverable in Live) vs private (invite-only). */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Privacy</span>
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-white/[0.04] p-1">
                {(
                  [
                    { value: "public", label: "Public", icon: Globe },
                    { value: "private", label: "Private", icon: Lock },
                  ] as const
                ).map((opt) => {
                  const isActive = visibility === opt.value
                  const Icon = opt.icon
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setVisibility(opt.value)}
                      aria-pressed={isActive}
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                        isActive ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white",
                      )}
                    >
                      <Icon className="size-4" /> {opt.label}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-white/50">
                {visibility === "public"
                  ? "Listed in Live for everyone to discover and join."
                  : "Unlisted — only people with the link can join."}
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="button"
              onClick={toggleLive}
              disabled={starting || state.connecting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-[0.99] disabled:opacity-60"
            >
              {starting || state.connecting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Radio className="size-4" strokeWidth={2.5} />
              )}
              {starting || state.connecting ? "Opening the room…" : "Go live"}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-950 text-white transition-[background] duration-700"
      style={{ ...liveThemeStyle(theme), ["--call-accept" as string]: "var(--live-accent)" }}
    >
      {/* Deep vertical wash gives the immersive, full-bleed canvas its depth. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklch, var(--primary) 16%, transparent) 0%, transparent 46%)",
        }}
      />
      {/* Drifting aurora backdrop — the same immersive skin as the listener view. */}
      <div
        aria-hidden="true"
        className="stage-aurora pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(75% 55% at 18% -5%, color-mix(in oklch, var(--primary) 55%, transparent), transparent 60%), radial-gradient(65% 50% at 95% 18%, color-mix(in oklch, var(--live-accent) 32%, transparent), transparent 55%), radial-gradient(90% 60% at 50% 108%, color-mix(in oklch, var(--primary) 30%, transparent), transparent 62%)",
        }}
      />
      {cover && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover || "/placeholder.svg"}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full object-cover opacity-15 blur-3xl"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/40 to-zinc-950/85" />
        </>
      )}

      <div className="relative flex min-h-0 w-full flex-1 flex-col">
        {/* Broadcast header: cover artwork + live indicator + title + stats */}
        <header className="relative z-30 flex items-center gap-3 border-b border-white/[0.07] px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6">
          <BackExitMenu
            showMenu={live}
            exitLabel="End"
            onExit={live ? () => setEndConfirmOpen(true) : (onExit ?? (() => {}))}
            onMinimize={onMinimize ?? (() => {})}
          />
          {/* Compact round cover thumbnail — same footprint as the listener header. */}
          <CoverArt src={cover ?? null} alt={`${title || "Session"} cover art`} />

          <div className="relative min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {live ? (
                <>
                  <LiveBadge />
                  {reconnecting ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-amber-300">
                      <Loader2 className="size-3 animate-spin" />
                      Reconnecting…
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-white/60">
                      <QualityIcon quality={state.connectionQuality} />
                      <span className="capitalize">
                        {state.connectionQuality !== "unknown" ? state.connectionQuality : ""}
                      </span>
                    </span>
                  )}
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white/60">
                  <span className="size-1.5 rounded-full bg-white/40" />
                  Offline
                </span>
              )}
            </div>

            {live ? (
              <h1 className="mt-0.5 truncate text-base font-bold leading-tight tracking-tight text-white">
                {title || "Untitled session"}
              </h1>
            ) : (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Name your session…"
                aria-label="Session title"
                maxLength={80}
                className="mt-0.5 w-full truncate rounded-md border border-transparent bg-transparent text-base font-bold leading-tight tracking-tight text-white outline-none transition-colors placeholder:text-white/40 hover:border-white/20 focus:border-primary focus:bg-white/10 focus:px-2 focus:py-1"
              />
            )}
            <p className="truncate text-xs font-medium text-white/70">{currentUser.name}</p>
          </div>

          {/* While live: a compact listener pill + timer (mirrors the listener
              header). While offline: the Go live action. */}
          {live ? (
            <div className="relative flex shrink-0 flex-col items-end gap-1">
              <LiveAudienceSheet
                count={audienceCount}
                members={audienceMembers}
                immersive
                isHost
                roomName={roomName ?? undefined}
                blockedUsers={callState?.blockedUsers ?? []}
                onChanged={() => void refreshCalls()}
              />
              <span className="font-mono text-[11px] tabular-nums text-white/50">{formatTime(elapsed)}</span>
            </div>
          ) : (
            <Button
              onClick={toggleLive}
              size="sm"
              variant="default"
              className="shrink-0 gap-1.5 rounded-full px-4 font-bold shadow-lg"
              // Cover artwork and a category are required before an audio
              // session can go live.
              disabled={starting || state.connecting || !cover || !category}
            >
              {starting || state.connecting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Radio className="size-4" strokeWidth={2.5} />
              )}
              {starting || state.connecting ? "…" : "Go live"}
            </Button>
          )}
        </header>

        {error && (
          <div className="mx-4 mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground sm:mx-6">
            {error}
          </div>
        )}

        {/* Speaker stage — unified 4-col grid (host first, then guests) */}
        <div className="relative shrink-0 border-b border-white/[0.07] px-4 py-2.5 sm:px-6">
          {/* Status row only appears when there's something to flag, so an idle
              room gives all its vertical space to the call-in slots & chat. */}
          {(locked || pending.length > 0) && (
            <div className="mb-1.5 flex items-center justify-end gap-1.5">
              {locked && (
                <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/60">
                  <Lock className="size-3" /> Locked
                </span>
              )}
              {pending.length > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-live/20 px-2 py-0.5 text-[11px] font-semibold text-live">
                  <Phone className="size-3" /> {pending.length} waiting
                </span>
              )}
            </div>
          )}
          <LiveStage
            host={{ id: currentUser.id, name: currentUser.name, color: currentUser.color, image: currentUser.image }}
            speakers={speakers}
            activeSpeakers={state.activeSpeakers}
            hostQuality={state.connectionQuality}
            isHost
            coHostIds={coHostIds}
            onRemoveGuest={dropGuest}
            onTapSpeaker={openSpeakerMenu}
          />
          {live && roomName && <ReactionLayer roomName={roomName} />}
        </div>

        {/* Host control dock ��� compact essentials, sits right under the stage row */}
        <div className="shrink-0 border-b border-white/[0.07] px-4 py-2.5 sm:px-6">
          <div className="flex items-center justify-center gap-3 sm:gap-4">
            <DockButton
              icon={micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
              label={micOn ? "Mute mic" : "Unmute mic"}
              primary={micOn}
              disabled={!live}
              onClick={() => toggleMic()}
            />
            <DockButton
              icon={<Music className="size-5" />}
              label={
                musicHandedOff
                  ? "A co-host is controlling the music"
                  : musicPlaying
                    ? "Background music (playing)"
                    : "Background music"
              }
              active={panel === "music" || musicPlaying}
              disabled={!live || musicHandedOff}
              onClick={() => setPanel((p) => (p === "music" ? null : "music"))}
            />
            <DockButton
              icon={<HandHeart className="size-5" />}
              label={prayerActive ? "End Prayer Mode" : "Start Prayer Mode"}
              active={prayerActive}
              disabled={!live}
              onClick={() => void togglePrayer()}
            />
            <DockButton
              icon={<Users className="size-5" />}
              label="Manage speakers & audience"
              badge={pending.length}
              active={panel === "people"}
              disabled={!live}
              onClick={() => setPanel((p) => (p === "people" ? null : "people"))}
            />
            <DockButton
              icon={<Palette className="size-5" />}
              label="Studio theme"
              active={panel === "theme"}
              disabled={!live}
              onClick={() => setPanel((p) => (p === "theme" ? null : "theme"))}
            />
            {coHosts.length > 0 && (
              <DockButton
                icon={<Crown className="size-5" />}
                label="Co-hosts"
                badge={coHosts.length}
                active={panel === "cohosts"}
                disabled={!live}
                onClick={() => setPanel((p) => (p === "cohosts" ? null : "cohosts"))}
              />
            )}
            {live && roomName && <ShareButton roomName={roomName} title={title} cover={cover} />}
          </div>
        </div>

        {/* Live chat — flows as one with the room, filling all remaining space */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden pb-safe">
          <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-4 sm:px-6">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/60">
              <MessageSquare className="size-3.5 text-primary" /> Live chat
            </h2>
            <span className="text-[11px] text-white/40">
              {guests.length}/{MAX_GUESTS} on stage
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <LiveChat asHost immersive showResourceButton currentUser={currentUser} roomName={roomName ?? undefined} />
          </div>
        </section>
      </div>

      {/* Slide-up panels */}
      {panel === "people" && (
        <PeoplePanel
          roomName={roomName}
          pending={pending}
          guests={guests}
          viewers={viewers}
          onAccept={acceptCall}
          onDecline={declineCall}
          onRemove={dropGuest}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "theme" && (
        <ThemePanel current={theme} onSelect={changeTheme} onClose={() => setPanel(null)} />
      )}
      {panel === "cohosts" && (
        <CoHostsPanel
          coHosts={coHosts}
          onTogglePermission={(userId, permission, enabled) =>
            void handleTogglePermission(userId, permission, enabled)
          }
          onRemoveCoHost={(userId) => void handleRemoveCoHost(userId)}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "music" && (
        <MusicPanel
          live={live}
          position={state.musicPosition}
          duration={state.musicDuration}
          tracks={musicTracks}
          activeIndex={musicActiveIndex}
          playing={musicPlaying}
          volume={musicVolume}
          mixing={musicMixing}
          error={musicError}
          loop={musicLoop}
          onAddTracks={(added) => setMusicTracks((t) => [...t, ...added])}
          onPlayTrack={playMusicTrack}
          onTogglePlay={toggleMusicPlay}
          onNext={() => skipMusic(1)}
          onPrev={() => skipMusic(-1)}
          onToggleLoop={toggleMusicLoop}
          onVolume={changeMusicVolume}
          onSeek={seekMusic}
          onRemoveTrack={removeMusicTrack}
          onError={setMusicError}
          onClose={() => setPanel(null)}
        />
      )}

      {/* Tap-a-speaker context menu: Make Co-Host / Manage Co-Host (host only). */}
      {liveMenuSpeaker && (
        <ManageCoHostMenu
          speaker={liveMenuSpeaker}
          onMakeCoHost={() => void handleMakeCoHost(liveMenuSpeaker.userId)}
          onTogglePermission={(permission, enabled) =>
            void handleTogglePermission(liveMenuSpeaker.userId, permission, enabled)
          }
          onRemoveCoHost={() => void handleRemoveCoHost(liveMenuSpeaker.userId)}
          onClose={() => setMenuSpeaker(null)}
        />
      )}

      {/* A track-controlling co-host's first music request awaits host approval. */}
      {musicApprovalRequest && (
        <MusicApprovalPrompt
          request={musicApprovalRequest}
          onApprove={() => void handleResolveMusic(musicApprovalRequest.userId, true)}
          onDecline={() => void handleResolveMusic(musicApprovalRequest.userId, false)}
        />
      )}

      {/* A co-host asked to end the live: 30s countdown to End now / Keep live. */}
      {endRequest && (
        <EndSessionPrompt
          byName={endRequest.byName}
          remainingMs={endRequest.remainingMs}
          onApprove={() => void handleResolveEnd(true)}
          onDecline={() => void handleResolveEnd(false)}
        />
      )}

      {endedSession && (
        <PublishOverlay
          session={endedSession}
          onClose={() => setEndedSession(null)}
          onExit={() => {
            setEndedSession(null)
            onExit?.()
          }}
        />
      )}

      {/* End-session confirmation — the host must confirm before the broadcast
          is torn down for everyone listening (mirrors the video studio). */}
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
            aria-labelledby="end-audio-live-title"
            className="relative z-10 w-full max-w-xs rounded-3xl border border-white/10 bg-zinc-900/95 p-6 text-center shadow-2xl backdrop-blur-xl"
          >
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <Radio className="size-6" />
            </div>
            <h2 id="end-audio-live-title" className="text-lg font-semibold text-white">
              End this live session?
            </h2>
            <p className="mt-1.5 text-sm text-white/60 text-pretty">
              Your broadcast will stop and everyone listening will be disconnected. This can&apos;t be undone.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setEndConfirmOpen(false)
                  void toggleLive()
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
    </div>
  )
}

function DockButton({
  icon,
  label,
  badge = 0,
  active,
  primary,
  recording,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  badge?: number
  active?: boolean
  primary?: boolean
  recording?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "group relative flex size-12 shrink-0 items-center justify-center rounded-full ring-1 ring-inset backdrop-blur-xl transition-all duration-300 ease-out hover:-translate-y-0.5 active:scale-95 active:translate-y-0 disabled:pointer-events-none disabled:opacity-40 [&>svg]:relative [&>svg]:z-10 [&>svg]:size-[21px] [&>svg]:[stroke-width:2]",
        // Inner top highlight + soft ambient depth shadow on every state.
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_6px_20px_-6px_rgba(0,0,0,0.7)]",
        recording
          ? "bg-gradient-to-b from-live to-live/85 text-live-foreground ring-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_8px_28px_-6px_var(--live)]"
          : primary
            ? "bg-gradient-to-b from-call-accept to-call-accept/85 text-call-accept-foreground ring-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_8px_28px_-6px_var(--call-accept)]"
            : active
              ? "bg-gradient-to-b from-primary to-primary/85 text-primary-foreground ring-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_8px_28px_-6px_var(--primary)]"
              : "bg-gradient-to-b from-white/[0.14] to-white/[0.04] text-white/90 ring-white/15 hover:from-white/20 hover:to-white/[0.08] hover:text-white hover:ring-white/25",
      )}
    >
      {icon}
      {badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 z-20 flex size-[18px] items-center justify-center rounded-full bg-gradient-to-b from-live to-live/80 text-[10px] font-bold text-live-foreground shadow-[0_2px_6px_-1px_var(--live)] ring-2 ring-zinc-950">
          {badge}
        </span>
      )}
    </button>
  )
}

/** Bottom sheet shell shared by all studio panels. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 max-h-[80dvh] w-full overflow-y-auto rounded-t-2xl border border-border/60 bg-card p-4 sm:max-w-md sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <Button type="button" size="icon" variant="ghost" className="size-8" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ShareButton({ roomName, title, cover }: { roomName: string; title?: string; cover?: string | null }) {
  // Uses the same kite/Send icon and ShareSheet flow as sharing a post.
  const [open, setOpen] = useState(false)
  const shareTarget: ShareTarget = {
    type: "live",
    key: roomName,
    title: title || "Live on Frequency",
    subtitle: "Join my live session on Frequency",
    url: `/live/${roomName}`,
    image: cover ?? null,
    downloadUrl: null,
    downloadKind: null,
  }
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Share room"
        title="Share room"
        className="group relative flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-white/[0.14] to-white/[0.04] text-white/90 ring-1 ring-inset ring-white/15 backdrop-blur-xl transition-all duration-300 ease-out hover:-translate-y-0.5 hover:from-white/20 hover:to-white/[0.08] hover:text-white hover:ring-white/25 active:translate-y-0 active:scale-95 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_6px_20px_-6px_rgba(0,0,0,0.7)] [&>svg]:relative [&>svg]:z-10 [&>svg]:size-[21px] [&>svg]:stroke-[2]"
      >
        <Send />
      </button>
      <ShareSheet target={shareTarget} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** Theme panel: a gallery of immersive studio themes applied live to everyone. */
function ThemePanel({
  current,
  onSelect,
  onClose,
}: {
  current: string
  onSelect: (id: string) => void
  onClose: () => void
}) {
  return (
    <Sheet title="Studio theme" onClose={onClose}>
      <p className="mb-3 text-sm text-muted-foreground">
        Set the mood of your room. Themes apply instantly to you and everyone listening.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {LIVE_THEMES.map((t) => {
          const active = t.id === current
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              aria-pressed={active}
              className={cn(
                "group relative overflow-hidden rounded-2xl p-3 text-left ring-1 ring-inset transition-all",
                active ? "ring-2 ring-primary" : "ring-border hover:ring-foreground/30",
              )}
              style={liveThemeStyle(t.id)}
            >
              {/* Preview swatch using the theme's own background + accent. */}
              <div className="mb-8 flex items-center gap-1.5">
                <span
                  className="size-6 rounded-full ring-1 ring-white/20"
                  style={{ background: t.primary }}
                />
                <span
                  className="size-6 rounded-full ring-1 ring-white/20"
                  style={{ background: t.accent }}
                />
                {active && (
                  <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <CheckCircle2 className="size-4" />
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-white drop-shadow">{t.name}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-white/70 drop-shadow">{t.description}</p>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}

/** People panel: pending call-in requests, current guests, listener invites. */
export function PeoplePanel({
  roomName,
  pending,
  guests,
  viewers,
  onAccept,
  onDecline,
  onRemove,
  onClose,
}: {
  roomName: string | null
  pending: CallRequestView[]
  guests: CallRequestView[]
  viewers: number
  onAccept: (id: number) => void
  onDecline: (id: number) => void
  // Omitted for co-hosts, who can't remove speakers (host-only server action).
  onRemove?: (identity: string) => void
  onClose: () => void
}) {
  return (
    <Sheet title="Speakers & audience" onClose={onClose}>
      <div className="space-y-4">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="size-4" /> {viewers.toLocaleString()} listening
        </p>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Requests to join {pending.length > 0 && `(${pending.length})`}
          </h3>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending requests.</p>
          ) : (
            <ul className="space-y-2">
              {pending.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn("flex size-8 items-center justify-center rounded-full text-xs font-semibold", r.color)}>
                      {r.initials}
                    </span>
                    <span className="truncate text-sm">{r.userName}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" className="h-8 gap-1 bg-call-accept text-call-accept-foreground hover:bg-call-accept/90" onClick={() => onAccept(r.id)}>
                      <Phone className="size-3.5" /> Accept
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => onDecline(r.id)} aria-label="Decline">
                      <PhoneOff className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            On stage {guests.length > 0 && `(${guests.length}/3)`}
          </h3>
          {guests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No guests on stage yet.</p>
          ) : (
            <ul className="space-y-2">
              {guests.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn("flex size-8 items-center justify-center rounded-full text-xs font-semibold", g.color)}>
                      {g.initials}
                    </span>
                    <span className="truncate text-sm">{g.userName}</span>
                  </div>
                  {onRemove && (
                    <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => onRemove(g.userId)} disabled={!roomName}>
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Sheet>
  )
}

/** How many backing tracks the host can keep queued at once. */
const MAX_MUSIC_TRACKS = 5

/**
 * Background music: a premium multi-track playlist with a now-playing card
 * (scrubber + volume) and a queue. All playback state is owned by the parent
 * console (so it survives closing this panel / minimising the studio); this
 * component is fully controlled and only owns the transient upload spinner.
 */
export function MusicPanel({
  live,
  position,
  duration,
  tracks,
  activeIndex,
  playing,
  volume,
  mixing,
  loop,
  error,
  onAddTracks,
  onPlayTrack,
  onTogglePlay,
  onNext,
  onPrev,
  onToggleLoop,
  onVolume,
  onSeek,
  onRemoveTrack,
  onError,
  onClose,
}: {
  live: boolean
  position: number
  duration: number
  tracks: Track[]
  activeIndex: number | null
  playing: boolean
  volume: number
  mixing: boolean
  loop: boolean
  error: string | null
  onAddTracks: (tracks: Track[]) => void
  onPlayTrack: (index: number) => void
  onTogglePlay: () => void
  onNext: () => void
  onPrev: () => void
  onToggleLoop: () => void
  onVolume: (value: number) => void
  onSeek: (seconds: number) => void
  onRemoveTrack: (index: number) => void
  onError: (message: string | null) => void
  onClose: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const activeTrack = activeIndex !== null ? tracks[activeIndex] : null
  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0
  const canAdd = tracks.length < MAX_MUSIC_TRACKS

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    onError(null)
    setUploading(true)
    try {
      const room = MAX_MUSIC_TRACKS - tracks.length
      const added: Track[] = []
      for (const file of files.slice(0, room)) {
        if (!file.type.startsWith("audio/")) continue
        const data = await uploadMedia(file, "live-music")
        added.push({ url: data.url, name: data.name ?? file.name })
      }
      if (added.length) onAddTracks(added)
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <Sheet title="Background music" onClose={onClose}>
      <div className="space-y-4">
        <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={handlePick} />

        {/* ── Now playing: premium control surface ── */}
        {activeTrack && (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-secondary/60 to-card p-4 shadow-lg">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "relative flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-inset ring-primary/20",
                  playing && "animate-pulse",
                )}
              >
                <Music className="size-5" strokeWidth={2.5} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Now playing</p>
                <p className="truncate text-sm font-semibold text-foreground">{activeTrack.name}</p>
              </div>
              {/* Loop / replay toggle */}
              <button
                type="button"
                onClick={onToggleLoop}
                aria-pressed={loop}
                aria-label={loop ? "Looping current track" : "Loop current track"}
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full ring-1 ring-inset transition-colors",
                  loop
                    ? "bg-primary/15 text-primary ring-primary/30"
                    : "text-muted-foreground ring-border/60 hover:text-foreground",
                )}
              >
                {loop ? <Repeat1 className="size-4" strokeWidth={2.5} /> : <Repeat className="size-4" strokeWidth={2.5} />}
              </button>
            </div>

            {/* Transport: previous / play-pause / next */}
            <div className="mt-3 flex items-center justify-center gap-5">
              <button
                type="button"
                onClick={onPrev}
                disabled={!live || mixing || tracks.length < 2}
                aria-label="Previous track"
                className="text-foreground/80 transition-colors hover:text-foreground disabled:opacity-40"
              >
                <SkipBack className="size-5 fill-current" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={onTogglePlay}
                disabled={!live || mixing}
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95 disabled:opacity-50"
                aria-label={playing ? "Pause" : "Play"}
              >
                {mixing ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : playing ? (
                  <Pause className="size-5" strokeWidth={2.5} />
                ) : (
                  <Play className="size-5 translate-x-0.5" strokeWidth={2.5} />
                )}
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={!live || mixing || tracks.length < 2}
                aria-label="Next track"
                className="text-foreground/80 transition-colors hover:text-foreground disabled:opacity-40"
              >
                <SkipForward className="size-5 fill-current" strokeWidth={2} />
              </button>
            </div>

            {/* Scrubber */}
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSeek(Math.max(0, position - 15))}
                aria-label="Back 15 seconds"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <Rewind className="size-4" strokeWidth={2.5} />
              </button>
              <div className="relative h-2 flex-1">
                <div className="absolute inset-0 rounded-full bg-muted" />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary"
                  style={{ width: `${progress}%` }}
                />
                <span
                  className="pointer-events-none absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-primary shadow ring-2 ring-card"
                  style={{ left: `calc(${progress}% - 7px)` }}
                />
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={1}
                  value={Math.min(position, duration || 0)}
                  onChange={(e) => onSeek(Number(e.target.value))}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  aria-label="Seek background music"
                />
              </div>
              <button
                type="button"
                onClick={() => onSeek(position + 15)}
                aria-label="Forward 15 seconds"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <FastForward className="size-4" strokeWidth={2.5} />
              </button>
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
              <span>{formatTime(position)}</span>
              <span>{formatTime(duration || 0)}</span>
            </div>

            {/* Volume */}
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => onVolume(volume === 0 ? 0.4 : 0)}
                aria-label={volume === 0 ? "Unmute music" : "Mute music"}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {volume === 0 ? <VolumeX className="size-4" strokeWidth={2.5} /> : <Volume2 className="size-4" strokeWidth={2.5} />}
              </button>
              <div className="relative h-2 flex-1">
                <div className="absolute inset-0 rounded-full bg-muted" />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
                  style={{ width: `${volume * 100}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => onVolume(Number(e.target.value))}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  aria-label="Music volume"
                />
              </div>
              <span className="w-9 text-right text-xs font-medium tabular-nums text-muted-foreground">
                {Math.round(volume * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* ── Queue ── */}
        <div>
          <div className="mb-2 flex items-center justify-between px-0.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Playlist</h3>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {tracks.length}/{MAX_MUSIC_TRACKS}
            </span>
          </div>
          {tracks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
              Add up to {MAX_MUSIC_TRACKS} tracks to mix into your broadcast.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {tracks.map((t, i) => {
                const isActive = activeIndex === i
                return (
                  <li
                    key={t.url}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-xl border p-2 transition-colors",
                      isActive ? "border-primary/40 bg-primary/5" : "border-border/60",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onPlayTrack(i)}
                      disabled={!live || mixing}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:opacity-50"
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full",
                          isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
                        )}
                      >
                        {isActive && playing ? <EqBars /> : <Play className="size-3.5 translate-x-px" strokeWidth={2.5} />}
                      </span>
                      <span className={cn("truncate text-sm", isActive ? "font-semibold text-foreground" : "text-foreground/90")}>
                        {t.name}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveTrack(i)}
                      aria-label={`Remove ${t.name}`}
                      className="shrink-0 p-1 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <Button
          type="button"
          variant="secondary"
          className="w-full gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !canAdd}
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {uploading ? "Uploading…" : canAdd ? "Add tracks" : "Playlist full"}
        </Button>
        {!live && <p className="text-xs text-muted-foreground">Go live to mix music into your broadcast.</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Sheet>
  )
}

/** Tiny three-bar equalizer shown on the currently playing queue item. */
function EqBars() {
  return (
    <span className="flex h-3.5 items-end gap-0.5" aria-hidden>
      <span className="h-full w-0.5 origin-bottom animate-eq-bounce rounded-full bg-current [animation-delay:-0.2s]" />
      <span className="h-full w-0.5 origin-bottom animate-eq-bounce rounded-full bg-current" />
      <span className="h-full w-0.5 origin-bottom animate-eq-bounce rounded-full bg-current [animation-delay:-0.4s]" />
    </span>
  )
}

/**
 * Post-session overlay. Sessions AUTO-PUBLISH to the host's catalogue the moment
 * they go off air: on mount we upload any captured audio and create the episode
 * with its live title. The host can then optionally refine the title,
 * description, and cover (saved back to the same episode) or just close.
 */
function PublishOverlay({
  session,
  onClose,
  onExit,
}: {
  session: { title: string; duration: string; audioBlob: Blob | null; cover: string | null }
  onClose: () => void
  // Called once auto-publishing finishes so the host is returned to the Live tab.
  onExit: () => void
}) {
  const router = useRouter()
  const [isSaving, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Publishing lifecycle: "publishing" → "published" (or "failed").
  const [phase, setPhase] = useState<"publishing" | "published" | "failed">("publishing")
  const [slug, setSlug] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)

  const [title, setTitle] = useState(session.title)
  const [description, setDescription] = useState("")
  // Default to the live session's cover so the published episode keeps the same
  // artwork; the host can still swap it during the recap.
  const [cover, setCover] = useState<string | null>(session.cover)

  // Auto-publish exactly once when the overlay mounts.
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    ;(async () => {
      let audioUrl: string | null = null
      if (session.audioBlob) {
        try {
          const ext = session.audioBlob.type.includes("mp4") ? "mp4" : "webm"
          const file = new File([session.audioBlob], `session.${ext}`, { type: session.audioBlob.type })
          const data = await uploadMedia(file, "episodes")
          audioUrl = data.url
        } catch {
          // publish without audio rather than failing
        }
      }
      const res = await publishShow({
        title: session.title,
        tagline: "",
        category: "",
        duration: session.duration,
        description: "",
        // Reuse the live session's cover art for the auto-published episode.
        cover: session.cover,
        audioUrl,
        // Auto-published from a live session → files under the catalogue's Live tab.
        source: "live",
      })
      if (res.ok) {
        setSlug(res.slug)
        setPhase("published")
        router.refresh()
        // Auto-publish is complete — return the host to the Live tab. The new
        // episode is published and remains editable from their profile catalogue.
        onExit()
      } else {
        setError(res.error)
        setPhase("failed")
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist optional refinements back onto the auto-published episode.
  function saveDetails(e: React.FormEvent) {
    e.preventDefault()
    if (!slug) return
    setError(null)
    setSavedNote(false)
    startTransition(async () => {
      const res = await updateEpisode({ slug, title, description, cover })
      if (res.ok) {
        setSavedNote(true)
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <Sheet
      title={phase === "publishing" ? "Publishing…" : phase === "failed" ? "Couldn't publish" : "Published to your catalogue"}
      onClose={onClose}
    >
      {phase === "publishing" ? (
        <div className="space-y-3 py-8 text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-primary" />
          <p className="font-semibold">Adding this session to your catalogue…</p>
          <p className="text-sm text-muted-foreground">
            {session.audioBlob ? "Uploading audio for on-demand playback." : "Saving your show page."}
          </p>
        </div>
      ) : phase === "failed" ? (
        <div className="space-y-3 py-4 text-center">
          <p className="font-semibold">We couldn&apos;t publish this session.</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <form onSubmit={saveDetails} className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>Live on your profile. Recorded {session.duration}. Add details below (optional).</span>
          </div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Episode title" aria-label="Episode title" />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was this session about?" className="min-h-20" aria-label="Description" />
          <CoverUpload value={cover} onChange={setCover} label="Cover art" />
          {error && <p className="text-sm text-destructive">{error}</p>}
          {savedNote && <p className="text-sm text-primary">Details saved.</p>}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Save details
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Done
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  )
}
