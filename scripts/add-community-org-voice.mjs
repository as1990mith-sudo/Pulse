// Idempotent migration: organisation-voice Community Help threads.
//
// Adds community_post.organizationId, mirroring feed_post.organizationId. A
// non-null value means an admin published the thread in the ORGANISATION's
// voice, so it renders as the org and appears on that org profile's Thread tab.
// Null is a personal thread and never surfaces on an org profile.
//
// Like feed_post, this is an IMMUTABLE record of who published the thread. It is
// stamped once at creation and never recomputed from the author's current role,
// so demoting an admin cannot retroactively rewrite historical attribution.
//
// NO BACKFILL. Existing threads were all authored personally — there was no way
// to post as an organisation before this column existed — so inferring org voice
// from the author's present role would fabricate attribution and would also drag
// members' personal (and possibly anonymous) threads onto a public org profile.
// Every existing row therefore stays personal, exactly as it was published.
//
// Safe to re-run.
//
// Run with:
//   node --env-file=/vercel/share/.env.project scripts/add-community-org-voice.mjs

import pg from "pg"

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    await client.query(`
      ALTER TABLE community_post
      ADD COLUMN IF NOT EXISTS "organizationId" text
    `)

    // The Thread tab reads "every org-voice thread for THIS organisation,
    // newest first", so index the column it filters on. Partial, because the
    // overwhelming majority of rows are personal threads (NULL) that this
    // query never wants.
    await client.query(`
      CREATE INDEX IF NOT EXISTS community_post_org_idx
      ON community_post ("organizationId")
      WHERE "organizationId" IS NOT NULL
    `)

    await client.query("COMMIT")

    const { rows } = await client.query(`
      SELECT
        count(*)::int AS total,
        count("organizationId")::int AS org_voice
      FROM community_post
      WHERE deleted = false
    `)
    console.log("[v0] community_post threads:", rows[0])
    console.log("[v0] add-community-org-voice: done")
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] add-community-org-voice failed:", err)
  process.exit(1)
})
