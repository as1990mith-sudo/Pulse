// Idempotent migration: adds home.discoverable — whether a Home appears in
// "Find a Home" discovery + name search and advertises a keyless join on its
// public profile. Existing Homes default to discoverable (true) so nothing
// silently disappears from discovery. Discoverable never implies open access —
// joinPolicy still decides whether a join is instant or requires approval.
//
// Run:  node --env-file=/vercel/share/.env.project scripts/add-home-discoverable.mjs
//
// Safe to run repeatedly — the statement uses IF NOT EXISTS.

import pg from "pg"

const { Client } = pg

const client = new Client({ connectionString: process.env.DATABASE_URL })

async function main() {
  await client.connect()
  console.log("[migrate] connected")

  await client.query(`ALTER TABLE "home" ADD COLUMN IF NOT EXISTS "discoverable" boolean NOT NULL DEFAULT true`)
  console.log("[migrate] home.discoverable ensured")

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
