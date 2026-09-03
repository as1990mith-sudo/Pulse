// Adds the shared room-wide `volume` column to live_video_state so the host can
// set one listening level for everyone. Idempotent: safe to run repeatedly.
//
// Run: node --env-file=/vercel/share/.env.project scripts/2026-09-03-live-video-volume.mjs
import pg from "pg"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    await client.query(`
      ALTER TABLE live_video_state
      ADD COLUMN IF NOT EXISTS volume integer NOT NULL DEFAULT 100
    `)
    console.log("[migrate] live_video_state.volume ensured")
  } finally {
    client.release()
  }
}

main().then(
  () => pool.end().then(() => process.exit(0)),
  (err) => {
    console.error(err)
    pool.end().then(() => process.exit(1))
  },
)
