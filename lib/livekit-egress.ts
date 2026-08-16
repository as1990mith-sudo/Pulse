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
  // 16:9. "speaker" focuses the active publisher; "grid" tiles everyone.
  //
  // We set an EXPLICIT high-bitrate EncodingOptions instead of the stock
  // PORTRAIT_H264_1080P_30 / H264_1080P_30 presets. Those presets re-encode the
  // recording at a modest bitrate (~3 Mbps), which is what made the replay look
  // soft and blocky.
  //
  // Two things matter for replay sharpness here:
  //  1. BITRATE HEADROOM. Egress re-encodes the host's ~6 Mbps published feed.
  //     Re-encoding at the SAME bitrate compounds compression artifacts, so we
  //     record at 8 Mbps — comfortably above the source — so the MP4 preserves
  //     the incoming detail rather than degrading it. (Extra headroom on a
  //     mostly-static preaching shot barely grows the file.)
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
          videoBitrate: 8000,
          keyFrameInterval: 2,
          audioBitrate: 128,
        })
      : new EncodingOptions({
          width: 1080,
          height: 1920,
          framerate: 30,
          videoCodec: VideoCodec.H264_HIGH,
          videoBitrate: 8000,
          keyFrameInterval: 2,
          audioBitrate: 128,
        })
  const layout = input.orientation === "landscape" ? "grid" : "speaker"

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
