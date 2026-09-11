// Idempotent migration: adds devotional.kind — turns the single "Daily
// Devotional" surface into a multi-purpose Notice Board. Two kinds share the
// one table:
//   - "devotional": scripture-led reading (title + reference + verse + body,
//     optional prayer) — the original behaviour.
//   - "notice":     a general announcement/notice (title + body, optional
//     cover) with NO scripture/prayer scaffolding.
// Existing rows default to "devotional" so nothing already published changes.
//
// Run:  node --env-file=/vercel/share/.env.project scripts/add-content-kind.mjs
//
// Safe to run repeatedly — the statement uses IF NOT EXISTS.

import pg from "pg"

const { Client } = pg

const client = new Client({ connectionString: process.env.DATABASE_URL })

async function main() {
  await client.connect()
  console.log("[migrate] connected")

  await client.query(`ALTER TABLE "devotional" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'devotional'`)
  console.log("[migrate] devotional.kind ensured")

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
