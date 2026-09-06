// Idempotent migration: lets a playlist nest inside another playlist.
//
// Adds a nullable self-referential `parentId` to `playlist` (null = top-level)
// plus an index for the children lookup.
//
// Run:  node --env-file=/vercel/share/.env.project scripts/add-playlist-nesting.mjs
//
// Safe to run repeatedly — every statement uses IF NOT EXISTS.

import pg from "pg"

const { Client } = pg

const client = new Client({ connectionString: process.env.DATABASE_URL })

async function main() {
  await client.connect()
  console.log("[migrate] connected")

  await client.query(`ALTER TABLE "playlist" ADD COLUMN IF NOT EXISTS "parentId" integer`)
  await client.query(`CREATE INDEX IF NOT EXISTS "playlist_parent_idx" ON "playlist" ("parentId")`)
  console.log("[migrate] playlist.parentId ensured")

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
