// Idempotent migration: per-member manual ordering of the "My Homes" list.
//
// Adds a nullable `sortOrder` to `home_membership` (null = not yet reordered,
// so those fall back to the default newest-first order).
//
// Run:  node --env-file=/vercel/share/.env.project scripts/add-home-membership-sort-order.mjs
//
// Safe to run repeatedly — the statement uses IF NOT EXISTS.

import pg from "pg"

const { Client } = pg

const client = new Client({ connectionString: process.env.DATABASE_URL })

async function main() {
  await client.connect()
  console.log("[migrate] connected")

  await client.query(`ALTER TABLE "home_membership" ADD COLUMN IF NOT EXISTS "sortOrder" integer`)
  console.log("[migrate] home_membership.sortOrder ensured")

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
