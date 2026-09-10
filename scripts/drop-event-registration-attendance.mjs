import pg from "pg"

// Removes event attendance tracking. Frequency records who REGISTERED for an
// event, never who attended, so the snapshot column is dropped entirely.
// Idempotent: safe to run more than once (IF EXISTS).
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
try {
  await client.query(`ALTER TABLE event_registration DROP COLUMN IF EXISTS "attendedAt"`)
  console.log("Dropped event_registration.attendedAt (if it existed).")
} finally {
  await client.end()
}
