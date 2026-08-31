// Idempotent migration for the Upload redesign: turns `catalogue_item` into a
// Material (adds external-resource metadata) and adds the playlist tables.
//
// Run:  node --env-file=/vercel/share/.env.project scripts/add-materials-playlists.mjs
//
// Safe to run repeatedly — every statement uses IF NOT EXISTS and the backfill
// only touches rows still holding the old defaults, so re-runs are no-ops.

import pg from "pg"

const { Client } = pg

const client = new Client({ connectionString: process.env.DATABASE_URL })

async function main() {
  await client.connect()
  console.log("[migrate] connected")

  // --- Material metadata columns on catalogue_item -------------------------
  await client.query(`
    ALTER TABLE "catalogue_item"
      ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'other',
      ADD COLUMN IF NOT EXISTS "creator" text,
      ADD COLUMN IF NOT EXISTS "contentType" text NOT NULL DEFAULT 'video',
      ADD COLUMN IF NOT EXISTS "category" text,
      ADD COLUMN IF NOT EXISTS "tags" text NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS "resourceDate" timestamp,
      ADD COLUMN IF NOT EXISTS "updatedAt" timestamp NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS "archivedAt" timestamp
  `)
  console.log("[migrate] catalogue_item columns ensured")

  // --- Backfill source from the stored url --------------------------------
  // Only rows still on the 'other' default are touched, so this is a no-op on
  // re-run and never clobbers an admin's later manual choice.
  await client.query(`
    UPDATE "catalogue_item" SET "source" =
      CASE
        WHEN "url" ~* 'youtube\\.com|youtu\\.be'   THEN 'youtube'
        WHEN "url" ~* 'spotify\\.com'               THEN 'spotify'
        WHEN "url" ~* 'vimeo\\.com'                 THEN 'vimeo'
        WHEN "url" ~* 'facebook\\.com|fb\\.watch'   THEN 'facebook'
        WHEN "url" ~* 'drive\\.google\\.com'        THEN 'drive'
        WHEN "url" ~* 'meet\\.google\\.com'         THEN 'meet'
        ELSE 'other'
      END
    WHERE "source" = 'other'
  `)
  console.log("[migrate] source backfilled from url")

  // --- Backfill contentType from the legacy kind --------------------------
  // Documents become 'article'; audio stays audio; everything else video.
  await client.query(`
    UPDATE "catalogue_item" SET "contentType" =
      CASE
        WHEN "kind" = 'document' THEN 'article'
        WHEN "kind" = 'audio'    THEN 'audio'
        ELSE 'video'
      END
    WHERE "contentType" = 'video' AND "kind" IN ('document', 'audio')
  `)
  console.log("[migrate] contentType backfilled from kind")

  // Seed resourceDate from createdAt where the admin hasn't set one, so cards
  // and the "Newest" sort have a sensible date immediately.
  await client.query(`
    UPDATE "catalogue_item" SET "resourceDate" = "createdAt" WHERE "resourceDate" IS NULL
  `)
  console.log("[migrate] resourceDate seeded")

  // --- Playlist tables -----------------------------------------------------
  await client.query(`
    CREATE TABLE IF NOT EXISTS "playlist" (
      "id" serial PRIMARY KEY,
      "organizationId" text NOT NULL,
      "name" text NOT NULL,
      "description" text,
      "cover" text,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )
  `)
  await client.query(`CREATE INDEX IF NOT EXISTS "playlist_org_idx" ON "playlist" ("organizationId")`)

  await client.query(`
    CREATE TABLE IF NOT EXISTS "playlist_material" (
      "id" serial PRIMARY KEY,
      "playlistId" integer NOT NULL,
      "materialId" integer NOT NULL,
      "position" integer NOT NULL DEFAULT 0,
      "createdAt" timestamp NOT NULL DEFAULT now()
    )
  `)
  await client.query(`CREATE INDEX IF NOT EXISTS "playlist_material_playlist_idx" ON "playlist_material" ("playlistId")`)
  await client.query(`CREATE INDEX IF NOT EXISTS "playlist_material_material_idx" ON "playlist_material" ("materialId")`)
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "playlist_material_pair_idx" ON "playlist_material" ("playlistId", "materialId")`,
  )
  console.log("[migrate] playlist tables ensured")

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
