import fixWebmDuration from "fix-webm-duration"

/**
 * Inject the real Duration into a MediaRecorder-produced WebM blob.
 *
 * MediaRecorder writes WebM in a streaming layout and omits the Segment > Info
 * > Duration element, so browsers report `video.duration` as Infinity/0 until
 * the whole file has been scanned. That is why a long livestream replay looked
 * like it "only saved 2 seconds": the footage was all uploaded, but every
 * player (page, reel, inline feed, native PiP, and downloads) had no length to
 * seek within. We know the true length from the wall-clock recording time, so
 * we patch it into the header before upload — a one-time, in-memory rewrite.
 *
 * MP4 recordings (iOS Safari) already carry a valid duration, so they pass
 * through untouched. Any failure falls back to the original blob so saving can
 * never be blocked by the fix.
 */
export async function fixRecordedVideoDuration(blob: Blob, durationMs: number): Promise<Blob> {
  if (!blob || blob.size === 0) return blob
  if (!Number.isFinite(durationMs) || durationMs <= 0) return blob
  if (!blob.type.toLowerCase().includes("webm")) return blob
  try {
    return await fixWebmDuration(blob, durationMs, { logger: false })
  } catch {
    return blob
  }
}
