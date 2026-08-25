// Adds admin pinning to the main feed (feed_post) and Community Help
// (community_post). Idempotent — safe to re-run.
//
// A pin is stored as a nullable timestamp on the post itself rather than in a
// join table, because a post lives in exactly ONE feed scope (its "homeId").
// That makes a pin a property of the post within its feed, not a per-viewer
// relationship, so there is nothing to join against.
//
// "pinnedAt" doubles as the sort key: the most recently pinned post sits on top,
// which is what an admin expects after pinning something new.
//
// Run with:
//   node --env-file=/vercel/share/.env.project scripts/add-post-pinning.mjs

import pg from "pg"

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    for (const table of ["feed_post", "community_post"]) {
      await client.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "pinnedAt" timestamp`)
      // Audit trail: pinning is a shared action across a Home's admins, so the
      // feed alone can't tell you who put a post at the top.
      await client.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "pinnedBy" text`)

      // Partial index: only pinned rows are indexed, so it stays tiny however
      // large the table grows. Every feed read sorts by "pinnedAt" DESC and the
      // pin cap counts pins per Home, and both are served from here.
      await client.query(
        `CREATE INDEX IF NOT EXISTS "${table}_pinned_idx"
           ON "${table}" ("homeId", "pinnedAt" DESC)
           WHERE "pinnedAt" IS NOT NULL`,
      )
    }

    console.log("[v0] Migration complete: pinnedAt/pinnedBy on feed_post + community_post (+ partial indexes)")
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] post pinning migration failed:", err)
  process.exit(1)
})
