"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ensureCtxRunning } from "@/lib/audio-context"
import { prepareAudioRouting, applyAudioRouting, releaseAudioRouting } from "@/lib/audio-routing"
import {
  routeRemoteAudioToSpeaker,
  releaseRemoteAudioRoute,
  resumeSpeakerPlayout,
} from "@/lib/android-speaker-route"
import {
  AudioPresets,
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPresets43,
  type LocalTrackPublication,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  type VideoCaptureOptions,
} from "livekit-client"
import {
  buildMusicChain,
  DUCK_FACTOR,
  LIVE_MIC_CONSTRAINTS,
  LIVE_VOICE_PRESET,
  rampGain,
} from "@/lib/live-audio-chain"
import { LiveCompositor, type CompositorSource } from "@/lib/live-compositor"
import { fixRecordedVideoDuration } from "@/lib/webm-duration"

/**
 * The single source of truth for the camera capture format, pinned identically
 * to EVERY camera path (initial host publish, guest publish, and the front/back
 * flip). Keeping the constraints identical is what stops the framing from
 * jumping between paths.
 *
 * Phone front cameras are natively 4:3. Requesting a 16:9 resolution (e.g. 720p)
 * makes the browser crop the sensor top-and-bottom, which narrows the field of
 * view so the subject looks "zoomed in". A 4:3 request instead uses the WHOLE
 * sensor — the wider "far out" framing the user wants as the constant — and
 * 1440x1080 keeps it crisp for excellent quality.
 *
 * The Android bug came from the flip: `restartTrack` does a fresh getUserMedia
 * and does NOT inherit the room's `videoCaptureDefaults`, so when it carried
 * only `{ facingMode }` (no resolution) the camera fell back to a different
 * native default and the framing changed. We now pass this resolution on the
 * flip too, so front-camera framing is byte-for-byte identical every time.
 */
const CAPTURE_RESOLUTION = VideoPresets43.h1080.resolution

// LiveKit track name for the host's shared-video audio. Published so the egress
// recording captures it; every OTHER participant skips playing it (they already
// hear their own in-sync local copy), so it never causes doubled audio live.
export const VIDEO_AUDIO_TRACK = "live-video-audio"

// LiveKit track name for the host's shared-video PIXELS (a captureStream of the
// projected <video>). Published purely so the server egress records the
// projected video into the replay. Followers never render this track — they
// already paint their own in-sync local copy from live_video_state — so, like
// VIDEO_AUDIO_TRACK, it is name-guarded out of every live rendering path.
export const VIDEO_PROJECTION_TRACK = "live-video-projection"

/**
 * Whether this device can share its screen. This is PURE CAPABILITY DETECTION:
 * we surface Share Screen wherever the getDisplayMedia API is present, and hide
 * it only where the API genuinely doesn't exist. We deliberately do NOT special-
 * case any particular app housing (Median/GoNative/other WebViews) — whichever
 * shell exposes a working capture API gets the button, and any shell that
 * exposes the API but fails at call time is handled gracefully by
 * startScreenShare's try/catch (Project Video remains the universal fallback).
 */
export function canScreenShareHere(): boolean {
  if (typeof navigator === "undefined") return false
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== "function") return false
  return true
}

/**
 * Turn the camera on, degrading the capture format if the device can't satisfy
 * the preferred full-sensor 1440x1080. Some Android front cameras reject a
 * specific high resolution and (depending on the browser) surface it as an
 * opaque failure rather than an OverconstrainedError — which is why a single
 * fixed request produced the "We couldn't start your camera" dead-end. We try
 * the preferred 4:3 1080, then a lighter 4:3 720, then a bare request that lets
 * the browser pick whatever the sensor supports. A working lower-resolution
 * camera is always better than no camera. Throws only if EVERY attempt fails
 * (genuine permission denial / no device), so the caller still shows a precise
 * error for those real cases.
 */
async function enableCameraResilient(room: Room): Promise<void> {
  const attempts: (VideoCaptureOptions | undefined)[] = [
    { resolution: CAPTURE_RESOLUTION },
    { resolution: VideoPresets43.h720.resolution },
    undefined,
  ]
  let lastErr: unknown = null
  for (let i = 0; i < attempts.length; i++) {
    try {
      // Generous 30s budget. getUserMedia stays pending the whole time the OS
      // permission prompt is on screen AND while a slow sensor spins up — the
      // old 12s deadline counted both as "took too long" and surfaced a bogus
      // error even though the camera was about to come on. 30s only ever fires
      // as a true last-resort for a genuinely stuck device.
      await withTimeout(
        room.localParticipant.setCameraEnabled(true, attempts[i]),
        30000,
        "Camera start timed out.",
      )
      return
    } catch (e) {
      lastErr = e
      // The underlying operation may have actually enabled the camera right
      // around the deadline. If so, this is NOT a failure — never show an error.
      if (room.localParticipant.isCameraEnabled) return
      const timedOut = e instanceof Error && /timed out/i.test(e.message)
      if (timedOut) {
        // Give getUserMedia a short grace window to resolve just after the
        // deadline before we decide it truly failed. Firing another attempt
        // here would start a SECOND concurrent getUserMedia that fights the
        // first, so on a real timeout we stop the loop rather than retry.
        for (let w = 0; w < 6 && !room.localParticipant.isCameraEnabled; w++) {
          await new Promise((r) => setTimeout(r, 500))
        }
        if (room.localParticipant.isCameraEnabled) return
        break
      }
      // Genuine constraint/hardware rejection (rejects fast): back off briefly,
      // then retry with a lighter capture format the device is likelier to
      // accept. Lowering resolution can't help a timeout, only a constraint.
      await new Promise((r) => setTimeout(r, 400))
    }
  }
  if (room.localParticipant.isCameraEnabled) return
  throw lastErr
}

/** Reject a promise if it doesn't settle within `ms`, with a friendly message. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function parseImage(metadata: string | undefined): string | null {
  if (!metadata) return null
  try {
    return (JSON.parse(metadata) as { image?: string | null }).image ?? null
  } catch {
    return null
  }
}

/**
 * Best-effort detection of an Android/iOS in-app WebView (e.g. an app wrapped as
 * an APK). These containers only expose the camera/mic to web content if the
 * native shell is configured to grant it (Android: WebChromeClient
 * .onPermissionRequest + CAMERA/RECORD_AUDIO manifest permissions). When that
 * isn't wired up, getUserMedia fails even though the same site works in Chrome.
 */
function isInAppWebView(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent || ""
  // Android System WebView ("; wv") or common wrappers (Median/GoNative, Capacitor, Cordova).
  return /; wv\)|Median|GoNative|Capacitor|Cordova/i.test(ua)
}

/** True when running inside the Median (GoNative) app shell. */
export function isMedianApp(): boolean {
  if (typeof window === "undefined") return false
  const w = window as unknown as { median?: unknown; gonative?: unknown }
  if (w.median || w.gonative) return true
  return /Median|GoNative/i.test(navigator.userAgent || "")
}

/**
 * Open the native app settings page so the user can re-grant a camera/mic
 * permission they previously denied. Uses the Median JS bridge when present,
 * with a fallback to the documented deep-link URL. Returns true if a settings
 * screen could be triggered.
 */
export function openNativeAppSettings(): boolean {
  if (typeof window === "undefined") return false
  const w = window as unknown as {
    median?: { open?: { appSettings?: () => void } }
    gonative?: { open?: { appSettings?: () => void } }
  }
  const bridge = w.median ?? w.gonative
  if (bridge?.open?.appSettings) {
    bridge.open.appSettings()
    return true
  }
  // Documented Median command-style fallback.
  try {
    window.location.href = "median://run/median/open/app-settings"
    return true
  } catch {
    return false
  }
}

/**
 * Turn a getUserMedia / LiveKit device error into a precise, human message.
 * Distinguishing the cases avoids showing a misleading "check your permissions"
 * note in a browser where permission was already granted (it might just be a
 * transient timeout or the camera being used by another app).
 */
function describeMediaError(err: unknown): string {
  const name = err instanceof Error ? err.name : ""
  const message = err instanceof Error ? err.message : ""

  if (name === "NotAllowedError" || name === "SecurityError" || /permission|denied/i.test(message)) {
    if (isInAppWebView()) {
      return "Camera and microphone are blocked. Tap Allow when prompted — or, if you denied it before, enable Camera and Microphone for this app in your phone's Settings, then tap the camera button to try again."
    }
    return "Camera access was blocked. Allow camera and microphone for this site in your browser settings, then tap the camera button to try again."
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device. Connect a camera, then tap the camera button to try again."
  }
  if (name === "NotReadableError") {
    return "Your camera is being used by another app. Close it, then tap the camera button to try again."
  }
  if (/timed out/i.test(message)) {
    return "Starting your camera took too long. Tap the camera button to try again."
  }
  return "We couldn't start your camera. Tap the camera button to try again."
}

/**
 * Pick the best MediaRecorder container the browser supports for recording the
 * host's video session.
 *
 * MP4/H.264 is tried FIRST because it's the only format that plays back
 * universally — most importantly on iPhones/Safari, which cannot decode the
 * VP8/VP9 video track inside a WebM recording (the audio still plays, so the
 * replay would otherwise appear as a black screen with sound). WebM/VP9/VP8 is
 * kept as a fallback for browsers (older Android Chrome) that can't record MP4.
 * Returns "" to let MediaRecorder choose its own default when none match.
 */
function pickVideoRecordingMime(): string {
  if (typeof MediaRecorder === "undefined") return ""
  const candidates = [
    "video/mp4;codecs=avc1.640028,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ]
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return ""
}

/** A remote participant publishing into the room (the host or an accepted guest). */
export type RemotePeer = {
  identity: string
  name: string
  image: string | null
  isHost: boolean
  hasVideo: boolean
  // True when this peer's microphone is currently muted (or not publishing audio).
  micMuted: boolean
  // True while LiveKit reports this peer as an active speaker (drives the tile glow).
  isSpeaking: boolean
}

/**
 * Shared LiveKit plumbing for video live streams. Handles connecting to a room,
 * publishing the host's (or an accepted guest's) camera + mic, subscribing to
 * every other publisher's video into per-tile <video> elements, mixing in
 * uploaded background music, and the broadcaster controls (mute, camera on/off,
 * flip to the back camera). Guests are auto-promoted to publishers the moment
 * the host accepts their call-in (LiveKit pushes a permission update).
 */
export function useLiveVideo({
  token,
  serverUrl,
  isHost,
  hostId = null,
  autoPublish = false,
  initialMicOn = true,
  initialCamOn = true,
  recordAspect = "portrait",
  recordOnServer = false,
  onAskUnmute,
}: {
  token: string | null
  serverUrl: string | null
  isHost: boolean
  // Identity of the room host, so remote participants can be split into the
  // headline host tile vs. the guest call-in tiles.
  hostId?: string | null
  // Grid meetings: every participant (not just the host) publishes their own
  // camera + mic on connect, like Google Meet / Zoom.
  autoPublish?: boolean
  // Pre-join choices: whether the mic/camera should be live on connect. Lets a
  // participant enter a grid meeting muted and/or with their camera off.
  initialMicOn?: boolean
  initialCamOn?: boolean
  // Shape of the host's session recording. "portrait" mirrors a broadcast
  // stream; "landscape" mirrors a grid meeting. The recording composites every
  // participant tile into this frame so the replay matches the live view.
  recordAspect?: "portrait" | "landscape"
  // When true, the replay is being recorded SERVER-SIDE by LiveKit Egress, so
  // this hook must NOT run its own client-side MediaRecorder capture. This is
  // the permanent recording path; the client canvas/MediaRecorder capture below
  // is retained only as a fallback for when egress is unavailable.
  recordOnServer?: boolean
  // Fired when the host asks this client to unmute (received over the data
  // channel). The UI shows a prompt; we never open the mic without consent.
  onAskUnmute?: () => void
}) {
  const roomRef = useRef<Room | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  // Per-participant <video> elements registered by the UI for the guest tiles
  // (and, for viewers, the headline host tile).
  const remoteVideoEls = useRef<Map<string, HTMLVideoElement>>(new Map())
  // Remote audio elements appended to <body> so playback survives re-renders.
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map())

  // Background-music mixing graph (host side).
  const musicCtxRef = useRef<AudioContext | null>(null)
  const musicGainRef = useRef<GainNode | null>(null)
  // The host's intended (non-ducked) music volume, so ducking can restore it.
  const musicBaseVolumeRef = useRef(0.8)
  // Final node of the shared studio chain (post limiter). Monitor, published
  // track and recording mixer all tap this same node.
  const musicChainOutRef = useRef<AudioNode | null>(null)
  const musicElRef = useRef<HTMLAudioElement | null>(null)
  const musicTrackRef = useRef<LocalAudioTrack | null>(null)
  const musicSourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const musicLoopRef = useRef(false)
  const musicEndedRef = useRef<(() => void) | null>(null)

  // The host's shared-video audio, published as its own LiveKit track so the
  // server-side egress records it into the replay (exactly like background
  // music). Followers do NOT play this track — they already hear their own
  // synced local copy — so it exists purely for the recording. See the
  // TrackSubscribed guard that skips VIDEO_AUDIO_TRACK for everyone else.
  const videoAudioTrackRef = useRef<LocalAudioTrack | null>(null)

  // The host's shared-video PIXELS, published as a dedicated LiveKit track so the
  // egress records the projection into the replay. Egress-only; name-guarded out
  // of every live render path (followers paint their own synced copy).
  const videoProjectionTrackRef = useRef<LocalVideoTrack | null>(null)
  // The registered <video> element that renders a REMOTE screen share to
  // followers (and to the host's own confidence monitor is handled separately).
  const projectionVideoElRef = useRef<HTMLVideoElement | null>(null)

  // Host-side session recording. We record a COMPOSITE of every participant —
  // a canvas grid of all camera tiles plus a mix of everyone's audio — exactly
  // like viewers saw it live, via LiveCompositor. The finished blob is handed to
  // the console for upload + auto-publish when the broadcast ends.
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordChunksRef = useRef<Blob[]>([])
  const recordMimeRef = useRef<string>("video/webm")
  const recordingStartedRef = useRef(false)
  // Wall-clock timestamp (ms) when recording actually started. The composite is
  // captured in real time, so `Date.now() - start` at stop is the true video
  // length — which we inject into the WebM header before upload so the replay
  // reports its real duration instead of a broken ~0s.
  const recordStartMsRef = useRef(0)
  // True from the moment `stopRecording()` begins finalizing the take until the
  // recorder's `onstop` has flushed the last chunk. While this is set, `cleanup`
  // must NOT tear the recorder/compositor down: doing so ends the recorded
  // canvas+audio tracks mid-finalize, which can truncate the final blob so the
  // saved replay comes back empty. `stopRecording` owns the teardown instead.
  const finalizingRef = useRef(false)
  const compositorRef = useRef<LiveCompositor | null>(null)
  const recordAspectRef = useRef(recordAspect)
  recordAspectRef.current = recordAspect
  // Ordered roster (host first) mirrored into a ref so the compositor's draw
  // loop can read the current tiles without React re-renders.
  const peersRef = useRef<RemotePeer[]>([])
  // Screen wake lock held for the whole recording. Without it the host's phone
  // dims and locks after the usual OS idle timeout while they're live but not
  // tapping — which backgrounds the page, pausing rAF and suspending audio, and
  // was a major cause of replays truncating to a few seconds. The lock keeps the
  // page active so the capture pipeline runs end-to-end. The browser auto-
  // releases it when the page is genuinely hidden; we re-acquire on return.
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null)

  const [connected, setConnected] = useState(false)
  const [micOn, setMicOn] = useState(initialMicOn)
  const [camOn, setCamOn] = useState(initialCamOn)
  const [localVideoReady, setLocalVideoReady] = useState(false)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user")
  const [participants, setParticipants] = useState(0)
  const [peers, setPeers] = useState<RemotePeer[]>([])
  // True while the local participant is an active speaker (drives own tile glow).
  const [localSpeaking, setLocalSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioBlocked, setAudioBlocked] = useState(false)
  // Whether the local participant currently has publish permission. For a guest
  // this flips true the moment the host accepts their call-in request.
  const [canPublish, setCanPublish] = useState(isHost)
  const [musicPosition, setMusicPosition] = useState(0)
  const [musicDuration, setMusicDuration] = useState(0)
  // True while THIS participant is sharing their screen.
  const [screenShareOn, setScreenShareOn] = useState(false)
  // A remote screen share currently being presented to the room, if any. The UI
  // renders it full-stage via registerProjectionVideoEl. Identity+sid let us
  // re-attach across tile remounts and clear it when the share ends.
  const [remoteProjection, setRemoteProjection] = useState<{ identity: string; sid: string } | null>(null)
  // Mirror of remoteProjection.sid so the once-registered TrackUnsubscribed
  // handler can identify the ending projection without stale closure state.
  const remoteProjectionSidRef = useRef<string | null>(null)
  remoteProjectionSidRef.current = remoteProjection?.sid ?? null

  const hostIdRef = useRef(hostId)
  hostIdRef.current = hostId
  const autoPublishRef = useRef(autoPublish)
  autoPublishRef.current = autoPublish
  // Pre-join device choices, held in refs so the connect callback can read the
  // latest without being torn down and re-run.
  const initialMicOnRef = useRef(initialMicOn)
  initialMicOnRef.current = initialMicOn
  const initialCamOnRef = useRef(initialCamOn)
  initialCamOnRef.current = initialCamOn
  const onAskUnmuteRef = useRef(onAskUnmute)
  onAskUnmuteRef.current = onAskUnmute

  function syncParticipants(room: Room) {
    setParticipants(room.remoteParticipants.size + 1)
  }

  // Recomputes the roster of remote publishers, whether each has live video, and
  // whether their mic is muted.
  const refreshPeers = useCallback((room: Room) => {
    const out: RemotePeer[] = []
    room.remoteParticipants.forEach((p) => {
      const pubs = Array.from(p.trackPublications.values())
      const hasVideo = pubs.some(
        (pub) =>
          pub.kind === Track.Kind.Video &&
          pub.source !== Track.Source.ScreenShare &&
          pub.isSubscribed &&
          Boolean(pub.track),
      )
      const audioPub = pubs.find((pub) => pub.kind === Track.Kind.Audio)
      // Mic is "muted" if there's no audio publication or the publication is muted.
      const micMuted = !audioPub || audioPub.isMuted
      // In a grid meeting every participant gets a tile. Otherwise (broadcast
      // model) only surface publishers so plain viewers aren't empty tiles.
      const canPub = p.permissions?.canPublish ?? false
      if (autoPublishRef.current || canPub || hasVideo) {
        out.push({
          identity: p.identity,
          name: p.name || "Guest",
          image: parseImage(p.metadata),
          isHost: hostIdRef.current != null && p.identity === hostIdRef.current,
          hasVideo,
          micMuted,
          isSpeaking: p.isSpeaking,
        })
      }
    })
    // Host first, then guests in join order.
    out.sort((a, b) => Number(b.isHost) - Number(a.isHost))
    peersRef.current = out
    setPeers(out)
  }, [])

  // Secondary self-view element: the draggable picture-in-picture shown while
  // the host is screen-sharing. LiveKit tracks attach to multiple <video>
  // elements, so the same camera track paints here AND in the main self-view
  // without stealing it from either.
  const selfPipVideoRef = useRef<HTMLVideoElement | null>(null)

  function attachLocalVideo(room: Room): boolean {
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera)
    const track = pub?.track
    // Keep the PiP self-view painting too (multi-attach is safe/no-op if same).
    const pip = selfPipVideoRef.current
    if (track && pip) {
      track.attach(pip)
      pip.muted = true
      pip.setAttribute("playsinline", "true")
      void pip.play().catch(() => {})
    }
    const el = localVideoRef.current
    if (track && el) {
      track.attach(el)
      el.muted = true
      el.setAttribute("playsinline", "true")
      void el.play().catch(() => {})
      setLocalVideoReady(true)
      return true
    }
    return false
  }

  // Callback ref for the screen-share PiP self-view. Re-attaches on every mount
  // (the PiP only exists while sharing, so it mounts/unmounts) exactly like the
  // main self-view, so the camera keeps painting across shows and reconnects.
  const registerSelfPipVideoEl = useCallback((el: HTMLVideoElement | null) => {
    if (el && selfPipVideoRef.current === el) return
    selfPipVideoRef.current = el
    if (!el) return
    const room = roomRef.current
    if (room) attachLocalVideo(room)
  }, [])

  // Callback ref for the self-view <video>. Because tile components can remount
  // (e.g. when their parent re-renders), the underlying <video> node is replaced
  // and the camera track detaches — the object ref alone never re-attaches, so
  // the self-view silently goes blank. Re-attaching on every mount (exactly like
  // the remote tiles do) keeps the local camera painting across remounts.
  const registerLocalVideoEl = useCallback((el: HTMLVideoElement | null) => {
    // Skip if this exact element is already registered — a re-run of the ref
    // callback for an unchanged element must not re-attach (which restarts the
    // camera preview and flickers).
    if (el && localVideoRef.current === el) return
    localVideoRef.current = el
    if (!el) {
      setLocalVideoReady(false)
      return
    }
    const room = roomRef.current
    if (room) attachLocalVideo(room)
  }, [])

  // Attaches a specific remote participant's video to its registered tile.
  const attachPeerVideo = useCallback((identity: string): boolean => {
    const room = roomRef.current
    if (!room) return false
    const p = room.remoteParticipants.get(identity)
    const el = remoteVideoEls.current.get(identity)
    if (!p || !el) return false
    let attached = false
    p.trackPublications.forEach((pub) => {
      // Only the CAMERA feeds a participant tile. A screen-share video pub is
      // rendered full-stage elsewhere (registerProjectionVideoEl); attaching it
      // here would overwrite the camera in the same <video> element.
      if (pub.kind === Track.Kind.Video && pub.source !== Track.Source.ScreenShare && pub.track) {
        pub.track.attach(el)
        el.muted = true
        el.setAttribute("playsinline", "true")
        void el.play().catch(() => {})
        attached = true
      }
    })
    return attached
  }, [])

  // The UI calls this from a ref callback to (de)register a tile's <video>.
  const registerPeerVideoEl = useCallback(
    (identity: string, el: HTMLVideoElement | null) => {
      if (el) {
        // Skip if this exact element is already registered — prevents a track
        // re-attach (which restarts playback / flickers) when a ref callback
        // re-runs for an unchanged element.
        if (remoteVideoEls.current.get(identity) === el) return
        remoteVideoEls.current.set(identity, el)
        attachPeerVideo(identity)
      } else {
        remoteVideoEls.current.delete(identity)
      }
    },
    [attachPeerVideo],
  )

  // Paints the currently-shared screen — the LOCAL share first (so the sharer
  // sees their own confidence preview), else any REMOTE share — into the
  // registered full-stage projection element. Safe to call repeatedly (attach is
  // idempotent per element).
  const attachProjection = useCallback(() => {
    const room = roomRef.current
    const el = projectionVideoElRef.current
    if (!room || !el) return
    // Local screen share (the host/presenter's own preview).
    for (const pub of room.localParticipant.trackPublications.values()) {
      if (pub.source === Track.Source.ScreenShare && pub.track) {
        pub.track.attach(el)
        el.muted = true
        el.setAttribute("playsinline", "true")
        void el.play().catch(() => {})
        return
      }
    }
    // Otherwise a remote participant's screen share.
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        if (pub.source === Track.Source.ScreenShare && pub.track) {
          pub.track.attach(el)
          el.muted = true
          el.setAttribute("playsinline", "true")
          void el.play().catch(() => {})
          return
        }
      }
    }
  }, [])

  // The UI registers the full-stage <video> that renders the screen share
  // (local or remote).
  const registerProjectionVideoEl = useCallback(
    (el: HTMLVideoElement | null) => {
      if (el && projectionVideoElRef.current === el) return
      projectionVideoElRef.current = el
      if (el) attachProjection()
    },
    [attachProjection],
  )

  // When the LOCAL screen share flips on, (re)paint the sharer's own preview.
  useEffect(() => {
    if (screenShareOn) attachProjection()
  }, [screenShareOn, attachProjection])

  // Attaches a REMOTE participant's audio to a single <audio> element. Only ever
  // called for remote tracks (RoomEvent.TrackSubscribed and the post-connect
  // remote-participant sweep both fire for remotes only), so the local mic can
  // never be routed back into our own speaker here.
  //
  // Idempotent by design: `track.attach()` mints a NEW element on every call, so
  // the post-connect sweep + a TrackSubscribed event (or a reconnect / track
  // renegotiation) would otherwise leave a first element orphaned in the DOM,
  // still playing — a duplicate/echoing second voice. We first detach every
  // existing element bound to this track and drop any prior map entry, so a
  // single track always resolves to exactly one live playback element.
  function attachRemoteAudio(track: RemoteTrack, participant: RemoteParticipant) {
    const key = participant.identity + ":" + track.sid
    track.detach().forEach((prev) => prev.remove())
    const stale = audioElsRef.current.get(key)
    if (stale) {
      releaseRemoteAudioRoute(stale)
      stale.remove()
    }
    const el = track.attach()
    el.autoplay = true
    audioElsRef.current.set(key, el)
    document.body.appendChild(el)
    // On Android, force this remote voice to the loudspeaker (no-op elsewhere).
    routeRemoteAudioToSpeaker(el)
  }

  // Acquire a screen wake lock (idempotent). No-op where unsupported; recording
  // still proceeds without it.
  const requestWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> }
      }
      if (!nav.wakeLock || wakeLockRef.current) return
      wakeLockRef.current = await nav.wakeLock.request("screen")
    } catch {
      /* wake lock unavailable or denied — recording still proceeds */
    }
  }, [])

  const releaseWakeLock = useCallback(() => {
    const wl = wakeLockRef.current
    wakeLockRef.current = null
    if (wl) void wl.release().catch(() => {})
  }, [])

  const cleanup = useCallback(() => {
    // When a save is finalizing the recording (host ended the session and we're
    // awaiting the last chunk), leave the recorder AND compositor alone —
    // `stopRecording` tears them down once `onstop` fires. Tearing them down
    // here would end the recorded tracks mid-finalize and empty the blob. We
    // still disconnect the room below so the live session ends for everyone.
    if (!finalizingRef.current) {
      // Stop any in-progress recording so the camera/mic tracks are released.
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop()
        } catch {
          /* already stopped */
        }
      }
      // Tear down the composite canvas/audio graph if it's still running.
      if (compositorRef.current) {
        compositorRef.current.stop()
        compositorRef.current = null
      }
    }
    const room = roomRef.current
    if (room) {
      room.disconnect()
      roomRef.current = null
    }
    if (musicTrackRef.current) {
      try {
        musicTrackRef.current.stop()
      } catch {
        /* already stopped */
      }
      musicTrackRef.current = null
    }
    if (videoAudioTrackRef.current) {
      try {
        videoAudioTrackRef.current.stop()
      } catch {
        /* already stopped */
      }
      videoAudioTrackRef.current = null
    }
    if (videoProjectionTrackRef.current) {
      try {
        videoProjectionTrackRef.current.stop()
      } catch {
        /* already stopped */
      }
      videoProjectionTrackRef.current = null
    }
    if (musicElRef.current) musicElRef.current.pause()
    audioElsRef.current.forEach((el) => {
      releaseRemoteAudioRoute(el)
      el.remove()
    })
    audioElsRef.current.clear()
    // Restore the neutral, high-fidelity output profile so ordinary media played
    // after leaving the live isn't stuck muffled in the mic-oriented session.
    releaseAudioRouting()
    releaseWakeLock()
  }, [releaseWakeLock])

  const connect = useCallback(async () => {
    if (roomRef.current || !token || !serverUrl) return
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      // Force a proper HD capture at the shared full-sensor 4:3 format (see
      // CAPTURE_RESOLUTION). Android Chrome otherwise defaults to a low ~480p
      // capture; requesting 1440x1080 explicitly gives a crisp, wide "far out"
      // frame on every device. The camera flip requests this SAME format, so
      // the framing never changes between the initial publish and a flip.
      videoCaptureDefaults: {
        resolution: CAPTURE_RESOLUTION,
      },
      // Microphone capture DSP. Echo cancellation, noise suppression and auto
      // gain control are ENABLED. This is the foundational fix for self-voice
      // feedback: when a remote participant is unmuted, their device plays our
      // voice out of their speaker and their mic re-captures it — without AEC
      // that returns to us as echo/delayed self-voice. The browser's acoustic
      // echo canceller removes that speaker-bleed at the capture stage, so the
      // system works even on phone/laptop/Bluetooth speakers (never relying on
      // participants wearing headphones). Genuine background music is published
      // on a SEPARATE dedicated track (see the music track below), so enabling
      // mic DSP here does not degrade music fidelity.
      //
      // The mic is captured MONO (channelCount: 1). A mic is a single-capsule
      // mono source; asking it for a 2-channel capture makes some devices put
      // the voice in only the LEFT channel (right silent), which the stereo
      // encoder relays faithfully — so viewers hear the host in one ear only.
      // Mono capture is rendered to both ears equally.
      audioCaptureDefaults: LIVE_MIC_CONSTRAINTS,
      publishDefaults: {
        // Simulcast so viewers on weak networks still receive a lower layer,
        // while good connections get the full-quality feed. 4:3 layers match
        // the 4:3 capture so every layer keeps the same framing.
        videoSimulcastLayers: [VideoPresets43.h360, VideoPresets43.h540],
        // Publish the full 1440x1080 layer at up to ~8 Mbps / 30 fps. The
        // server-side egress that records the replay SUBSCRIBES to this top
        // layer, so its bitrate is the hard ceiling on replay sharpness: the
        // recorder cannot add detail the source never sent. maxBitrate is a
        // CEILING, not a floor — congestion control uses less when the uplink is
        // weak — so raising it only helps on good networks and never forces too
        // much onto a poor one. The egress is given headroom ABOVE this (see
        // livekit-egress.ts) so the MP4 preserves the source instead of
        // re-compressing it.
        videoEncoding: { maxBitrate: 8_000_000, maxFramerate: 30 },
        // "maintain-framerate" is the correct preference for a RECORDED talking-
        // head stream, and it fixes two things at once:
        //  • A/V SYNC. "balanced"/"maintain-resolution" let the publisher vary
        //    the frame rate under any network dip, producing a variable-frame-
        //    rate source. The egress muxes that against a constant audio clock
        //    into a fixed 30 fps MP4, so the timing gaps accumulate over a long
        //    session and surface as lip-sync drift. Holding a steady 30 fps
        //    gives the egress a stable cadence to align audio against.
        //  • SMOOTHNESS. A constant 30 fps simply looks smoother than a fps that
        //    sags under load. Under congestion it sheds RESOLUTION instead (and
        //    recovers afterward), which is far less noticeable than dropped
        //    frames on motion.
        degradationPreference: "maintain-framerate",
        // Highest-fidelity voice: an explicit 128 kbps MONO Opus preset (above
        // even musicHighQuality's 96 kbps, and ~5x the 24 kbps speech default).
        // At 128 kbps mono, Opus is effectively transparent for a spoken voice,
        // so the mic is never the bottleneck; "high" priority protects the
        // audio bitrate ahead of video when the uplink tightens (you'd rather
        // lose a little image sharpness than have the sermon audio break up).
        // forceStereo is intentionally NOT set — the mic is a mono source; the
        // genuinely-stereo background music opts into stereo on its own track.
        audioPreset: LIVE_VOICE_PRESET,
        // DTX off avoids the discontinuous-transmission codec swirling/clipping
        // quiet passages and room tone (it's meant for choppy VoIP, not a clean
        // continuous broadcast). RED duplicates audio packets so brief network
        // loss doesn't cause dropouts/robotic artifacts — both keep the voice
        // continuous and clean.
        dtx: false,
        red: true,
      },
    })
    roomRef.current = room

    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant) => {
        if (track.kind === Track.Kind.Video) {
          // Egress-only projection pixels: never render (each follower already
          // paints its own in-sync copy from live_video_state).
          if (_pub.trackName === VIDEO_PROJECTION_TRACK) return
          // A remote screen share is presented full-stage, not as a camera tile.
          if (_pub.source === Track.Source.ScreenShare) {
            setRemoteProjection({ identity: p.identity, sid: track.sid ?? _pub.trackSid })
            attachProjection()
            return
          }
          attachPeerVideo(p.identity)
          refreshPeers(room)
        }
        if (track.kind === Track.Kind.Audio) {
          // The host's shared-video audio is recorded server-side; nobody plays
          // it locally (they hear their own synced copy), so don't attach it.
          if (_pub.trackName === VIDEO_AUDIO_TRACK) return
          attachRemoteAudio(track, p)
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, p: RemoteParticipant) => {
        // A remote screen share ending clears the full-stage projection.
        if (_pub?.source === Track.Source.ScreenShare || track.sid === remoteProjectionSidRef.current) {
          track.detach().forEach((el) => el.remove())
          setRemoteProjection(null)
          if (track.kind === Track.Kind.Video) refreshPeers(room)
          return
        }
        const routed = audioElsRef.current.get(p.identity + ":" + track.sid)
        if (routed) releaseRemoteAudioRoute(routed)
        track.detach().forEach((el) => el.remove())
        audioElsRef.current.delete(p.identity + ":" + track.sid)
        if (track.kind === Track.Kind.Video) refreshPeers(room)
      })
      // Attach the local camera the instant LiveKit confirms it's published.
      .on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
        if (pub.source === Track.Source.Camera) {
          setCamOn(true)
          attachLocalVideo(room)
        }
        if (pub.source === Track.Source.ScreenShare) setScreenShareOn(true)
      })
      // The browser's own "Stop sharing" bar ends the screen share outside our
      // controls — reflect that in state so the UI resets.
      .on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
        if (pub.source === Track.Source.ScreenShare) setScreenShareOn(false)
      })
      .on(RoomEvent.ParticipantConnected, () => {
        syncParticipants(room)
        refreshPeers(room)
      })
      .on(RoomEvent.ParticipantDisconnected, () => {
        syncParticipants(room)
        refreshPeers(room)
      })
      .on(RoomEvent.TrackPublished, () => refreshPeers(room))
      .on(RoomEvent.TrackUnpublished, () => refreshPeers(room))
      // Keep the per-tile mic indicator in sync (incl. host force-mutes).
      .on(RoomEvent.TrackMuted, () => refreshPeers(room))
      .on(RoomEvent.TrackUnmuted, () => refreshPeers(room))
      // Host → participant "please unmute" request over the data channel.
      .on(RoomEvent.DataReceived, (payload: Uint8Array) => {
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload)) as { type?: string }
          if (msg.type === "ask-unmute") onAskUnmuteRef.current?.()
        } catch {
          /* ignore malformed data messages */
        }
      })
      // Host accepted/dropped this client as a guest: publish or unpublish.
      .on(RoomEvent.ParticipantPermissionsChanged, async () => {
        const canPub = room.localParticipant.permissions?.canPublish ?? false
        setCanPublish(canPub)
        if (canPub && !isHost) {
          try {
            await room.localParticipant.setMicrophoneEnabled(true)
            // Promoted guest just opened their mic → force loudspeaker off the
            // earpiece, same as the host path.
            applyAudioRouting()
            setMicOn(true)
            // A promoted guest must get the EXACT same camera as the host, not a
            // one-shot fixed request. enableCameraResilient runs the full
            // full-sensor 1440x1080 → 720 → bare fallback chain, so the guest's
            // feed is wide-angle and HD on the same Android/iOS devices where a
            // single fixed request silently failed or fell back to a low ~480p
            // default. The room's videoCaptureDefaults + simulcast/encoding
            // (8 Mbps top layer) already apply to the guest's publish, so once
            // the capture is HD the published quality matches the host's.
            await enableCameraResilient(room)
            setCamOn(true)
            attachLocalVideo(room)
          } catch {
            /* device permission denied — UI still reflects canPublish */
          }
        }
        if (!canPub && !isHost) {
          setLocalVideoReady(false)
          await room.localParticipant.setCameraEnabled(false).catch(() => {})
          await room.localParticipant.setMicrophoneEnabled(false).catch(() => {})
          setCamOn(false)
          setMicOn(false)
        }
        refreshPeers(room)
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!room.canPlaybackAudio))
      // Active speakers → refresh peer glow + track whether we're speaking.
      .on(RoomEvent.ActiveSpeakersChanged, () => {
        setLocalSpeaking(room.localParticipant.isSpeaking)
        refreshPeers(room)
      })
      .on(RoomEvent.Disconnected, () => setConnected(false))

    // Neutralise the iOS audio session BEFORE any mic opens, so the later
    // applyAudioRouting reads as a real transition and iOS hands back the
    // loudspeaker instead of the earpiece. See lib/audio-routing.ts.
    prepareAudioRouting()

    try {
      await withTimeout(
        room.connect(serverUrl, token),
        20000,
        "Connecting to the live server timed out. Please try again.",
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to the stream.")
      room.disconnect()
      roomRef.current = null
      return
    }

    syncParticipants(room)
    setConnected(true)
    setCanPublish(room.localParticipant.permissions?.canPublish ?? isHost)

    // Attach any tracks that were already published before we connected.
    room.remoteParticipants.forEach((p) => {
      attachPeerVideo(p.identity)
      p.trackPublications.forEach((pub) => {
        if (pub.kind === Track.Kind.Audio && pub.track && pub.trackName !== VIDEO_AUDIO_TRACK)
          attachRemoteAudio(pub.track, p)
      })
    })
    refreshPeers(room)

    // Make sure remote audio can actually play (mobile autoplay policies).
    try {
      await room.startAudio()
    } catch {
      /* handled via audioBlocked */
    }
    setAudioBlocked(!room.canPlaybackAudio)

    // The host always publishes immediately. In a grid meeting every participant
    // also auto-publishes (Meet/Zoom style). Plain broadcast viewers publish only
    // when the host accepts their call-in (handled in PermissionsChanged above).
    if (isHost || autoPublish) {
      // Honor the participant's pre-join choices: enter muted / camera-off when
      // they opted out. The host always goes live with both on.
      const wantMic = isHost ? true : initialMicOnRef.current
      const wantCam = isHost ? true : initialCamOnRef.current
      if (wantMic) {
        try {
          await room.localParticipant.setMicrophoneEnabled(true)
        } catch {
          setMicOn(false)
        }
      } else {
        setMicOn(false)
      }
      if (!wantCam) {
        setCamOn(false)
      } else {
        try {
          await enableCameraResilient(room)
          attachLocalVideo(room)
        } catch (e) {
          setCamOn(false)
          setError(describeMediaError(e))
        }
      }
      // Once a mic is publishing, force the loudspeaker: opening the mic makes
      // iOS default the output to the earpiece, which is wrong for a broadcast
      // or meeting. No-op off iOS. (Bluetooth/wired headsets still take over.)
      if (wantMic) applyAudioRouting()
    }
  }, [token, serverUrl, isHost, autoPublish, attachPeerVideo, refreshPeers])

  // Connect on mount once we have credentials; tear down on unmount.
  useEffect(() => {
    if (token && serverUrl) void connect()
    return () => cleanup()
  }, [token, serverUrl, connect, cleanup])

  // (Re)attach the local camera to the self-view whenever it becomes visible.
  useEffect(() => {
    if (!camOn || !connected) return
    const room = roomRef.current
    if (room) attachLocalVideo(room)
  }, [camOn, connected])

  // Safety net: keep retrying the self-view attach for a few seconds while the
  // camera is on but the track hasn't started painting yet.
  useEffect(() => {
    if (!connected || !camOn || localVideoReady) return
    const room = roomRef.current
    if (!room) return
    let tries = 0
    const id = setInterval(() => {
      tries += 1
      if (attachLocalVideo(room) || tries >= 24) clearInterval(id)
    }, 250)
    return () => clearInterval(id)
  }, [connected, camOn, localVideoReady])

  const toggleMic = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !micOn
    await room.localParticipant.setMicrophoneEnabled(next)
    // Reopening the mic can bounce iOS back to the earpiece, so re-assert the
    // loudspeaker each time it goes on.
    if (next) applyAudioRouting()
    setMicOn(next)
  }, [micOn])

  // Host asks a specific participant to unmute (server can't reopen a mic
  // silently, so we send a targeted data message and they choose to accept).
  const askUnmute = useCallback(async (identity: string) => {
    const room = roomRef.current
    if (!room) return
    const data = new TextEncoder().encode(JSON.stringify({ type: "ask-unmute" }))
    try {
      await room.localParticipant.publishData(data, { reliable: true, destinationIdentities: [identity] })
    } catch {
      /* participant gone */
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const toggleCam = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = !camOn
    if (!next) {
      setLocalVideoReady(false)
      await room.localParticipant.setCameraEnabled(false).catch(() => {})
      setCamOn(false)
      return
    }
    // Turning the camera on (also used as the "retry" after a permission error).
    setError(null)
    try {
      await enableCameraResilient(room)
      setCamOn(true)
      attachLocalVideo(room)
    } catch (e) {
      setCamOn(false)
      setError(describeMediaError(e))
    }
  }, [camOn])

  const flipCamera = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const next = facingMode === "user" ? "environment" : "user"
    setLocalVideoReady(false)

    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera)
    const track = pub?.videoTrack

    // Read the true facingMode of the live track and sync it into state, so the
    // mirror transform (front = mirrored, back = not) always matches the real
    // camera. This is the crux of the Android bug: the old code assumed the flip
    // succeeded and toggled `facingMode` regardless, so when the physical switch
    // silently failed the *only* visible change was the self-view flipping
    // mirrored/un-mirrored — looking like a mirror toggle instead of a real
    // front/back switch.
    const syncActualFacing = () => {
      const settings = track?.mediaStreamTrack.getSettings() as MediaTrackSettings & {
        facingMode?: string
      }
      const actual = settings?.facingMode
      if (actual === "user" || actual === "environment") {
        setFacingMode(actual)
      } else {
        // Browser doesn't report facingMode (common on desktop) — trust `next`.
        setFacingMode(next)
      }
    }

    try {
      // Primary path: restart the existing track with the opposite facing.
      // `restartTrack` performs a *fresh* getUserMedia (it stops the old track
      // first) rather than applyConstraints on a live track — the latter is what
      // Android silently ignored, producing the "nothing happens but the mirror
      // flips" symptom. A fresh acquisition actually moves to the other camera.
      if (track) {
        try {
          // Pass the SAME resolution as the initial publish. `restartTrack`
          // replaces the capture constraints wholesale, so omitting it is what
          // made the framing change after a flip on Android.
          await track.restartTrack({ facingMode: next, resolution: CAPTURE_RESOLUTION })
        } catch {
          // The facing restart failed (e.g. this device doesn't expose a camera
          // tagged with the requested facingMode). Fall back to enumerating the
          // video inputs and switching to one whose *label* matches the desired
          // front/back camera — the key fix over the old code, which picked the
          // first different camera and often landed on another front lens,
          // looking like nothing but a mirror flip.
          const currentDeviceId = track.mediaStreamTrack.getSettings().deviceId
          const devices = await navigator.mediaDevices.enumerateDevices()
          const cams = devices.filter((d) => d.kind === "videoinput" && d.deviceId)
          const wantBack = next === "environment"
          const labelMatch = cams.find((c) => {
            const l = c.label.toLowerCase()
            return wantBack ? /back|rear|environment/.test(l) : /front|face|user/.test(l)
          })
          const target = labelMatch ?? cams.find((c) => c.deviceId !== currentDeviceId)
          if (target && target.deviceId !== currentDeviceId) {
            await room.switchActiveDevice("videoinput", target.deviceId)
          }
        }
      } else {
        await room.localParticipant.setCameraEnabled(true, {
          facingMode: next,
          resolution: CAPTURE_RESOLUTION,
        })
      }
      syncActualFacing()
      setCamOn(true)
      attachLocalVideo(room)
    } catch {
      // Only one camera, or the constraint was rejected outright — keep the
      // current facing (don't toggle the mirror) and restore the self-view so
      // the frame doesn't stay blank.
      attachLocalVideo(room)
    }
  }, [facingMode])

  const startAudioPlayback = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    try {
      await room.startAudio()
    } catch {
      /* ignore */
    }
    // A user gesture is what a suspended Android playout context needs.
    resumeSpeakerPlayout()
    audioElsRef.current.forEach((el) => void el.play().catch(() => {}))
    // This tap is a user gesture, exactly what a suspended or OS-interrupted
    // AudioContext needs to restart, so recover local music monitoring here too
    // rather than only the remote voices.
    if (musicCtxRef.current) await ensureCtxRunning(musicCtxRef.current)
    // Only restart a track that had actually been loaded and got cut off.
    const musicEl = musicElRef.current
    if (musicEl?.src && musicEl.paused) void musicEl.play().catch(() => {})
    setAudioBlocked(!room.canPlaybackAudio)
  }, [])

  /**
   * Publishes an uploaded audio file as a second track so everyone in the room
   * hears the backing music mixed into the broadcast. Routes the <audio> element
   * through a WebAudio gain + low-shelf graph into a published MediaStreamTrack.
   */
  const publishMusic = useCallback(async (url: string) => {
    const room = roomRef.current
    if (!room) return

    // 48 kHz matches Opus's native rate so the mixed music feed isn't resampled
    // before publishing — keeps it clean and crisp.
    const ctx = musicCtxRef.current ?? new AudioContext({ sampleRate: 48000 })
    musicCtxRef.current = ctx
    // Also covers Safari's "interrupted" state, which a suspended-only check
    // misses — see ensureCtxRunning.
    await ensureCtxRunning(ctx)

    let el = musicElRef.current
    if (!el) {
      el = new Audio()
      el.crossOrigin = "anonymous"
      musicElRef.current = el
      el.onloadedmetadata = () => {
        setMusicDuration(el!.duration || 0)
        setMusicPosition(0)
      }
      el.ontimeupdate = () => setMusicPosition(el!.currentTime)
      el.onended = () => {
        if (!musicLoopRef.current) musicEndedRef.current?.()
      }
    }

    if (!musicSourceRef.current) {
      const source = ctx.createMediaElementSource(el)
      // Shared studio chain (high-pass → warmth → harshness dip → gain →
      // compressor → limiter), identical to every other Live type. Starts at
      // the host's intended base level (not a hardcoded 0.4): with mic echo
      // cancellation on, the host's own speaker output is treated as echo and
      // suppressed, so a low starting gain made the music sound muffled.
      const chain = buildMusicChain(ctx, source, musicBaseVolumeRef.current)
      chain.output.connect(ctx.destination)
      musicSourceRef.current = source
      musicGainRef.current = chain.gain
      musicChainOutRef.current = chain.output
    }

    el.loop = musicLoopRef.current
    el.src = url
    el.currentTime = 0
    setMusicPosition(0)
    await el.play().catch(() => {})

    if (!musicTrackRef.current) {
      const chainOut = musicChainOutRef.current!
      // Two channels so the high-quality stereo preset actually carries stereo.
      const dest = ctx.createMediaStreamDestination()
      dest.channelCount = 2
      chainOut.connect(dest)
      const [mediaTrack] = dest.stream.getAudioTracks()
      const localTrack = new LocalAudioTrack(mediaTrack)
      // Publish background music with a high-quality stereo preset so it stays
      // clear and crisp. forceStereo is set explicitly here (the room defaults
      // are now mono, tuned for the voice mic) so the music keeps its real
      // stereo image. DTX (discontinuous transmission) and RED (redundancy) are
      // meant for speech and muddy sustained music, so disable both.
      await room.localParticipant.publishTrack(localTrack, {
        name: "background-music",
        audioPreset: AudioPresets.musicHighQualityStereo,
        forceStereo: true,
        dtx: false,
        red: false,
      })
      musicTrackRef.current = localTrack
    }
  }, [])

  /** Smoothly ramps the music gain (no sudden jumps). */
  const rampMusicVolume = useCallback((target: number, ms = 300) => {
    rampGain(musicCtxRef.current, musicGainRef.current, target, ms)
  }, [])

  const setMusicVolume = useCallback(
    (value: number) => {
      // Remember the host's chosen level so ducking can restore to it.
      musicBaseVolumeRef.current = value
      rampMusicVolume(value, 120)
    },
    [rampMusicVolume],
  )

  /**
   * Ducks (or restores) background music around live speech. When `ducked`, the
   * gain fades to DUCK_FACTOR of the host's base volume; otherwise it fades back
   * to the full base. Driven by the host's "Lower music under speech" toggle —
   * when the host turns it off, `ducked = false` keeps music at full. Fades are
   * smooth, and the factor is shared across every Live type.
   */
  const duckMusic = useCallback(
    (ducked: boolean, ms = 320) => {
      const base = musicBaseVolumeRef.current
      rampMusicVolume(ducked ? base * DUCK_FACTOR : base, ms)
    },
    [rampMusicVolume],
  )

  const setMusicPlaying = useCallback((playing: boolean) => {
    const el = musicElRef.current
    if (!el) return
    if (playing) void el.play().catch(() => {})
    else el.pause()
  }, [])

  const seekMusic = useCallback((seconds: number) => {
    const el = musicElRef.current
    if (!el) return
    el.currentTime = Math.max(0, Math.min(seconds, el.duration || seconds))
    setMusicPosition(el.currentTime)
  }, [])

  const setMusicLoop = useCallback((loop: boolean) => {
    musicLoopRef.current = loop
    if (musicElRef.current) musicElRef.current.loop = loop
  }, [])

  const setMusicEndedHandler = useCallback((fn: (() => void) | null) => {
    musicEndedRef.current = fn
  }, [])

  const stopMusic = useCallback(async () => {
    const room = roomRef.current
    if (musicTrackRef.current && room) {
      await room.localParticipant.unpublishTrack(musicTrackRef.current)
      musicTrackRef.current.stop()
      musicTrackRef.current = null
    }
    if (musicElRef.current) musicElRef.current.pause()
  }, [])

  /**
   * Publish the host's shared-video audio (from a Web Audio MediaStreamTrack the
   * panel taps off its <video>) as a dedicated LiveKit track, so the egress
   * recording captures it into the replay — the same mechanism as background
   * music. Idempotent per source: re-publishing swaps the track. Followers never
   * play it (see VIDEO_AUDIO_TRACK guard); it exists purely for the recording.
   */
  const publishVideoAudioTrack = useCallback(async (mediaTrack: MediaStreamTrack) => {
    const room = roomRef.current
    if (!room) return
    // Replace any previous video-audio track first.
    if (videoAudioTrackRef.current) {
      try {
        await room.localParticipant.unpublishTrack(videoAudioTrackRef.current)
      } catch {
        /* already gone */
      }
      videoAudioTrackRef.current.stop()
      videoAudioTrackRef.current = null
    }
    const localTrack = new LocalAudioTrack(mediaTrack)
    await room.localParticipant.publishTrack(localTrack, {
      name: VIDEO_AUDIO_TRACK,
      audioPreset: AudioPresets.musicHighQualityStereo,
      forceStereo: true,
      dtx: false,
      red: false,
    })
    videoAudioTrackRef.current = localTrack
  }, [])

  /** Unpublish the shared-video audio track (host stopped/replaced the video). */
  const unpublishVideoAudioTrack = useCallback(async () => {
    const room = roomRef.current
    if (videoAudioTrackRef.current && room) {
      try {
        await room.localParticipant.unpublishTrack(videoAudioTrackRef.current)
      } catch {
        /* already gone */
      }
      videoAudioTrackRef.current.stop()
      videoAudioTrackRef.current = null
    }
  }, [])

  /**
   * Start sharing this device's screen. Publishes a LiveKit ScreenShare video
   * track (+ its system audio when the OS/browser allows), which every follower
   * renders full-stage and the egress records into the replay. No-op where
   * getDisplayMedia is unavailable (mobile / Median). The browser's own "Stop
   * sharing" affordance ends it too — handled via LocalTrackUnpublished.
   */
  const startScreenShare = useCallback(async () => {
    const room = roomRef.current
    if (!room || !canScreenShareHere()) return false
    try {
      await room.localParticipant.setScreenShareEnabled(
        true,
        {
          // Capture the system/tab audio as clean, full-bandwidth MEDIA — not
          // voice. Passing `audio: true` lets the browser apply mic-oriented DSP
          // (echo cancellation, noise suppression, auto-gain) to the captured
          // audio, which pumps, thins and muffles music/media. This audio never
          // comes from a mic, so there's no echo to cancel; disabling DSP and
          // asking for stereo at 48 kHz preserves the source quality.
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 2,
            sampleRate: 48000,
          },
          resolution: ScreenSharePresets.h1080fps15.resolution,
        },
        {
          name: "screen",
          // Publish the shared audio at music-grade stereo bitrate (128 kbps)
          // instead of the default low speech bitrate, and keep it continuous
          // (no DTX gaps) so media/music comes through clean.
          audioPreset: AudioPresets.musicHighQualityStereo,
          dtx: false,
          red: false,
          forceStereo: true,
        },
      )
      setScreenShareOn(true)
      return true
    } catch {
      // User dismissed the picker or the OS denied capture — stay off silently.
      setScreenShareOn(false)
      return false
    }
  }, [])

  /** Stop sharing this device's screen. */
  const stopScreenShare = useCallback(async () => {
    const room = roomRef.current
    if (room) {
      try {
        await room.localParticipant.setScreenShareEnabled(false)
      } catch {
        /* already off */
      }
    }
    setScreenShareOn(false)
  }, [])

  /**
   * Publish the projected video's PIXELS (a captureStream track off the host's
   * synced <video>) purely so the egress records the projection into the replay.
   * Followers never render it — they paint their own in-sync copy — so it is
   * name-guarded (VIDEO_PROJECTION_TRACK) out of every live path. Mirrors
   * publishVideoAudioTrack; idempotent (re-publishing swaps the track).
   */
  const publishVideoProjectionTrack = useCallback(async (mediaTrack: MediaStreamTrack) => {
    const room = roomRef.current
    if (!room) return
    if (videoProjectionTrackRef.current) {
      try {
        await room.localParticipant.unpublishTrack(videoProjectionTrackRef.current)
      } catch {
        /* already gone */
      }
      videoProjectionTrackRef.current.stop()
      videoProjectionTrackRef.current = null
    }
    const localTrack = new LocalVideoTrack(mediaTrack)
    await room.localParticipant.publishTrack(localTrack, {
      name: VIDEO_PROJECTION_TRACK,
      source: Track.Source.Unknown,
      simulcast: false,
      degradationPreference: "maintain-resolution",
    })
    videoProjectionTrackRef.current = localTrack
  }, [])

  /** Unpublish the egress-only projection pixels track. */
  const unpublishVideoProjectionTrack = useCallback(async () => {
    const room = roomRef.current
    if (videoProjectionTrackRef.current && room) {
      try {
        await room.localParticipant.unpublishTrack(videoProjectionTrackRef.current)
      } catch {
        /* already gone */
      }
      videoProjectionTrackRef.current.stop()
      videoProjectionTrackRef.current = null
    }
  }, [])

  /**
   * Begin recording the host's session (idempotent). Records a COMPOSITE of the
   * whole call — every participant's camera tile in a grid, plus a mix of
   * everyone's audio — so the saved replay matches what viewers saw live rather
   * than only the host's own camera. No-op off the host path, without
   * MediaRecorder support, or if already recording.
   */
  const startRecording = useCallback(() => {
    if (recordingStartedRef.current) return
    if (typeof MediaRecorder === "undefined") return
    const room = roomRef.current
    if (!room) return

    let stream: MediaStream
    let compositor: LiveCompositor
    try {
      compositor = new LiveCompositor({
        aspect: recordAspectRef.current,
        // Ordered tiles: the local host first, then every remote peer. Each
        // tile re-reads its live <video> element every frame, so camera on/off
        // and late joiners are captured as they happen.
        getSources: () => {
          const sources: CompositorSource[] = []
          sources.push({
            id: room.localParticipant.identity,
            videoEl: localVideoRef.current,
            label: room.localParticipant.name || "Host",
          })
          for (const peer of peersRef.current) {
            sources.push({
              id: peer.identity,
              videoEl: remoteVideoEls.current.get(peer.identity) ?? null,
              label: peer.name,
            })
          }
          return sources
        },
        // Every audio track in the room: host mic, each guest mic, and the
        // background-music track the host is publishing.
        getAudioTracks: () => {
          const tracks: MediaStreamTrack[] = []
          const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack
          if (mic) tracks.push(mic)
          room.remoteParticipants.forEach((p) => {
            p.trackPublications.forEach((pub) => {
              if (pub.kind === Track.Kind.Audio && pub.track?.mediaStreamTrack) tracks.push(pub.track.mediaStreamTrack)
            })
          })
          const music = musicTrackRef.current?.mediaStreamTrack
          if (music) tracks.push(music)
          return tracks
        },
      })
      stream = compositor.start()
      if (stream.getVideoTracks().length === 0) {
        compositor.stop()
        return
      }
    } catch {
      return
    }
    compositorRef.current = compositor

    const mime = pickVideoRecordingMime()
    recordMimeRef.current = mime || "video/webm"
    let rec: MediaRecorder
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    } catch {
      compositor.stop()
      compositorRef.current = null
      return
    }
    recordChunksRef.current = []
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordChunksRef.current.push(e.data)
    }
    try {
      rec.start(1000) // gather data in 1s slices so a crash still yields most of the take
    } catch {
      compositor.stop()
      compositorRef.current = null
      return
    }
    recorderRef.current = rec
    recordingStartedRef.current = true
    recordStartMsRef.current = Date.now()
    // Keep the screen/page awake so a dimming phone can't background the tab and
    // truncate the recording.
    void requestWakeLock()
  }, [requestWakeLock])

  /**
   * Stop recording and resolve the assembled video blob (or null if nothing was
   * captured). Safe to call multiple times.
   */
  const stopRecording = useCallback((): Promise<Blob | null> => {
    // Claim ownership of teardown so a concurrent `cleanup()`/`disconnect()`
    // (the console calls both when the host ends the session) doesn't kill the
    // recorder and compositor before the final chunk is flushed.
    finalizingRef.current = true
    return new Promise((resolve) => {
      const rec = recorderRef.current
      const assemble = () =>
        recordChunksRef.current.length > 0 ? new Blob(recordChunksRef.current, { type: recordMimeRef.current }) : null
      const done = (blob: Blob | null) => {
        finalizingRef.current = false
        releaseWakeLock()
        const durationMs = recordStartMsRef.current > 0 ? Date.now() - recordStartMsRef.current : 0
        if (!blob) {
          resolve(null)
          return
        }
        // The composite records in real time, so elapsed wall-clock === video
        // length. Inject it into the WebM header before handing the blob to the
        // uploader; if the patch fails, fall back to the raw blob so saving is
        // never blocked.
        void fixRecordedVideoDuration(blob, durationMs).then(
          (fixed) => resolve(fixed),
          () => resolve(blob),
        )
      }
      const tearDownCompositor = () => {
        if (compositorRef.current) {
          compositorRef.current.stop()
          compositorRef.current = null
        }
      }
      if (!rec || rec.state === "inactive") {
        tearDownCompositor()
        done(assemble())
        return
      }
      // Flush any buffered data before stopping so the tail isn't lost.
      try {
        rec.requestData()
      } catch {
        /* not all implementations support requestData */
      }
      rec.onstop = () => {
        recorderRef.current = null
        tearDownCompositor()
        done(assemble())
      }
      try {
        rec.stop()
      } catch {
        tearDownCompositor()
        done(assemble())
      }
    })
  }, [releaseWakeLock])

  // Start recording as soon as the host is connected — NOT gated on the camera.
  // The compositor records the composited canvas (which always yields a video
  // track and draws placeholder tiles when a camera is off) and re-scans audio
  // every second, so it captures the whole session even if the host starts with
  // their camera off or their self-view hasn't painted yet. Gating on
  // `camOn && localVideoReady` was why camera-off / slow-attach video sessions
  // produced an empty recording and silently failed to save. `startRecording`
  // is idempotent, so re-runs when the camera later turns on are no-ops.
  useEffect(() => {
    // When the replay is recorded server-side by egress, skip the client-side
    // capture entirely — running both would double-record and re-introduce the
    // old truncated device-side blob.
    if (recordOnServer) return
    if (isHost && connected) startRecording()
  }, [isHost, connected, startRecording, recordOnServer])

  // The screen wake lock is auto-released by the browser whenever the page is
  // hidden. Re-acquire it the moment the host returns while still recording, so
  // the screen won't dim/lock again for the rest of the session.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && recordingStartedRef.current && !finalizingRef.current) {
        void requestWakeLock()
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [requestWakeLock])

  // Recover audio when the tab returns to the foreground. Backgrounding (app
  // switch, screen lock, incoming call) is the most common way the audio session
  // gets interrupted mid-meeting, leaving someone visible and audible to others
  // but unable to hear the room. Re-asserting playback makes that self-healing.
  useEffect(() => {
    const recover = () => {
      if (document.visibilityState !== "visible") return
      const room = roomRef.current
      if (!room) return
      void room.startAudio().catch(() => {})
      resumeSpeakerPlayout()
      audioElsRef.current.forEach((el) => {
        if (el.paused) void el.play().catch(() => {})
      })
      if (musicCtxRef.current) void ensureCtxRunning(musicCtxRef.current)
      const musicEl = musicElRef.current
      if (musicEl?.src && musicEl.paused) void musicEl.play().catch(() => {})
      setAudioBlocked(!room.canPlaybackAudio)
    }
    document.addEventListener("visibilitychange", recover)
    return () => document.removeEventListener("visibilitychange", recover)
  }, [])

  return {
    localVideoRef,
    connected,
    micOn,
    camOn,
    facingMode,
    localVideoReady,
    canPublish,
    participants,
    peers,
    localSpeaking,
    error,
    clearError,
    audioBlocked,
    musicPosition,
    musicDuration,
    registerPeerVideoEl,
    registerLocalVideoEl,
    registerSelfPipVideoEl,
    registerProjectionVideoEl,
    // Screen share
    canScreenShare: canScreenShareHere(),
    screenShareOn,
    startScreenShare,
    stopScreenShare,
    // A remote screen share currently presented full-stage (null when none).
    remoteProjection,
    // Egress-only projection pixels (synced Project Video → replay capture).
    publishVideoProjectionTrack,
    unpublishVideoProjectionTrack,
    toggleMic,
    askUnmute,
    toggleCam,
    flipCamera,
    startAudioPlayback,
    publishMusic,
    setMusicVolume,
    duckMusic,
    setMusicPlaying,
    seekMusic,
    setMusicLoop,
    setMusicEndedHandler,
    stopMusic,
    publishVideoAudioTrack,
    unpublishVideoAudioTrack,
    stopRecording,
    disconnect: cleanup,
  }
}
