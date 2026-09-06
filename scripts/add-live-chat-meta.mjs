// Idempotent migration: adds a nullable `meta` JSON-text column to
// live_chat_message so chat can carry rich payloads (shared Bible verse cards).
//
// Run:  node --env-file=/vercel/share/.env.project scripts/add-live-chat-meta.mjs
//
// Safe to run repeatedly — the statement uses IF NOT EXISTS.

import pg from "pg"

const { Client } = pg

const client = new Client({ connectionString: process.env.DATABASE_URL })

async function main() {
  await client.connect()
  console.log("[migrate] connected")

  await client.query(`ALTER TABLE "live_chat_message" ADD COLUMN IF NOT EXISTS "meta" text`)
  console.log("[migrate] live_chat_message.meta ensured")

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
