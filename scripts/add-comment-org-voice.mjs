// Idempotent migration: organisation-voice comments on main-feed posts.
//
// Adds feed_comment."organizationId" and feed_comment."publishedAsType",
// mirroring the columns already on feed_post. A non-null organizationId means an
// admin left the comment in the ORGANISATION's voice, so it renders with the org
// name and logo instead of the person's.
//
// As with feed_post, this is an IMMUTABLE record of who spoke. It is stamped once
// at insert and never recomputed from the author's current role, so demoting an
// admin cannot retroactively rewrite historical attribution.
//
// NO BACKFILL. Every existing comment was authored personally — there was no way
// to comment as an organisation before these columns existed — so inferring org
// voice from an author's present role would fabricate attribution. Existing rows
// take the "personal" default, exactly as they were written.
//
// Safe to re-run.
//
// Run with:
//   node --env-file=/vercel/share/.env.project scripts/add-comment-org-voice.mjs

import pg from "pg"

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    await client.query(`
      ALTER TABLE feed_comment
      ADD COLUMN IF NOT EXISTS "organizationId" text
    `)

    // NOT NULL with a default is safe here: the default backfills existing rows
    // in place and every historical comment genuinely was personal.
    await client.query(`
      ALTER TABLE feed_comment
      ADD COLUMN IF NOT EXISTS "publishedAsType" text NOT NULL DEFAULT 'personal'
    `)

    await client.query("COMMIT")

    const { rows } = await client.query(`
      SELECT
        count(*)::int AS total,
        count("organizationId")::int AS org_voice
      FROM feed_comment
    `)
    console.log("[v0] feed_comment rows:", rows[0])
    console.log("[v0] add-comment-org-voice: done")
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] add-comment-org-voice failed:", err)
  process.exit(1)
})
