// Idempotent migration: per-Home publishing identity + Home soft deletion.
//
// Establishes the rule that a user's role belongs to a SPECIFIC Home and that
// content permanently preserves the context it was created in:
//
//   - feed_post.publishedAsType / publishedAsRole
//   - article.homeId / organizationId / publishedAsType / publishedAsRole
//   - home.deletedAt / purgeAfter  (30-day retention on Home deletion)
//
// publishedAsType is the immutable record of WHO published a piece of content:
// "home" (the organisation, published by one of its admins) or "personal" (the
// individual). Reads must never recompute identity from the author's CURRENT
// role, otherwise demoting an admin would retroactively rewrite their old posts.
//
// Backfill is deliberately conservative: existing rows are classified from data
// they already carry (feed_post.organizationId), and historical attribution is
// otherwise left exactly as-is. Articles predate Home scoping entirely, so they
// all stay personal.
//
// Safe to re-run.
//
// Run with:
//   node --env-file=/vercel/share/.env.project scripts/add-publishing-context.mjs

import pg from "pg"

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    // --- feed_post publishing context --------------------------------------
    await client.query(
      `ALTER TABLE "feed_post" ADD COLUMN IF NOT EXISTS "publishedAsType" text NOT NULL DEFAULT 'personal'`,
    )
    await client.query(`ALTER TABLE "feed_post" ADD COLUMN IF NOT EXISTS "publishedAsRole" text`)

    // Backfill: a post that already carries an organizationId was published as
    // that organisation. Everything else is personal. Only touches rows still
    // holding the column default, so re-running never reclassifies.
    const posts = await client.query(`
      UPDATE "feed_post"
         SET "publishedAsType" = 'home'
       WHERE "organizationId" IS NOT NULL
         AND "publishedAsType" = 'personal'
    `)

    // --- article Home scoping + publishing context -------------------------
    await client.query(`ALTER TABLE "article" ADD COLUMN IF NOT EXISTS "homeId" text`)
    await client.query(`ALTER TABLE "article" ADD COLUMN IF NOT EXISTS "organizationId" text`)
    await client.query(
      `ALTER TABLE "article" ADD COLUMN IF NOT EXISTS "publishedAsType" text NOT NULL DEFAULT 'personal'`,
    )
    await client.query(`ALTER TABLE "article" ADD COLUMN IF NOT EXISTS "publishedAsRole" text`)
    await client.query(
      `CREATE INDEX IF NOT EXISTS "article_home_idx" ON "article" ("homeId") WHERE "homeId" IS NOT NULL`,
    )
    // Home Articles pages sort published articles within one Home.
    await client.query(
      `CREATE INDEX IF NOT EXISTS "article_home_published_idx" ON "article" ("homeId", "publishedAt")`,
    )

    // --- home soft deletion ------------------------------------------------
    await client.query(`ALTER TABLE "home" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp`)
    await client.query(`ALTER TABLE "home" ADD COLUMN IF NOT EXISTS "purgeAfter" timestamp`)
    // Partial index: the purge sweep only ever scans soft-deleted Homes.
    await client.query(
      `CREATE INDEX IF NOT EXISTS "home_deleted_idx" ON "home" ("deletedAt") WHERE "deletedAt" IS NOT NULL`,
    )

    console.log(
      `[v0] Publishing-context migration complete. Reclassified ${posts.rowCount} existing post(s) as home-published.`,
    )
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] Publishing-context migration failed:", err)
  process.exit(1)
})
