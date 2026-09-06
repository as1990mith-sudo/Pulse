// Idempotent: add host-disconnection continuity columns to live_stream.
//
// hostDisconnectedAt — set the first moment the host's heartbeat breaches the
//   90s grace while participants remain; basis for the 10-min recovery deadline.
//   Cleared when the host's heartbeat resumes.
// actingHostId — Audio Podcast only: the called-in guest temporarily promoted to
//   co-host on a genuine host drop, retained so it can be reverted on host
//   return. Never changes ownership (hostId is untouched).
//
// Run: node --env-file=/vercel/share/.env.project scripts/add-live-host-continuity.mjs
import pg from "pg"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    await client.query(`
      ALTER TABLE live_stream
        ADD COLUMN IF NOT EXISTS "hostDisconnectedAt" timestamp,
        ADD COLUMN IF NOT EXISTS "actingHostId" text
    `)
    console.log("[continuity] live_stream.hostDisconnectedAt / actingHostId ready")
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[continuity] failed:", err)
  process.exit(1)
})
