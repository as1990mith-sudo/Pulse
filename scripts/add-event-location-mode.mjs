// Idempotent: add online/in-person location support to `announcement`.
//
// Events gain an explicit `locationMode` ("in_person" | "online"), confirmed
// geocode columns (`latitude`/`longitude`) for in-person venues resolved from
// address autocomplete, and `onlinePlatforms` (JSONB) listing the selected
// online destinations with optional links.
//
// Backfill: every existing event predates this split and carries a free-text
// `location` venue, so we mark all current event rows "in_person". Coordinates
// stay null (never geocoded) and Directions falls back to a text search, exactly
// as before. New online events set locationMode explicitly at creation time.
//
// Run: node --env-file=/vercel/share/.env.project scripts/add-event-location-mode.mjs
import pg from "pg"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    await client.query(`
      ALTER TABLE announcement
        ADD COLUMN IF NOT EXISTS "locationMode" text,
        ADD COLUMN IF NOT EXISTS "latitude" text,
        ADD COLUMN IF NOT EXISTS "longitude" text,
        ADD COLUMN IF NOT EXISTS "onlinePlatforms" jsonb
    `)
    // Existing events all have a physical venue in `location`; treat them as
    // in-person so the public map/Directions behaviour is unchanged.
    const res = await client.query(`
      UPDATE announcement
        SET "locationMode" = 'in_person'
        WHERE "adType" = 'event' AND "locationMode" IS NULL
    `)
    console.log(`[event-location-mode] columns ready; ${res.rowCount} existing event(s) marked in_person`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[event-location-mode] failed:", err)
  process.exit(1)
})
