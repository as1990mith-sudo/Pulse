// Idempotent migration: adds a nullable, snapshot `gender` to event_registration.
//
// Gender is captured on the registration form (Male | Female | Other) and
// stored here AS GIVEN at registration time, mirroring fullName/email/phone —
// a later profile edit must never rewrite an event's historical roll. The
// column is nullable only for rows that predate this field; every new
// registration is required to carry a value (enforced in the app layer).
//
// Run:  node --env-file=/vercel/share/.env.project scripts/add-event-registration-gender.mjs
//
// Safe to run repeatedly — the statement uses IF NOT EXISTS.

import pg from "pg"

const { Client } = pg

const client = new Client({ connectionString: process.env.DATABASE_URL })

async function main() {
  await client.connect()
  console.log("[migrate] connected")

  await client.query(`ALTER TABLE "event_registration" ADD COLUMN IF NOT EXISTS "gender" text`)
  console.log("[migrate] event_registration.gender ensured")

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
