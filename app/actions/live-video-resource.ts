"use server"

// The synchronised "Video" resource for a live room. Exactly one authoritative
// row per room drives what every participant sees. Only the room host (or grid
// co-host) may load a video or control transport; any participant may read the
// current state and reconcile their local player to it.
//
// The read (`getVideoState`) pre-advances the position to the *server's* clock
// when playing, so clients never have to reason about clock skew — they just
// extrapolate forward from the moment they received the row.

import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { liveStream, liveVideoState } from "@/lib/db/schema"
import { youTubeId as extractYouTubeId } from "@/lib/materials"

export type LiveVideoSource = "upload" | "youtube"

// What clients read every poll. `positionSec` is already advanced to "now" on
// the server when playing, so the client only extrapolates from receipt time.
export type LiveVideoState = {
  active: boolean
  source: LiveVideoSource | null
  url: string | null
  youtubeId: string | null
  title: string | null
  thumbnail: string | null
  durationSec: number
  positionSec: number
  playing: boolean
  // Shared room-wide listening level 0–100; every client applies it locally.
  volume: number
} | null

async function getUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

// True when the user hosts (or grid co-hosts) the room — mirrors the pin gate.
async function isRoomHost(roomName: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ hostId: liveStream.hostId, cohostId: liveStream.gridCohostId })
    .from(liveStream)
    .where(eq(liveStream.roomName, roomName))
    .limit(1)
  if (!row) return false
  return row.hostId === userId || row.cohostId === userId
}

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0
  return Math.min(max, Math.max(min, v))
}

// Shape a DB row into the client state, advancing position to server-now while
// playing so clients only extrapolate from receipt time.
function toState(row: typeof liveVideoState.$inferSelect, active: boolean): LiveVideoState {
  const durationSec = row.durationSec ?? 0
  let positionSec = (row.positionMs ?? 0) / 1000
  if (active && row.playing) {
    const elapsedSec = (Date.now() - (row.updatedAt ?? new Date()).getTime()) / 1000
    positionSec += Math.max(0, elapsedSec)
  }
  if (durationSec > 0) positionSec = Math.min(positionSec, durationSec)
  positionSec = Math.max(0, positionSec)

  return {
    active,
    source: (row.source as LiveVideoSource | null) ?? null,
    url: row.url,
    youtubeId: row.youtubeId,
    title: row.title,
    thumbnail: row.thumbnail,
    durationSec,
    positionSec,
    playing: active ? row.playing : false,
    volume: row.volume ?? 100,
  }
}

/**
 * PARTICIPANT read: the shared video only while it is active (being shown to the
 * room). Returns null the moment the host stops it, so participants' panels
 * close. Position is advanced to server-now while playing.
 */
export async function getVideoState(roomName: string): Promise<LiveVideoState> {
  if (!roomName) return null
  const [row] = await db.select().from(liveVideoState).where(eq(liveVideoState.roomName, roomName)).limit(1)
  if (!row || !row.active) return null
  return toState(row, true)
}

/**
 * HOST read: like getVideoState, but a video the host has STOPPED (active=false)
 * is still returned as long as a source is loaded, so the host keeps seeing it
 * and can play it again for everyone or replace it. Only cleared when the host
 * loads a different video. Host-gated; falls back to the participant view for
 * anyone else.
 */
export async function getHostVideoState(roomName: string): Promise<LiveVideoState> {
  if (!roomName) return null
  const userId = await getUserId()
  if (!userId || !(await isRoomHost(roomName, userId))) return getVideoState(roomName)

  const [row] = await db.select().from(liveVideoState).where(eq(liveVideoState.roomName, roomName)).limit(1)
  // No row, or a row that was never given a source, is "nothing loaded".
  if (!row || !row.source) return null
  return toState(row, row.active)
}

// Upsert the room's single state row. `roomName` is unique, so onConflict keeps
// exactly one row per room.
async function upsert(
  roomName: string,
  userId: string,
  values: Partial<typeof liveVideoState.$inferInsert>,
) {
  await db
    .insert(liveVideoState)
    .values({ roomName, updatedBy: userId, updatedAt: new Date(), ...values })
    .onConflictDoUpdate({
      target: liveVideoState.roomName,
      set: { updatedBy: userId, updatedAt: new Date(), ...values },
    })
}

/**
 * Host loads a new video for everyone. Resets transport to paused at 0 so the
 * host can press play when ready. `source` decides how the client renders it.
 */
export async function setVideoSource(input: {
  roomName: string
  source: LiveVideoSource
  url?: string | null
  youtubeId?: string | null
  title?: string | null
  thumbnail?: string | null
  durationSec?: number | null
}): Promise<{ ok: boolean }> {
  const userId = await getUserId()
  if (!userId) return { ok: false }
  if (input.source !== "upload" && input.source !== "youtube") return { ok: false }
  if (!(await isRoomHost(input.roomName, userId))) return { ok: false }

  // A YouTube source needs an id; an upload needs a URL.
  const youtubeId = input.source === "youtube" ? (input.youtubeId ?? null) : null
  if (input.source === "youtube" && !youtubeId) return { ok: false }
  if (input.source === "upload" && !input.url) return { ok: false }

  await upsert(input.roomName, userId, {
    active: true,
    source: input.source,
    url: input.url ?? null,
    youtubeId,
    title: input.title?.slice(0, 300) ?? null,
    thumbnail: input.thumbnail ?? null,
    durationSec: clampInt(input.durationSec ?? 0, 0, 60 * 60 * 12),
    positionMs: 0,
    playing: false,
  })
  return { ok: true }
}

/**
 * Host transport control. `play`/`pause`/`seek` all carry the authoritative
 * position (seconds) at the moment of the action.
 *
 * `play` (re)activates the video for everyone — this is also how the host plays
 * a previously-stopped video again. `stop` hides it from everyone (active=false)
 * but DELIBERATELY keeps the loaded source so the host can resume or replace it;
 * only loading a new video via setVideoSource clears it. On stop we snapshot the
 * *current* advanced position so a later play resumes where it left off.
 */
export async function controlVideo(input: {
  roomName: string
  action: "play" | "pause" | "seek" | "stop"
  positionSec?: number
}): Promise<{ ok: boolean }> {
  const userId = await getUserId()
  if (!userId) return { ok: false }
  if (!(await isRoomHost(input.roomName, userId))) return { ok: false }

  if (input.action === "stop") {
    // Freeze the position where it actually is right now (advance if it was
    // playing) so resuming continues from there rather than the last anchor.
    const [row] = await db
      .select()
      .from(liveVideoState)
      .where(eq(liveVideoState.roomName, input.roomName))
      .limit(1)
    let positionMs = row?.positionMs ?? 0
    if (row?.playing) {
      const elapsedMs = Date.now() - (row.updatedAt ?? new Date()).getTime()
      positionMs = Math.max(0, positionMs + Math.max(0, elapsedMs))
      if ((row.durationSec ?? 0) > 0) positionMs = Math.min(positionMs, row.durationSec * 1000)
    }
    await upsert(input.roomName, userId, { active: false, playing: false, positionMs })
    return { ok: true }
  }

  const positionMs = clampInt((input.positionSec ?? 0) * 1000, 0, 60 * 60 * 12 * 1000)
  // `play` also re-activates a stopped video; pause/seek leave active untouched.
  const activePatch = input.action === "play" ? { active: true } : {}
  const playing = input.action === "play" ? true : input.action === "pause" ? false : undefined

  await upsert(input.roomName, userId, {
    positionMs,
    ...activePatch,
    ...(playing === undefined ? {} : { playing }),
  })
  return { ok: true }
}

/**
 * Host sets the shared room-wide listening volume (0–100). Every client applies
 * it to its local player, so it controls what the host and every participant
 * hear. Position/transport are untouched.
 */
export async function setVideoVolume(input: { roomName: string; volume: number }): Promise<{ ok: boolean }> {
  const userId = await getUserId()
  if (!userId) return { ok: false }
  if (!(await isRoomHost(input.roomName, userId))) return { ok: false }
  await upsert(input.roomName, userId, { volume: clampInt(input.volume, 0, 100) })
  return { ok: true }
}

/**
 * Best-effort YouTube metadata via the public oEmbed endpoint (keyless). Used
 * to show a title + thumbnail when the host pastes a link. Never throws — a
 * failure just means the host loads the video with a generic title.
 */
export async function recognizeYouTube(
  rawUrl: string,
): Promise<{ ok: boolean; youtubeId: string | null; title: string | null; thumbnail: string | null }> {
  const youtubeId = extractYouTubeId(rawUrl)
  if (!youtubeId) return { ok: false, youtubeId: null, title: null, thumbnail: null }
  const watchUrl = `https://www.youtube.com/watch?v=${youtubeId}`
  const thumbnail = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`, {
      // Metadata is stable; let the platform cache it briefly.
      next: { revalidate: 3600 },
    })
    if (res.ok) {
      const data = (await res.json()) as { title?: string; thumbnail_url?: string }
      return {
        ok: true,
        youtubeId,
        title: data.title?.slice(0, 300) ?? null,
        thumbnail: data.thumbnail_url ?? thumbnail,
      }
    }
  } catch {
    /* fall through to the id-derived thumbnail */
  }
  return { ok: true, youtubeId, title: null, thumbnail }
}
