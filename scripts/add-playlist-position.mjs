// Idempotent migration: manual admin ordering for playlists (drag-to-reorder).
//
// Adds `position` (integer, default 0) to `playlist` and backfills it so the
// CURRENT visible order is preserved. Playlists are ordered within a sibling
// group — same organisation + same parentId (NULL for top-level) — so the
// backfill numbers each group independently by its existing sort (most recently
// updated first, which is what the UI showed before this column existed).
//
// Run:  node --env-file=/vercel/share/.env.project scripts/add-playlist-position.mjs
//
// Safe to run repeatedly — the column add uses IF NOT EXISTS and the backfill
// only touches rows still left at the default 0 within a group.

import pg from "pg"

const { Client } = pg

const client = new Client({ connectionString: process.env.DATABASE_URL })

async function main() {
  await client.connect()
  console.log("[migrate] connected")

  await client.query(`ALTER TABLE "playlist" ADD COLUMN IF NOT EXISTS "position" integer NOT NULL DEFAULT 0`)
  console.log("[migrate] playlist.position ensured")

  // Backfill only groups that have never been ordered (every sibling still 0).
  // `parentId IS NOT DISTINCT FROM` groups NULL parents together correctly.
  const { rows } = await client.query(`
    WITH groups AS (
      SELECT "organizationId", "parentId"
      FROM "playlist"
      GROUP BY "organizationId", "parentId"
      HAVING bool_and("position" = 0)
    ),
    ordered AS (
      SELECT p.id,
             row_number() OVER (
               PARTITION BY p."organizationId", p."parentId"
               ORDER BY p."updatedAt" DESC, p.id DESC
             ) - 1 AS pos
      FROM "playlist" p
      JOIN groups g
        ON g."organizationId" = p."organizationId"
       AND g."parentId" IS NOT DISTINCT FROM p."parentId"
    )
    UPDATE "playlist" p
    SET "position" = ordered.pos
    FROM ordered
    WHERE ordered.id = p.id AND ordered.pos <> 0
    RETURNING p.id
  `)
  console.log(`[migrate] backfilled position for ${rows.length} playlist(s)`)

  console.log("[migrate] done")
}

main()
  .catch((err) => {
    console.error("[migrate] failed:", err)
    process.exitCode = 1
  })
  .finally(async () => {
    await client.end()
  })
