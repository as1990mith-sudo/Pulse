import "server-only"
import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  EncodingOptions,
  S3Upload,
  VideoCodec,
} from "livekit-server-sdk"
import { LIVEKIT_URL, isLiveKitConfigured } from "@/lib/livekit"
import { getStorageConfig, isStorageConfigured } from "@/lib/storage"

/**
 * Server-side recording for VIDEO live sessions, via LiveKit Egress.
 *
 * Why this exists: the previous replay pipeline recorded on the HOST'S PHONE
 * (canvas.captureStream + MediaRecorder). That is fundamentally unreliable on
 * mobile — backgrounding, screen-lock, codec/duration quirks — and truncated
 * recordings to ~1s. Egress records on LiveKit's media servers instead, so the
 * recording is completely independent of the host's device and always spans the
 * full session with a correct, seekable duration.
 *
 * Flow: startRoomVideoEgress() when a video broadcast goes live → LiveKit
 * composites the room and uploads a finalized MP4 to our S3-compatible bucket →
 * the egress-ended webhook (app/api/livekit/webhook) attaches that MP4's public
 * URL + true duration to the placeholder replay episode.
 */

export function isEgressConfigured(): boolean {
  return isLiveKitConfigured() && isStorageConfigured()
}

function egressClient(): EgressClient {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret || !LIVEKIT_URL) {
    throw new Error("LiveKit is not configured.")
  }
  // EgressClient needs the HTTP(S) host, not the wss:// signalling URL.
  const httpUrl = LIVEKIT_URL.replace(/^ws/, "http")
  return new EgressClient(httpUrl, apiKey, apiSecret)
}

/**
 * The object key an egress writes to. The episode id is embedded in the path so
 * the webhook can map a finished file back to its placeholder episode directly
 * from the egress result — no DB lookup required, and robust even if the
 * live_stream row has already been cleaned up by the time the webhook arrives.
 */
export function replayObjectKey(episodeId: number, roomName: string): string {
  return `replays/ep-${episodeId}/${roomName}.mp4`
}

/** Parses the episode id back out of a stored replay key/filename. */
export function episodeIdFromKey(keyOrName: string): number | null {
  const m = keyOrName.match(/ep-(\d+)/)
  if (!m) return null
  const n = Number.parseInt(m[1], 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Starts recording the room to storage. Returns the egressId (to stop later) and
 * the object key it will write to. Throws if egress isn't configured — callers
 * wrap this so a recording failure never blocks the host from going live.
 */
export async function startRoomVideoEgress(input: {
  roomName: string
  episodeId: number
  orientation: "portrait" | "landscape"
}): Promise<{ egressId: string; key: string }> {
  const cfg = getStorageConfig()
  if (!cfg) throw new Error("Storage is not configured.")

  const key = replayObjectKey(input.episodeId, input.roomName)

  const fileOutput = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: key,
    // Upload straight to our S3-compatible bucket (Cloudflare R2).
    output: {
      case: "s3",
      value: new S3Upload({
        accessKey: cfg.accessKeyId,
        secret: cfg.secretAccessKey,
        region: cfg.region,
        endpoint: cfg.endpoint,
        bucket: cfg.bucket,
        forcePathStyle: true, // required for R2 / non-AWS S3
      }),
    },
  })

  // Portrait broadcasts record vertically; landscape (Conversation grid) records
  // 16:9. Both use the "grid" template so every publisher gets an equal,
  // balanced tile (1 = full frame, 2 = split, 3–4 = grid) instead of the
  // "speaker" template's one-big-feed-plus-floating-thumbnails look, which read
  // as a generic video call rather than a composed broadcast.
  //
  // We set an EXPLICIT high-bitrate EncodingOptions instead of the stock
  // PORTRAIT_H264_1080P_30 / H264_1080P_30 presets. Those presets re-encode the
  // recording at a modest bitrate (~3 Mbps), which is what made the replay look
  // soft and blocky.
  //
  // Two things matter for replay sharpness here:
  //  1. BITRATE HEADROOM. Egress re-encodes the host's up-to-8 Mbps published
  //     feed. Re-encoding at the SAME bitrate compounds compression artifacts,
  //     so we record at 12 Mbps — comfortably above the source — so the MP4
  //     preserves the incoming detail rather than degrading it. (Extra headroom
  //     on a mostly-static preaching shot barely grows the file.)
  //  2. H.264 HIGH PROFILE. The High profile packs noticeably more detail per
  //     bit than Main (better transforms/entropy coding) and is universally
  //     supported for playback, so the same bitrate simply looks sharper.
  //
  // Output dimensions match each orientation to avoid rescale/letterbox waste.
  // (videoBitrate / audioBitrate are in kbps.)
  const encodingOptions =
    input.orientation === "landscape"
      ? new EncodingOptions({
          width: 1920,
          height: 1080,
          framerate: 30,
          videoCodec: VideoCodec.H264_HIGH,
          videoBitrate: 12000,
          keyFrameInterval: 2,
          // 192 kbps AAC keeps headroom ABOVE the host's 128 kbps Opus mic feed
          // so the recording's audio re-encode preserves the voice cleanly
          // rather than compressing an already-compressed source.
          audioBitrate: 192,
        })
      : new EncodingOptions({
          width: 1080,
          height: 1920,
          framerate: 30,
          videoCodec: VideoCodec.H264_HIGH,
          videoBitrate: 12000,
          keyFrameInterval: 2,
          // 192 kbps AAC keeps headroom ABOVE the host's 128 kbps Opus mic feed
          // so the recording's audio re-encode preserves the voice cleanly
          // rather than compressing an already-compressed source.
          audioBitrate: 192,
        })
  // Balanced grid for every orientation — see the note above. The output
  // dimensions above still differ per orientation (portrait 1080x1920 vs
  // landscape 1920x1080), so the grid composes vertically for broadcasts and
  // horizontally for conversations.
  const layout = "grid"

  const client = egressClient()
  const info = await client.startRoomCompositeEgress(input.roomName, { file: fileOutput }, { layout, encodingOptions })
  return { egressId: info.egressId, key }
}

/** Stops a running egress. Safe no-op if it already stopped/completed. */
export async function stopRoomEgress(egressId: string): Promise<void> {
  if (!egressId) return
  try {
    await egressClient().stopEgress(egressId)
  } catch {
    // Already stopped / completed / unknown → nothing to do. The webhook still
    // finalizes the replay from whatever was recorded.
  }
}

/** Outcome of querying LiveKit for a room's replay egress. */
export type ReplayResult =
  | { status: "complete"; key: string; durationSec: number }
  | { status: "failed" }
  | { status: "pending" }
  // Egress not configured, not found, or the query errored — caller leaves the
  // episode untouched (still "processing") and tries again on the next read.
  | { status: "unknown" }

/**
 * Webhook-independent finalize path. Asks LiveKit directly for the egress that
 * recorded `roomName` and resolves the replay's outcome for a given episode.
 *
 * Why this exists: server-side video replays were finalized ONLY by the
 * egress-ended webhook (app/api/livekit/webhook). If that webhook isn't
 * configured/delivered, a completed recording would sit in "processing" forever
 * and never reach the catalogue — the exact "video doesn't save" bug. Reading
 * egress status on demand removes the webhook as a single point of failure: the
 * catalogue reconciler (reconcileVideoReplays) calls this so a replay finalizes
 * the next time the host or the Home Catalogue is opened, webhook or not.
 *
 * We look the egress up by ROOM (not egressId) on purpose: the egressId is
 * cleared from the live_stream row when the session ends, but the room name
 * survives, and listEgress({ roomName }) still returns the finished job.
 */
export async function getRoomReplayResult(roomName: string, episodeId: number): Promise<ReplayResult> {
  if (!isEgressConfigured() || !roomName) return { status: "unknown" }
  try {
    const list = await egressClient().listEgress({ roomName })
    // Match the egress whose output file targets THIS episode (the id is encoded
    // in the object key), so multiple recordings of the same room never cross.
    const match = list.find((e) => {
      const name = e.fileResults?.[0]?.filename
      return name ? episodeIdFromKey(name) === episodeId : false
    })
    if (!match) return { status: "unknown" }

    // EgressStatus: 3 = COMPLETE, 4 = FAILED, 5 = ABORTED, 6 = LIMIT_REACHED.
    const status = Number(match.status)
    const file = match.fileResults?.[0]
    if (status === 3 && file?.filename) {
      const key = file.filename.includes("/") ? file.filename : replayObjectKey(episodeId, roomName)
      // duration is nanoseconds (bigint) on the proto; convert to seconds.
      const durationSec = Number(file.duration ?? 0) / 1_000_000_000
      return { status: "complete", key, durationSec }
    }
    if (status === 4 || status === 5 || status === 6) return { status: "failed" }
    return { status: "pending" }
  } catch {
    return { status: "unknown" }
  }
}
