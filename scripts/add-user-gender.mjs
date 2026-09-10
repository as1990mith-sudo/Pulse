// Idempotent migration: adds a nullable, structured `gender` to `user`.
//
// Frequency's Members command centre treats gender as administrative member
// data (Male | Female | Other). The column is nullable by design — signup does
// not yet capture it, so existing/legacy accounts read as "Not set" until a
// capture surface populates it. Storing it here (rather than a parallel table)
// keeps it on the identity it belongs to and future-ready.
//
// Run:  node --env-file=/vercel/share/.env.project scripts/add-user-gender.mjs
//
// Safe to run repeatedly — the statement uses IF NOT EXISTS.

import pg from "pg"

const { Client } = pg

const client = new Client({ connectionString: process.env.DATABASE_URL })

async function main() {
  await client.connect()
  console.log("[migrate] connected")

  await client.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "gender" text`)
  console.log("[migrate] user.gender ensured")

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
