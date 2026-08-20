// Adds the personal_note table (idempotent): free-form, per-user notes for the
// main-app Notes → Personal Notes tab, unconnected to any live session.
//
// Run with:
//   node --env-file=/vercel/share/.env.project scripts/add-personal-notes.mjs

import pg from "pg"

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "personal_note" (
        "id" serial PRIMARY KEY,
        "userId" text NOT NULL,
        "title" text NOT NULL DEFAULT '',
        "body" text NOT NULL DEFAULT '',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `)

    // Composite (id, userId) index backs every owner-scoped read/update/delete.
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "personal_note_id_user_idx" ON "personal_note" ("id", "userId")`,
    )
    // Listing a user's notes newest-first.
    await client.query(
      `CREATE INDEX IF NOT EXISTS "personal_note_user_updated_idx" ON "personal_note" ("userId", "updatedAt")`,
    )

    console.log("[v0] Migration complete: created personal_note table (+ indexes)")
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] personal_note migration failed:", err)
  process.exit(1)
})
