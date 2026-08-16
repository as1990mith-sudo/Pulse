import { NextResponse } from "next/server"
import { WebhookReceiver } from "livekit-server-sdk"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { episode, notification } from "@/lib/db/schema"
import { buildPublicUrl } from "@/lib/storage"
import { episodeIdFromKey } from "@/lib/livekit-egress"

// livekit-server-sdk needs Node crypto; this must not run on the edge.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * LiveKit Egress webhook — the single source of truth for finalizing VIDEO
 * replays. When a room-composite recording finishes, LiveKit uploads the MP4 to
 * our bucket and POSTs an `egress_ended` event here. We map the file back to its
 * placeholder episode (the episode id is embedded in the object key) and attach
 * the public URL + real duration, flipping the episode to "ready".
 *
 * Configure this URL in your LiveKit Cloud project settings → Webhooks:
 *   https://<your-deployment>/api/livekit/webhook
 */

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

export async function POST(req: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ ok: false, error: "LiveKit not configured" }, { status: 500 })
  }

  // Verify the signed webhook. The raw body + Authorization header must match
  // the JWT LiveKit signs with our API secret, so this can't be spoofed.
  const body = await req.text()
  const authHeader = req.headers.get("Authorization") ?? ""
  const receiver = new WebhookReceiver(apiKey, apiSecret)

  let event
  try {
    event = await receiver.receive(body, authHeader)
  } catch (err) {
    console.log("[v0] livekit webhook verification failed:", (err as Error)?.message)
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 })
  }

  // We only act on egress lifecycle events.
  if (!event.event?.startsWith("egress_")) {
    return NextResponse.json({ ok: true, ignored: event.event })
  }

  const info = event.egressInfo
  if (!info) return NextResponse.json({ ok: true, ignored: "no egressInfo" })

  // EgressStatus: 3 = EGRESS_COMPLETE, 4 = EGRESS_FAILED, 5 = EGRESS_ABORTED, 6 = EGRESS_LIMIT_REACHED
  const status = Number(info.status)
  const file = info.fileResults?.[0] as
    | { filename?: string; location?: string; duration?: bigint | number; size?: bigint | number }
    | undefined

  // Resolve which placeholder episode this recording belongs to. The id is
  // embedded in the object key we told egress to write to.
  const key = file?.filename ?? ""
  const episodeId = episodeIdFromKey(key)
  if (!episodeId) {
    console.log("[v0] egress webhook: could not resolve episodeId from key:", key)
    return NextResponse.json({ ok: true, ignored: "no episodeId" })
  }

  const [row] = await db.select().from(episode).where(eq(episode.id, episodeId)).limit(1)
  if (!row) return NextResponse.json({ ok: true, ignored: "episode gone" })
  // Idempotent: LiveKit may retry webhooks. Don't reprocess a finalized episode.
  if (row.processingStatus === "ready") return NextResponse.json({ ok: true, already: "ready" })

  const isComplete = status === 3 || event.event === "egress_ended"
  const hasUsableFile = Boolean(file && file.filename && Number(file.size ?? 0) > 0)

  if (isComplete && hasUsableFile) {
    // duration is nanoseconds (bigint) on the proto; convert to seconds.
    const durationSec = Number(file!.duration ?? 0) / 1_000_000_000
    const publicUrl = buildPublicUrl(key)

    await db
      .update(episode)
      .set({
        videoUrl: publicUrl,
        duration: durationSec > 0 ? formatDuration(durationSec) : row.duration,
        processingStatus: "ready",
        processingError: null,
      })
      .where(eq(episode.id, episodeId))

    // Notify the host their replay is live (self-notification, mirrors finalizeProcessing).
    await db.insert(notification).values({
      userId: row.hostUserId,
      actorId: row.hostUserId,
      actorName: row.hostName,
      type: "live",
      message: "Your live replay is now ready in your Live Catalogue.",
      link: `/live/${row.slug}`,
    })

    console.log("[v0] egress replay finalized:", { episodeId, durationSec: Math.round(durationSec), publicUrl })
    return NextResponse.json({ ok: true, finalized: episodeId })
  }

  // Terminal failure (failed/aborted/limit) with no usable file → mark failed.
  if (status === 4 || status === 5 || status === 6) {
    await db
      .update(episode)
      .set({ processingStatus: "failed", processingError: "Recording failed on the server." })
      .where(eq(episode.id, episodeId))
    await db.insert(notification).values({
      userId: row.hostUserId,
      actorId: row.hostUserId,
      actorName: row.hostName,
      type: "live",
      message: "We couldn't finish recording your live replay.",
      link: `/u/${row.hostUserId}`,
    })
    console.log("[v0] egress replay failed:", { episodeId, status })
    return NextResponse.json({ ok: true, failed: episodeId })
  }

  // Non-terminal event (starting/active/updated) → ack and wait for the end.
  return NextResponse.json({ ok: true, pending: status })
}
