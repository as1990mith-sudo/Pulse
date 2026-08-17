// Pass B migration (idempotent): add explicit Home scoping columns so private
// Home live sessions and notifications never leak into Universal.
//
//   - live_stream.homeId   → session belongs to a private Home (member-gated,
//                            excluded from Universal live discovery). Null = public.
//   - notification.homeId  → activity inside a private Home; shows only in that
//                            Home's inbox and is hidden from the Universal list.
//
// Both are nullable text with a supporting partial index. Safe to re-run.
//
// Run with:
//   node --env-file=/vercel/share/.env.project scripts/add-home-scope-passb.mjs

import pg from "pg"

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    await client.query(`ALTER TABLE "live_stream" ADD COLUMN IF NOT EXISTS "homeId" text`)
    await client.query(`ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "homeId" text`)

    // Partial indexes: we only ever query rows WHERE homeId = $1, so index just
    // the scoped rows. Keeps Universal reads (homeId IS NULL) untouched.
    await client.query(
      `CREATE INDEX IF NOT EXISTS "live_stream_home_idx" ON "live_stream" ("homeId") WHERE "homeId" IS NOT NULL`,
    )
    await client.query(
      `CREATE INDEX IF NOT EXISTS "notification_home_idx" ON "notification" ("userId", "homeId") WHERE "homeId" IS NOT NULL`,
    )

    console.log("[v0] Pass B migration complete: added live_stream.homeId + notification.homeId (+ indexes)")
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] Pass B migration failed:", err)
  process.exit(1)
})
