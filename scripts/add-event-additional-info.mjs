// Idempotent: add an optional admin note to `announcement`.
//
// `additionalInfo` is free-text the publishing admin can add to an event with
// any important information registrants should know (parking, dress code, what
// to bring, entry instructions, …). Nullable and unused by legacy rows.
//
// Run: node --env-file=/vercel/share/.env.project scripts/add-event-additional-info.mjs
import pg from "pg"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    await client.query(`
      ALTER TABLE announcement
        ADD COLUMN IF NOT EXISTS "additionalInfo" text
    `)
    console.log("[event-additional-info] column ready")
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[event-additional-info] failed:", err)
  process.exit(1)
})
