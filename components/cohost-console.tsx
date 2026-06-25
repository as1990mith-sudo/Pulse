"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, MicOff, Music, PhoneCall, Radio, Send, Users, Volume2, VolumeX } from "lucide-react"
import { ShareSheet } from "@/components/share-sheet"
import { BackExitMenu } from "@/components/live-back-menu"
import { LiveChat } from "@/components/live-chat"
import { CoverArt } from "@/components/cover-art"
import { LiveBadge } from "@/components/live-badge"
import { LiveStage, QualityIcon } from "@/components/live-stage"
import { LiveAudienceSheet } from "@/components/live-audience-sheet"
import { ReactionLayer } from "@/components/live-reactions"
import { MusicPanel, PeoplePanel, type Track } from "@/components/studio-console"
import { liveThemeStyle } from "@/lib/live-themes"
import { getAvatarColor } from "@/lib/identity"
import { useLivePresence } from "@/lib/use-live-presence"
import type { useLiveAudio } from "@/lib/use-live-audio"
import type { CurrentUser } from "@/lib/session"
import type { ShareTarget } from "@/lib/share-types"
import type { CallRequestView, CoHostPermissions, LiveStreamView } from "@/app/actions/live"
import {
  respondToCallRequest,
  requestMusicControl,
  stepOffStage,
  callIn,
  requestEndSession,
} from "@/app/actions/live"
import { cn } from "@/lib/utils"

/** Formats elapsed seconds as H:MM:SS / M:SS for the live duration clock. */
function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m)
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`
}

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
  tone?: "default" | "danger" | "success"
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
          : tone === "success"
            ? "bg-call-accept text-white shadow-call-accept/40 ring-white/25 hover:bg-call-accept/90"
            : active
              ? "bg-primary text-primary-foreground shadow-primary/40 ring-white/25"
              : "bg-white/25 text-white ring-white/25 hover:bg-white/35",
      )}
    >
      {children}
    </button>
  )
}

/**
 * The co-host's host-like console. It is *presentational over the connection*:
 * the single LiveKit room lives in the parent listener's `useLiveAudio`, and we
 * receive its handles via `audio` so we never open a second connection.
 *
 * Controls are gated by `permissions` (granted by the main host):
 *  - acceptRequests → People panel can accept/decline call requests
 *  - controlTracks  → Music panel (with the host approval flow)
 *  - endSession     → "End Session" in the back menu
 */
export function CoHostConsole({
  stream,
  currentUser,
  currentUserId,
  audio,
  elapsed,
  permissions,
  musicApproved,
  musicRequestPending,
  iControlMusic,
  pending,
  guests,
  coHostIds,
  viewers,
  locked,
  theme,
  endRequestPending,
  onMinimize,
  onExit,
  refreshCalls,
}: {
  stream: LiveStreamView
  currentUser: CurrentUser | null
  currentUserId: string | null
  audio: ReturnType<typeof useLiveAudio>
  elapsed: number
  permissions: CoHostPermissions
  musicApproved: boolean
  musicRequestPending: boolean
  iControlMusic: boolean
  pending: CallRequestView[]
  guests: CallRequestView[]
  coHostIds: Set<string>
  viewers: number
  locked: boolean
  theme: string
  // True while this co-host's "end live session" request awaits the host.
  endRequestPending: boolean
  onMinimize?: (to?: string) => void
  onExit?: () => void
  refreshCalls: () => void
}) {
  const {
    state,
    speakers,
    toggleMic,
    setListenerMuted,
    startAudioPlayback,
    publishMusic,
    setMusicVolume,
    setMusicPlaying,
    seekMusic,
    setMusicLoop,
    setMusicEndedHandler,
    stopMusic,
  } = audio

  // Whether the co-host is actively on the call (publishing). Driven by the
  // LiveKit publish permission, which the host revokes on step-off / drop and
  // restores on call-in — so this flips responsively without waiting on a poll.
  const onCall = state.canPublish

  const [panel, setPanel] = useState<null | "music" | "people">(null)
  const [muted, setMuted] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  // ── Background-music playlist (only usable with the Control Tracks perm). ──
  const [musicTracks, setMusicTracks] = useState<Track[]>([])
  const [musicActiveIndex, setMusicActiveIndex] = useState<number | null>(null)
  const [musicPlaying, setMusicPlayingState] = useState(false)
  const [musicVolume, setMusicVolumeState] = useState(0.4)
  const [musicMixing, setMusicMixing] = useState(false)
  const [musicError, setMusicError] = useState<string | null>(null)
  const [musicLoop, setMusicLoopState] = useState(false)
  // Track whether we've asked the host for control yet this session.
  const requestedRef = useRef(false)

  const [musicPosition, setMusicPosition] = useState(0)
  const [musicDuration, setMusicDuration] = useState(0)
  useEffect(() => {
    setMusicPosition(state.musicPosition ?? 0)
    setMusicDuration(state.musicDuration ?? 0)
  }, [state.musicPosition, state.musicDuration])

  // First upload always needs host approval. Until approved, we can queue
  // tracks but not mix them in. Once approved, control is ours until revoked.
  async function ensureApproval(): Promise<boolean> {
    if (musicApproved) return true
    if (!requestedRef.current) {
      requestedRef.current = true
      await requestMusicControl({ roomName: stream.roomName })
      refreshCalls()
    }
    return false
  }

  async function playMusicTrack(index: number) {
    const track = musicTracks[index]
    if (!track) return
    // Music can only be mixed in while actually on the call.
    if (!onCall) {
      setMusicError("Call back in to control the music.")
      return
    }
    // Gate on host approval the first time.
    const approved = await ensureApproval()
    if (!approved) {
      setMusicError("Waiting for the host to approve music control…")
      return
    }
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

  // Auto-advance to the next track when one finishes (unless looping).
  useEffect(() => {
    if (!iControlMusic) return
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
  }, [musicTracks, setMusicEndedHandler, iControlMusic])

  // If track control is revoked (host turned off the permission), immediately
  // stop our mixed-in music and surrender the controls.
  useEffect(() => {
    if (!permissions.controlTracks && musicActiveIndex !== null) {
      setMusicActiveIndex(null)
      setMusicPlayingState(false)
      requestedRef.current = false
      void stopMusic()
      if (panel === "music") setPanel(null)
    }
  }, [permissions.controlTracks, musicActiveIndex, stopMusic, panel])

  function toggleMute() {
    const next = !muted
    setMuted(next)
    setListenerMuted(next)
  }

  async function handleAccept(id: number) {
    await respondToCallRequest({ id, accept: true })
    refreshCalls()
  }
  async function handleDecline(id: number) {
    await respondToCallRequest({ id, accept: false })
    refreshCalls()
  }
  // Step off the call but stay in the room as a co-host (keeps the grant +
  // permissions; the dock swaps to a "Call in" button to return).
  async function handleStepOff() {
    await stepOffStage({ roomName: stream.roomName })
    refreshCalls()
  }
  // Rejoin the stage after stepping off / dropping (no host approval needed).
  async function handleCallIn() {
    const res = await callIn({ roomName: stream.roomName })
    if (!res.ok && res.error) setMusicError(res.error)
    refreshCalls()
  }
  async function handleEndSession() {
    const res = await requestEndSession({ roomName: stream.roomName })
    if (!res.ok && res.error) setMusicError(res.error)
    refreshCalls()
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

  const onStage = 1 + speakers.filter((s) => s.identity !== stream.hostId).length
  const audience = Math.max(0, state.listeners - onStage)
  const { count: presenceCount, members: presenceMembers } = useLivePresence(stream.roomName, state.connected)

  const colorById: Record<string, string> = {}
  for (const s of speakers) colorById[s.identity] = getAvatarColor(s.identity)

  const activeTrack = musicActiveIndex !== null ? musicTracks[musicActiveIndex] : null

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden bg-zinc-950 text-white transition-[background] duration-700"
      style={{ ...liveThemeStyle(theme), ["--call-accept" as string]: "var(--live-accent)" }}
    >
      {/* Drifting aurora backdrop. */}
      <div
        aria-hidden="true"
        className="stage-aurora pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(70% 55% at 20% 0%, color-mix(in oklch, var(--primary) 45%, transparent), transparent 60%), radial-gradient(60% 50% at 90% 20%, color-mix(in oklch, var(--live-accent) 30%, transparent), transparent 55%), radial-gradient(80% 60% at 50% 100%, color-mix(in oklch, var(--primary) 25%, transparent), transparent 60%)",
        }}
      />
      {stream.cover && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={stream.cover || "/placeholder.svg"}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full object-cover opacity-15 blur-3xl"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/40 to-zinc-950/85" />
        </>
      )}

      {/* ───────── Header ───────── */}
      <header className="relative z-30 flex items-center gap-3 border-b border-white/10 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1rem)] backdrop-blur-xl">
        <BackExitMenu
          showMenu={state.connected}
          exitLabel="Leave"
          onExit={() => {
            if (onExit) onExit()
          }}
          onMinimize={onMinimize ?? (() => {})}
          onEndSession={permissions.endSession ? () => void handleEndSession() : undefined}
        />
        <CoverArt src={stream.cover ?? null} alt={`${stream.title} cover art`} />
        <div className="relative min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <LiveBadge />
            <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
              Co-Host
            </span>
            {state.connected && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-white/60">
                <QualityIcon quality={state.connectionQuality} />
              </span>
            )}
          </div>
          <h1 className="mt-0.5 truncate text-base font-bold leading-tight tracking-tight text-white">{stream.title}</h1>
          <p className="truncate text-xs font-medium text-white/70">with {stream.hostName}</p>
        </div>
        <div className="relative flex shrink-0 flex-col items-end gap-1">
          <LiveAudienceSheet count={presenceCount || audience} members={presenceMembers} immersive />
          {state.connected && (
            <span className="font-mono text-[11px] tabular-nums text-white/50">{formatElapsed(elapsed)}</span>
          )}
        </div>
      </header>

      {/* ───────── Speaker stage ───────── */}
      <div className="relative flex shrink-0 flex-col gap-3 px-4 py-3 sm:px-6 sm:py-3.5">
        <ReactionLayer roomName={state.connected ? stream.roomName : undefined} />
        <div className="relative">
          <LiveStage
            host={{ id: stream.hostId, name: stream.hostName, color: getAvatarColor(stream.hostId) }}
            speakers={speakers}
            activeSpeakers={state.activeSpeakers}
            hostColorById={colorById}
            isHost={false}
            coHostIds={coHostIds}
          />
        </div>

        {state.connected && state.audioBlocked && (
          <button
            type="button"
            onClick={() => void startAudioPlayback()}
            className="relative mx-auto flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-opacity hover:opacity-90"
          >
            <Volume2 className="size-4" /> Tap to enable sound
          </button>
        )}

        {musicRequestPending && !musicApproved && onCall && (
          <p className="relative mx-auto rounded-full bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-200 ring-1 ring-inset ring-amber-400/20 backdrop-blur-md">
            Waiting for the host to approve your music control…
          </p>
        )}

        {endRequestPending && (
          <p className="relative mx-auto rounded-full bg-live/15 px-3 py-1.5 text-xs font-medium text-live ring-1 ring-inset ring-live/20 backdrop-blur-md">
            Waiting for the host to end the live session…
          </p>
        )}

        {!onCall && (
          <p className="relative mx-auto rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 ring-1 ring-inset ring-white/15 backdrop-blur-md">
            You&apos;re off the call — tap Call in to rejoin the stage.
          </p>
        )}
      </div>

      {/* ───────── Co-host dock ───────── */}
      <div className="relative shrink-0 border-t border-white/10 px-4 py-2 pl-safe pr-safe backdrop-blur-xl">
        <div className="flex items-center justify-center gap-2 sm:gap-3">
          {/* Mic — only while on the call. */}
          {onCall && (
            <DockButton
              label={state.micEnabled ? "Mute your mic" : "Unmute your mic"}
              onClick={() => void toggleMic()}
              active={state.micEnabled}
            >
              {state.micEnabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
            </DockButton>
          )}

          {/* Listener mute (monitor others). */}
          <DockButton label={muted ? "Unmute audio" : "Mute audio"} onClick={toggleMute} active={muted}>
            {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </DockButton>

          {/* People — gated by the Accept Call Requests permission. */}
          {permissions.acceptRequests && (
            <DockButton
              label="Speakers & requests"
              onClick={() => setPanel((p) => (p === "people" ? null : "people"))}
              active={panel === "people"}
            >
              <Users className="size-5" />
              {pending.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-live text-[10px] font-bold text-live-foreground ring-2 ring-zinc-950">
                  {pending.length}
                </span>
              )}
            </DockButton>
          )}

          {/* Music — gated by the Control Tracks permission, and only on the call. */}
          {permissions.controlTracks && onCall && (
            <DockButton
              label={musicPlaying ? "Background music (playing)" : "Background music"}
              onClick={() => setPanel((p) => (p === "music" ? null : "music"))}
              active={panel === "music" || musicPlaying}
            >
              <Music className="size-5" />
            </DockButton>
          )}

          <DockButton label="Share room" onClick={() => setShareOpen(true)}>
            <Send className="size-5" />
          </DockButton>

          {/* On the call → step off (stay in the room); off the call → call back in. */}
          {onCall ? (
            <DockButton label="Step off the call" onClick={() => void handleStepOff()} tone="danger">
              <Radio className="size-5" />
            </DockButton>
          ) : (
            <DockButton label="Call in" onClick={() => void handleCallIn()} tone="success">
              <PhoneCall className="size-5" />
            </DockButton>
          )}
        </div>
      </div>

      {/* ───────── Live chat ───────── */}
      <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden border-t border-white/10 pb-safe">
        <div className="min-h-0 flex-1">
          <LiveChat
            immersive
            currentUser={currentUser}
            roomName={stream.roomName}
            bgUrl={stream.chatBgUrl ?? null}
            bgEffect={stream.chatBgEffect ?? "none"}
          />
        </div>
      </section>

      {panel === "people" && permissions.acceptRequests && (
        <PeoplePanel
          roomName={stream.roomName}
          pending={pending}
          guests={guests}
          viewers={viewers}
          onAccept={(id) => void handleAccept(id)}
          onDecline={(id) => void handleDecline(id)}
          onClose={() => setPanel(null)}
        />
      )}

      {panel === "music" && permissions.controlTracks && onCall && (
        <MusicPanel
          live={state.connected}
          position={musicPosition}
          duration={musicDuration}
          tracks={musicTracks}
          activeIndex={musicActiveIndex}
          playing={musicPlaying}
          volume={musicVolume}
          mixing={musicMixing}
          loop={musicLoop}
          error={musicError}
          onAddTracks={(t) => setMusicTracks((arr) => [...arr, ...t])}
          onPlayTrack={(i) => void playMusicTrack(i)}
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

      <ShareSheet target={shareTarget} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  )
}
