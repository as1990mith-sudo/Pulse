// Idempotent, additive: create live_video_state — the single authoritative
// "video resource" playback state for a live room.
//
// One row per room (roomName unique). The host loads a video (upload or
// YouTube) and drives play/pause/seek/stop; every participant polls this row
// and reconciles their local player to it, so everyone watches in sync and a
// late joiner instantly picks up the current position. positionMs + updatedAt
// form the anchor the clients extrapolate from while playing.
//
// Run: node --env-file=/vercel/share/.env.project scripts/2026-09-02-live-video-state.mjs
import pg from "pg"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS live_video_state (
        id             serial PRIMARY KEY,
        "roomName"     text NOT NULL UNIQUE,
        active         boolean NOT NULL DEFAULT false,
        source         text,
        url            text,
        "youtubeId"    text,
        title          text,
        thumbnail      text,
        "durationSec"  integer NOT NULL DEFAULT 0,
        "positionMs"   integer NOT NULL DEFAULT 0,
        playing        boolean NOT NULL DEFAULT false,
        "updatedBy"    text,
        "updatedAt"    timestamp NOT NULL DEFAULT now(),
        "createdAt"    timestamp NOT NULL DEFAULT now()
      )
    `)
    console.log("[live-video] live_video_state ready")
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[live-video] failed:", err)
  process.exit(1)
})
