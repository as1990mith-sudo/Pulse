"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { AnimatePresence, motion } from "motion/react"
import {
  BookOpen,
  ChevronDown,
  Globe,
  HandHeart,
  Loader2,
  Lock,
  LockOpen,
  MessageSquare,
  Mic,
  MicOff,
  Music,
  Palette,
  Radio,
  Settings2,
  Share2,
  Sparkles,
  UserMinus,
  UserPlus,
  Pin,
  PinOff,
  Volume2,
  X,
} from "lucide-react"
import { BackExitMenu } from "@/components/live-back-menu"
import { SaveEpisodePrompt } from "@/components/live/save-episode-prompt"
import { LiveChat } from "@/components/live-chat"
import { ShareSheet } from "@/components/share-sheet"
import type { ShareTarget } from "@/lib/share-types"
import { ActionSheet, type SheetAction } from "@/components/action-sheet"
import { CoverArt } from "@/components/cover-art"
import { MarqueeTitle } from "@/components/marquee-title"
import { CoverUpload, SQUARE_RATIO } from "@/components/admin/cover-upload"
import { AudioFormatSelector } from "@/components/audio-format-selector"
import { LiveAudienceSheet } from "@/components/live-audience-sheet"
import { ParticipantGrid, type GridParticipant } from "@/components/conversation/participant-grid"
import { FloatingMessages } from "@/components/conversation/floating-messages"
import { SnowOverlay } from "@/components/conversation/snow-overlay"
import { MusicPanel, type Track } from "@/components/studio-console"
import { useLiveResourcesOptional } from "@/components/live/resource/resource-context"
import { ConversationThemeSheet } from "@/components/conversation/conversation-theme-sheet"
import { useLiveAudio } from "@/lib/use-live-audio"
import { useLivePresence } from "@/lib/use-live-presence"
import { getAvatarColor } from "@/lib/identity"
import { liveThemeStyle } from "@/lib/live-themes"
import { CONVERSATION_CATEGORIES } from "@/lib/live-categories"
import {
  startBroadcast,
  joinBroadcast,
  endBroadcast,
  heartbeatBroadcast,
  getConversationState,
  getLiveChat,
  setPinnedParticipant,
  setRoomLock,
  setLiveTheme,
  muteParticipant,
  removeFromStage,
  type LiveStreamView,
  type LiveChatMessageView,
} from "@/app/actions/live"
import { publishShow } from "@/app/actions/shows"
import { LiveJoinGate } from "@/components/live-join-gate"
import { uploadMedia } from "@/lib/upload-media"
import type { CurrentUser } from "@/lib/session"
import { cn } from "@/lib/utils"

type Meta = { title: string; cover: string | null; live: boolean; subtitle?: string; roomName?: string | null }

/** Elapsed clock formatting (M:SS / H:MM:SS). */
function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m)
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`
}

/** A round control button used along the bottom dock. */
function DockButton({
  label,
  onClick,
  disabled,
  active,
  tone = "default",
  children,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  tone?: "default" | "live" | "danger"
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
        "flex size-12 items-center justify-center rounded-full shadow-xl ring-1 ring-inset transition-all hover:scale-105 active:scale-95 disabled:opacity-50 [&>svg]:size-[22px] [&>svg]:stroke-[2.5]",
        tone === "danger"
          ? "bg-destructive text-white shadow-destructive/40 ring-white/25 hover:bg-destructive/90"
          : active
            ? "bg-primary text-primary-foreground shadow-primary/40 ring-white/25"
            : "bg-white/15 text-white ring-white/20 hover:bg-white/25",
      )}
    >
      {children}
    </button>
  )
}

export function ConversationRoom({
  mode,
  currentUser = null,
  currentUserId = null,
  stream,
  resumeStream,
  canJoin = true,
  onMinimize,
  onExit,
  onMeta,
}: {
  mode: "host" | "participant"
  currentUser?: CurrentUser | null
  currentUserId?: string | null
  stream?: LiveStreamView
  resumeStream?: LiveStreamView | null
  canJoin?: boolean
  onMinimize?: (to?: string) => void
  onExit?: () => void
  onMeta?: (m: Meta) => void
}) {
  const router = useRouter()
  const isHostMode = mode === "host"
  const viewerId = currentUserId ?? currentUser?.id ?? null

  // The existing stream row, if any (resume for host, or the joined room for a
  // participant). Null only when a host is setting up a brand-new room.
  const streamData = resumeStream ?? stream ?? null

  const {
    state,
    speakers,
    connect,
    disconnect,
    toggleMic,
    startAudioPlayback,
    publishMusic,
    setMusicVolume,
    setMusicPlaying,
    setMusicLoop,
    seekMusic,
    setMusicEndedHandler,
    duckMusic,
    stopMusic,
    startRecording,
    stopRecording,
  } = useLiveAudio()

  // ── Setup (host, brand-new room) ─────────────────────────────────────────
  const [setupTitle, setSetupTitle] = useState("")
  const [setupTopic, setSetupTopic] = useState("")
  const [setupCover, setSetupCover] = useState<string | null>(null)
  const [setupCategory, setSetupCategory] = useState<string>(CONVERSATION_CATEGORIES[0])
  const [setupVisibility, setSetupVisibility] = useState<"public" | "private">("public")
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Live room identity ─────────────────────────────────────────────────
  const [roomName, setRoomName] = useState<string | null>(streamData?.roomName ?? null)
  const [live, setLive] = useState<boolean>(Boolean(streamData))
  const hostId = isHostMode ? currentUser!.id : stream!.hostId
  const hostName = isHostMode ? currentUser!.name : stream!.hostName
  const isHost = viewerId != null && viewerId === hostId

  // Room display data (falls back to setup fields for a fresh host room).
  const title = streamData?.title ?? (setupTitle.trim() || `${hostName} — gathering`)
  const cover = streamData?.cover ?? setupCover
  const topic = streamData?.topic ?? (setupTopic.trim() || null)
  const category = streamData?.category ?? setupCategory

  // ── Connection lifecycle ─────────────────────────────────────────────────
  const startedRef = useRef(false)
  const [connecting, setConnecting] = useState(false)
  const [arrived, setArrived] = useState(false)
  // Public-live guest flow: joinBroadcast returned `needsIdentity`, so we show
  // the display-name gate and let the guest name themselves before connecting.
  const [needIdentity, setNeedIdentity] = useState(false)
  // As people settle into the room, the tall header collapses into a compact
  // sticky bar to hand more space to the participant grid.
  const [autoCompact, setAutoCompact] = useState(false)
  useEffect(() => {
    if (!arrived) return
    const t = setTimeout(() => setAutoCompact(true), 5000)
    return () => clearTimeout(t)
  }, [arrived])

  // Join (or resume) the room as a participant. Extracted so the public-live
  // display-name gate can re-invoke it after a guest names themselves.
  const connectParticipant = useCallback(async () => {
    setConnecting(true)
    const rn = streamData!.roomName
    const res = await joinBroadcast({ roomName: rn })
    if (!res.ok) {
      setConnecting(false)
      // Public live + no display name yet: show the "Join Live" gate. The gate's
      // onJoined re-calls connectParticipant once the guest has a name.
      if (res.needsIdentity) {
        setNeedIdentity(true)
        return
      }
      setError(res.error)
      setEnded(true)
      return
    }
    setNeedIdentity(false)
    setRoomName(rn)
    setLive(true)
    await connect({
      serverUrl: res.serverUrl,
      token: res.token,
      publish: res.canPublish,
      // Participants arrive muted; the host resumes with their mic ready.
      muted: !isHost,
    })
    // Only the host records the room (to save it as an episode later).
    if (isHost) {
      startRecording()
      setRecording(true)
    }
    setConnecting(false)
    setTimeout(() => setArrived(true), 900)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Participant / resume: join an existing room immediately.
  useEffect(() => {
    if (isHostMode && !resumeStream) return // fresh host → wait for setup
    if (!canJoin) return
    if (startedRef.current) return
    startedRef.current = true
    void connectParticipant()
    return () => {
      void disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fresh host: go live from the setup screen.
  async function goLive() {
    setError(null)
    if (!setupCover) {
      setError("Add a cover image so people can recognise your room.")
      return
    }
    setStarting(true)
    const res = await startBroadcast({
      title: setupTitle.trim() || `${hostName} — gathering`,
      cover: setupCover,
      category: setupCategory,
      mode: "audio",
      layout: "conversation",
      topic: setupTopic.trim() || null,
      visibility: setupVisibility,
    })
    setStarting(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setRoomName(res.roomName)
    setLive(true)
    startedRef.current = true
    await connect({ serverUrl: res.serverUrl, token: res.token, publish: true })
    // Record the gathering (host side) so it can be saved as an episode on end.
    startRecording()
    setRecording(true)
    setArrived(true)
  }

  // ── Shared room state (pin, lock, ended) ─────────────────────────────────
  const [pinnedId, setPinnedId] = useState<string | null>(streamData?.gridPinnedId ?? null)
  const [locked, setLocked] = useState<boolean>(streamData?.locked ?? false)
  const [theme, setThemeState] = useState<string>(streamData?.theme ?? "default")
  const [ended, setEnded] = useState(false)
  const [hostEnded, setHostEnded] = useState(false)

  // ── Recording + post-end "save as episode?" decision (host only) ──────────
  const [recording, setRecording] = useState(false)
  // Held so we can finalize the recording lazily — only if the host chooses to
  // save — without blocking room teardown for everyone else.
  const recordingPromiseRef = useRef<Promise<Blob | null> | null>(null)
  const [saveDecision, setSaveDecision] = useState<{ title: string; duration: string; cover: string | null } | null>(
    null,
  )
  const [savingEpisode, setSavingEpisode] = useState(false)

  // Host-only UI: consolidated host-controls menu, theme picker, cover lightbox.
  const [hostMenuOpen, setHostMenuOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)

  // Host heartbeat: while the room is live, the host pings every 20s so the
  // stream's lastSeenAt stays fresh and the 60s stale-stream sweep never
  // auto-ends a conversation the host didn't end himself (which previously
  // kicked every participant out abruptly). Only the host pings —
  // heartbeatBroadcast only refreshes the host's own row — and we deliberately
  // do NOT act on a transient `ended` response so the host is never silently
  // dropped; the next ping re-marks the stream live.
  useEffect(() => {
    if (!isHost || !roomName || !live) return
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
  }, [isHost, roomName, live])

  useEffect(() => {
    if (!roomName || !live) return
    let cancelled = false
    const tick = async () => {
      try {
        const s = await getConversationState({ roomName })
        if (cancelled) return
        if (s.ended) {
          if (!isHost) {
            setHostEnded(true)
            void disconnect()
            setTimeout(() => (onExit ? onExit() : router.push("/live")), 2600)
          }
          return
        }
        setPinnedId(s.pinnedId)
        setLocked(s.locked)
        // Participants follow the host's theme; the host keeps their own local
        // (snappy) value so a stale poll never reverts a just-made change.
        if (!isHost) setThemeState(s.theme)
      } catch {
        // transient — next tick retries
      }
    }
    void tick()
    const iv = setInterval(tick, 3000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, live])


  // ── Chat (for floating messages when the panel is closed) ────────────────
  const { data: chatMessages = [] } = useSWR<LiveChatMessageView[]>(
    roomName && live ? ["conv-chat", roomName] : null,
    () => getLiveChat({ roomName: roomName! }),
    { refreshInterval: 2500, revalidateOnFocus: false },
  )

  // ── Presence (audience count + members) ──────────────────────────────────
  const { count: presenceCount, members: presenceMembers } = useLivePresence(roomName, state.connected)

  // ── Elapsed clock ────────────────────────────────────────────────────────
  const [elapsed, setElapsed] = useState(0)
  const startedAtRef = useRef<number | null>(null)
  useEffect(() => {
    if (!state.connected) return
    if (startedAtRef.current == null) {
      const base = streamData?.startedAt ? new Date(streamData.startedAt).getTime() : Date.now()
      startedAtRef.current = base
    }
    const iv = setInterval(() => {
      if (startedAtRef.current != null) setElapsed((Date.now() - startedAtRef.current) / 1000)
    }, 1000)
    return () => clearInterval(iv)
  }, [state.connected, streamData?.startedAt])

  // ── Meta sync for the mini-player ────────────────────────────────────────
  useEffect(() => {
    if (!live) return
    onMeta?.({ title, cover: cover ?? null, live: true, subtitle: `Conversation · ${hostName}`, roomName })
  }, [live, title, cover, hostName, onMeta, roomName])

  // ── Background music playlist (host only) + speech ducking ─────────────────
  // Uses the exact same rich playlist panel as podcast studio mode (MusicPanel):
  // a queue of up to a handful of tracks with transport, scrubber, loop and
  // volume, all mixed into the broadcast and auto-ducked under active speakers.
  const [musicTracks, setMusicTracks] = useState<Track[]>([])
  const [musicActiveIndex, setMusicActiveIndex] = useState<number | null>(null)
  const [musicPlaying, setMusicPlayingState] = useState(false)
  // Clear default (0.8) so background music isn't muffled by the mic's echo
  // cancellation, which suppresses the host's own loudspeaker output.
  const [musicVolume, setMusicVolumeState] = useState(0.8)
  const [musicMixing, setMusicMixing] = useState(false)
  const [musicLoop, setMusicLoopState] = useState(false)
  const [musicError, setMusicError] = useState<string | null>(null)
  const [musicOpen, setMusicOpen] = useState(false)
  // Host choice: whether the background music automatically dips under live
  // speech (default on). When off, music holds at the host's set volume.
  const [duckEnabled, setDuckEnabled] = useState(true)

  // Release-hold timer so the music doesn't "pump" up and down between words:
  // it only rises back to full once the room has been quiet for a moment.
  const duckReleaseRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sidechain ducking (host-toggleable). While anyone in the room is actively
  // speaking (host or guest), dip the background music so voices cut through
  // cleanly — and, just as important, so each speaker's mic echo-canceller/
  // noise-suppressor isn't fighting loud, sustained music bleeding from their
  // device speakers, which is what makes a voice sound muffled/underwater. Fast
  // attack when speech starts; a short hold + gentle release when it stops. When
  // the host turns ducking off, the music simply holds at its full set volume.
  useEffect(() => {
    if (musicActiveIndex === null || !musicPlaying) return
    if (!duckEnabled) {
      // Ensure any prior dip is released back to full when ducking is disabled.
      if (duckReleaseRef.current) {
        clearTimeout(duckReleaseRef.current)
        duckReleaseRef.current = null
      }
      duckMusic(false, 300)
      return
    }
    if (state.speaking) {
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
  }, [duckEnabled, state.speaking, musicActiveIndex, musicPlaying, duckMusic])

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
  // Step to another track, wrapping around at the ends.
  function skipMusic(delta: number) {
    if (musicTracks.length === 0) return
    const from = musicActiveIndex ?? (delta > 0 ? -1 : 0)
    const next = (from + delta + musicTracks.length) % musicTracks.length
    void playMusicTrack(next)
  }
  function removeMusicTrack(index: number) {
    setMusicTracks((arr) => arr.filter((_, i) => i !== index))
    setMusicActiveIndex((cur) => {
      if (cur === null) return cur
      if (index === cur) return null
      return index < cur ? cur - 1 : cur
    })
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

  // Tear music down cleanly if the room stops being live.
  useEffect(() => {
    if (!live && musicActiveIndex !== null) {
      setMusicActiveIndex(null)
      setMusicPlayingState(false)
      void stopMusic()
    }
  }, [live, musicActiveIndex, stopMusic])

  // ── Self mic + listener mute ─────────────────────────────────────────────
  const me = speakers.find((s) => s.isLocal)
  const micOn = me?.micOn ?? false
  const [selfMuted, setSelfMuted] = useState(false)
  // Listeners without publish can mute the room audio; here everyone publishes,
  // so "mute" just toggles their own mic — handled by toggleMic.

  // ── Participant grid data ────────────────────────────────────────────────
  const gridParticipants = useMemo<GridParticipant[]>(() => {
    return speakers.map((s) => ({
      identity: s.identity,
      name: s.name,
      image: s.image,
      color: getAvatarColor(s.identity),
      isSpeaking: s.isSpeaking,
      micOn: s.micOn,
      isLocal: s.isLocal,
      isHost: s.identity === hostId,
      pinned: s.identity === pinnedId,
    }))
  }, [speakers, hostId, pinnedId])

  const pinned = gridParticipants.find((p) => p.pinned) ?? null
  const rest = gridParticipants.filter((p) => !p.pinned)
  const speakingCount = gridParticipants.filter((p) => p.isSpeaking).length

  // ── Host per-participant actions ─────────────────────────────────────────
  const [actionTarget, setActionTarget] = useState<GridParticipant | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  // Share sheet — opened from the host "Invite people" control and from the
  // participant dock share button. Lets anyone share the meeting link.
  const [shareOpen, setShareOpen] = useState(false)
  // Study-resources drawer opener (present on every live). Sits in the dock
  // just before the chat button.
  const resources = useLiveResourcesOptional()

  function handleTapParticipant(p: GridParticipant) {
    if (!isHost || p.identity === hostId) return
    setActionTarget(p)
  }

  const participantActions: SheetAction[] = useMemo(() => {
    if (!actionTarget || !roomName) return []
    const target = actionTarget
    const isPinned = target.identity === pinnedId
    return [
      {
        label: target.micOn ? "Mute participant" : "Participant is muted",
        icon: MicOff,
        disabled: !target.micOn,
        onClick: () => void muteParticipant({ roomName, userId: target.identity }),
      },
      {
        label: isPinned ? "Unpin" : "Pin to spotlight",
        icon: isPinned ? PinOff : Pin,
        onClick: () => {
          void setPinnedParticipant({ roomName, userId: isPinned ? null : target.identity })
          setPinnedId(isPinned ? null : target.identity)
        },
      },
      {
        label: "Remove from room",
        icon: UserMinus,
        destructive: true,
        onClick: () => void removeFromStage({ roomName, userId: target.identity }),
      },
    ]
  }, [actionTarget, roomName, pinnedId])

  // ── Host room controls ─────────────────────────────────────────────���─────
  // Consolidated host-only controls, shown in a single clean menu.
  const hostControlActions: SheetAction[] = useMemo(() => {
    if (!isHost) return []
    return [
      { label: "Invite people", icon: UserPlus, onClick: () => setShareOpen(true) },
      { label: "Background music", icon: Music, onClick: () => setMusicOpen(true) },
      { label: "Room theme", icon: Palette, onClick: () => setThemeOpen(true) },
      {
        label: locked ? "Unlock room" : "Lock room",
        icon: locked ? Lock : LockOpen,
        hint: locked ? "New people can't join" : "Anyone can join",
        onClick: () => toggleLock(),
      },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, locked])

  function toggleLock() {
    if (!roomName) return
    const next = !locked
    setLocked(next)
    void setRoomLock({ roomName, locked: next })
  }
  // Apply a theme locally at once (snappy), then persist so every participant
  // picks it up on their next poll.
  function changeTheme(id: string) {
    setThemeState(id)
    if (roomName) void setLiveTheme({ roomName, theme: id }).catch(() => {})
  }
  // The meeting link shared from both the host "Invite people" control and the
  // participant dock share button. `type: "live"` + roomName mirrors how the
  // audio listener screen builds its share target.
  const shareTarget: ShareTarget = {
    type: "live",
    key: roomName ?? title,
    title,
    subtitle: `Join "${title}" live on Frequency`,
    url: roomName ? `/live/${roomName}` : "/live",
    image: cover ?? null,
  }

  function leaveRoom() {
    void disconnect()
    if (onExit) onExit()
    else router.push("/live")
  }
  async function endRoom() {
    // Tear the room down immediately for everyone. The recorder is stopped
    // synchronously (so no audio is lost) but we deliberately do NOT await it —
    // we hold the promise and only resolve it if the host chooses to save.
    const duration = formatElapsed(elapsed)
    recordingPromiseRef.current = recording ? stopRecording().catch(() => null) : Promise.resolve(null)
    setRecording(false)
    if (roomName) void endBroadcast({ roomName }).catch(() => {})
    void disconnect()
    // Ask the host, as a separate step, whether to keep this as an episode.
    setSaveDecision({ title, duration, cover: cover ?? null })
  }

  // Host chose to save — finalize the (usually already-resolved) recording,
  // upload it, and auto-publish it to the catalogue's Live tab, then leave.
  async function handleSaveEpisode() {
    const dec = saveDecision
    if (!dec) return
    setSavingEpisode(true)
    const audioBlob = await (recordingPromiseRef.current ?? Promise.resolve(null))
    recordingPromiseRef.current = null
    let audioUrl: string | null = null
    if (audioBlob) {
      try {
        const ext = audioBlob.type.includes("mp4") ? "mp4" : "webm"
        const file = new File([audioBlob], `conversation.${ext}`, { type: audioBlob.type })
        const data = await uploadMedia(file, "episodes")
        audioUrl = data.url
      } catch {
        // Publish without audio rather than failing the save entirely.
      }
    }
    await publishShow({
      title: dec.title,
      tagline: "",
      category: "",
      duration: dec.duration,
      description: "",
      cover: dec.cover,
      audioUrl,
      source: "live",
      // Lets the server scope the replay to this session's Home.
      roomName,
    }).catch(() => null)
    setSaveDecision(null)
    setSavingEpisode(false)
    leaveRoom()
  }

  // Host declined to save — drop the recording and leave.
  function handleDiscardEpisode() {
    recordingPromiseRef.current = null
    setSaveDecision(null)
    leaveRoom()
  }

  // ── Splash states ────────────────────────────────────────────────────────
  if (!isHostMode && !canJoin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-950 px-6 text-center text-white">
        <span className="flex size-14 items-center justify-center rounded-full bg-white/10 ring-1 ring-inset ring-white/15">
          <Radio className="size-7" strokeWidth={2.5} />
        </span>
        <p className="text-lg font-bold">Sign in to join</p>
        <p className="max-w-xs text-sm text-white/60">You need an account to join the conversation and speak.</p>
      </div>
    )
  }

  if (hostEnded) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-950 px-6 text-center text-white">
        <span className="flex size-14 items-center justify-center rounded-full bg-white/10 ring-1 ring-inset ring-white/15">
          <HandHeart className="size-7" strokeWidth={2.5} />
        </span>
        <p className="text-lg font-bold">The gathering has ended</p>
        <p className="max-w-xs text-sm text-white/60">Thanks for being here. Taking you back to Live…</p>
        <Loader2 className="size-4 animate-spin text-white/60" />
      </div>
    )
  }

  // ── Host setup screen (brand-new room) ───────────────────────────────────
  if (isHostMode && !live) {
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
            onClick={leaveRoom}
            className="mb-6 flex size-10 items-center justify-center rounded-full bg-white/15 ring-1 ring-inset ring-white/15 hover:bg-white/25"
            aria-label="Back"
          >
            <X className="size-5" strokeWidth={2.5} />
          </button>

          <div className="mb-6 space-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
              <Sparkles className="size-3.5" /> Conversation
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-balance">Start a gathering</h1>
            <p className="text-sm leading-relaxed text-white/60">
              A warm, come-as-you-are room where everyone can speak. Set the scene and open the doors.
            </p>
          </div>

          <div className="space-y-5">
            <AudioFormatSelector active="conversation" />

            <CoverUpload
                value={setupCover}
                onChange={setSetupCover}
                label="Room cover"
                ratios={SQUARE_RATIO}
                allowFit
                compact
              />

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Room name</span>
              <input
                value={setupTitle}
                onChange={(e) => setSetupTitle(e.target.value)}
                placeholder={`${hostName} — gathering`}
                maxLength={80}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-primary/60 focus:outline-none"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Topic <span className="text-white/40">(optional)</span></span>
              <input
                value={setupTopic}
                onChange={(e) => setSetupTopic(e.target.value)}
                placeholder="What are we gathering around?"
                maxLength={120}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-primary/60 focus:outline-none"
              />
            </label>

            {/* Category — a dropdown selector (matching the Podcast setup). */}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Category</span>
              <div className="relative">
                <select
                  value={setupCategory}
                  onChange={(e) => setSetupCategory(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 pr-10 text-sm text-white focus:border-primary/60 focus:outline-none [&>option]:bg-neutral-900 [&>option]:text-white"
                >
                  {CONVERSATION_CATEGORIES.map((c) => (
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
                  const isActive = setupVisibility === opt.value
                  const Icon = opt.icon
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSetupVisibility(opt.value)}
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
                {setupVisibility === "public"
                  ? "Listed in Live for everyone to discover and join."
                  : "Only invited users can join."}
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="button"
              onClick={goLive}
              disabled={starting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-[0.99] disabled:opacity-60"
            >
              {starting ? <Loader2 className="size-4 animate-spin" /> : <Radio className="size-4" strokeWidth={2.5} />}
              {starting ? "Opening the room…" : "Go live"}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── The live room ────────────────────────────────────────────────────────
  const headerCompact = autoCompact || chatOpen
  return (
    <div
      className="relative flex h-full flex-col overflow-hidden bg-zinc-950 text-white"
      style={liveThemeStyle(theme)}
    >
      {/* Public-live display-name gate. On submit it creates a guest session and
          re-runs the participant join so the room connects as that guest. */}
      {needIdentity && streamData && (
        <LiveJoinGate
          stream={streamData}
          onJoined={() => {
            setNeedIdentity(false)
            void connectParticipant()
          }}
        />
      )}

      {/* Ambient warm backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(70% 55% at 20% 0%, color-mix(in oklch, var(--primary) 34%, transparent), transparent 62%), radial-gradient(60% 50% at 92% 18%, color-mix(in oklch, var(--live-accent) 24%, transparent), transparent 55%), radial-gradient(90% 65% at 50% 100%, color-mix(in oklch, var(--primary) 20%, transparent), transparent 62%)",
        }}
      />
      {/* Ambient falling snow — subtle atmosphere over the whole room, never
          intercepting taps. */}
      <SnowOverlay />
      {cover && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover || "/placeholder.svg"}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full object-cover opacity-10 blur-3xl"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-950/50 via-zinc-950/40 to-zinc-950/85" />
        </>
      )}

      {/* Header — expands with centered cover art, then collapses into a
          compact sticky bar to maximise room space. */}
      <header className="relative z-30 border-b border-white/10 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl">
        {/* Top row: back / more-options, live badge, audience + clock */}
        <div className="flex items-center gap-2.5">
          <BackExitMenu
            showMenu={state.connected}
            exitLabel={isHost ? "End gathering" : "Leave"}
            onExit={isHost ? () => void endRoom() : leaveRoom}
            onMinimize={onMinimize ?? (() => {})}
          />
          <span className="flex items-center gap-1 rounded-full bg-live px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-live-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-current" /> Live
          </span>
          {category && (
            <span className="truncate rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/70">
              {category}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <LiveAudienceSheet count={presenceCount || state.listeners} members={presenceMembers} immersive />
            {state.connected && (
              <span className="font-mono text-[11px] tabular-nums text-white/45">{formatElapsed(elapsed)}</span>
            )}
          </div>
        </div>

        <AnimatePresence initial={false} mode="wait">
          {headerCompact ? (
            <motion.div
              key="compact"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
              className="mt-2 flex items-center gap-2.5"
            >
              {cover && <CoverArt src={cover} alt={`${title} cover`} className="size-9" />}
              <MarqueeTitle text={title} className="min-w-0 flex-1 text-sm font-bold leading-tight tracking-tight" />
              <span className="shrink-0 text-xs font-medium text-white/50">
                {gridParticipants.length} here
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="full"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
              className="mt-3 flex flex-col items-center text-center"
            >
              {cover && <CoverArt src={cover} alt={`${title} cover`} className="mb-3 size-24" />}
              <h1 className="max-w-full truncate text-lg font-bold leading-tight tracking-tight text-balance">{title}</h1>
              <p className="mt-0.5 text-xs font-medium text-white/60">Hosted by {hostName}</p>
              {topic && (
                <div className="mt-2 rounded-full bg-white/[0.06] px-3 py-1 ring-1 ring-inset ring-white/10">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Today&apos;s discussion</span>
                  <span className="ml-1.5 text-xs font-medium text-white/80">{topic}</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Speaking status line */}
      <div className="relative z-20 flex items-center justify-center gap-2 py-1.5 text-xs font-medium text-white/55">
        <span className={cn("flex items-center gap-1", speakingCount > 0 && "text-primary")}>
          <span className={cn("size-1.5 rounded-full", speakingCount > 0 ? "animate-pulse bg-primary" : "bg-white/30")} />
          {speakingCount > 0 ? `${speakingCount} speaking` : "Quiet room"}
        </span>
        <span className="text-white/25">·</span>
        <span>{gridParticipants.length} in the room</span>
      </div>

      {/* Body: connecting / grid */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {connecting && !state.connected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-white/60">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-sm">Joining the room…</p>
          </div>
        ) : (
          <>
            {/* Pinned spotlight */}
            <AnimatePresence>
              {pinned && (
                <motion.div
                  initial={{ opacity: 0, y: -12, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -12, height: 0 }}
                  className="mx-4 mt-2 flex items-center gap-3 overflow-hidden rounded-2xl bg-white/5 p-3 ring-1 ring-inset ring-primary/40"
                >
                  <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary ring-2 ring-primary/70">
                    {pinned.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pinned.image || "/placeholder.svg"} alt="" className="size-full object-cover" />
                    ) : (
                      <span className={cn("flex size-full items-center justify-center text-sm font-semibold text-white", pinned.color)}>
                        {pinned.name.slice(0, 1)}
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      <Pin className="size-3" /> Spotlight
                    </p>
                    <p className="truncate text-sm font-bold">{pinned.isLocal ? "You" : pinned.name}</p>
                  </div>
                  <span className={cn("flex size-8 items-center justify-center rounded-full", pinned.micOn ? "bg-primary text-primary-foreground" : "bg-white/10 text-white/70")}>
                    {pinned.micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="min-h-0 flex-1">
              <ParticipantGrid
                participants={rest}
                onTapParticipant={handleTapParticipant}
                perPage={chatOpen ? 6 : 12}
              />
            </div>
          </>
        )}

        {/* Floating messages (only when chat closed) */}
        <FloatingMessages messages={chatMessages} active={live && !chatOpen} />
      </div>

      {/* Audio unlock (autoplay blocked) */}
      {state.audioBlocked && (
        <button
          type="button"
          onClick={() => void startAudioPlayback()}
          className="absolute inset-x-0 bottom-24 z-40 mx-auto flex w-max items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg"
        >
          <Volume2 className="size-4" /> Tap to enable sound
        </button>
      )}

      {/* Chat panel — slides up to ~40% of the screen; the participant grid
          above smoothly shrinks to make room (never overlapping). */}
      <AnimatePresence initial={false}>
        {chatOpen && (
          <motion.section
            key="conv-chat"
            initial={{ height: "0vh", opacity: 0 }}
            animate={{ height: "40vh", opacity: 1 }}
            exit={{ height: "0vh", opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            className="relative z-40 flex min-h-0 shrink-0 flex-col overflow-hidden border-t border-white/10 bg-black/40 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
              <h2 className="text-sm font-bold">Chat</h2>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                aria-label="Close chat"
                className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20"
              >
                <X className="size-4" strokeWidth={2.5} />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <LiveChat asHost={isHost} currentUser={currentUser} roomName={roomName ?? undefined} immersive />
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Bottom control dock */}
      <div className="relative z-30 flex items-center justify-center gap-3 border-t border-white/10 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-xl">
        <DockButton
          label={micOn ? "Mute yourself" : "Unmute yourself"}
          onClick={() => void toggleMic()}
          active={micOn}
        >
          {micOn ? <Mic /> : <MicOff />}
        </DockButton>

        {isHost && (
          <DockButton
            label="Host controls"
            onClick={() => setHostMenuOpen(true)}
            active={hostMenuOpen || musicPlaying || locked}
          >
            <Settings2 />
          </DockButton>
        )}

        {resources && (
          <DockButton label="Study resources" onClick={() => resources.openDrawer()}>
            <BookOpen />
          </DockButton>
        )}

        <DockButton label="Chat" onClick={() => setChatOpen((v) => !v)} active={chatOpen}>
          <MessageSquare />
        </DockButton>

        {/* Share the meeting link — participants only. The host already shares
            via the "Invite people" control in their host menu, so a dedicated
            dock button would be redundant for them. */}
        {!isHost && (
          <DockButton label="Share" onClick={() => setShareOpen(true)} active={shareOpen}>
            <Share2 />
          </DockButton>
        )}
      </div>

      {/* Share the meeting link — opened by the host "Invite people" control
          and by the participant dock share button. */}
      <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />


      {/* Host music panel — the same playlist panel used in podcast studio mode */}
      {isHost && musicOpen && (
        <MusicPanel
          live={live}
          position={state.musicPosition}
          duration={state.musicDuration}
          tracks={musicTracks}
          activeIndex={musicActiveIndex}
          playing={musicPlaying}
          volume={musicVolume}
          mixing={musicMixing}
          loop={musicLoop}
          error={musicError}
          duck={duckEnabled}
          onAddTracks={(added) => setMusicTracks((t) => [...t, ...added])}
          onPlayTrack={(i) => void playMusicTrack(i)}
          onTogglePlay={toggleMusicPlay}
          onNext={() => skipMusic(1)}
          onPrev={() => skipMusic(-1)}
          onToggleLoop={toggleMusicLoop}
          onVolume={changeMusicVolume}
          onSeek={seekMusic}
          onRemoveTrack={removeMusicTrack}
          onError={setMusicError}
          onToggleDuck={setDuckEnabled}
          onClose={() => setMusicOpen(false)}
        />
      )}

      {/* Host controls menu (consolidated) */}
      {isHost && (
        <ActionSheet
          open={hostMenuOpen}
          onClose={() => setHostMenuOpen(false)}
          title="Host controls"
          actions={hostControlActions}
        />
      )}

      {/* Host theme picker */}
      {isHost && (
        <ConversationThemeSheet
          open={themeOpen}
          current={theme}
          onSelect={(id) => {
            changeTheme(id)
            setThemeOpen(false)
          }}
          onClose={() => setThemeOpen(false)}
        />
      )}

      {/* Host per-participant actions */}
      <ActionSheet
        open={Boolean(actionTarget)}
        onClose={() => setActionTarget(null)}
        title={actionTarget ? actionTarget.name : undefined}
        actions={participantActions}
      />

      {/* Post-end "save as episode?" decision (host). While saving, the prompt
          is replaced by a small saving state so the host isn't left staring at
          a frozen dialog during upload/publish. */}
      {saveDecision &&
        (savingEpisode ? (
          <div className="fixed inset-0 z-[75] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
            <div className="relative z-10 flex w-full max-w-xs flex-col items-center gap-3 rounded-3xl border border-white/10 bg-zinc-900/95 p-6 text-center text-white shadow-2xl backdrop-blur-xl">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm font-semibold">Saving this gathering to your catalogue…</p>
            </div>
          </div>
        ) : (
          <SaveEpisodePrompt onSave={() => void handleSaveEpisode()} onDiscard={handleDiscardEpisode} />
        ))}
    </div>
  )
}
