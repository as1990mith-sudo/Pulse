// Idempotent migration: Home moderation (Reports) system.
//
// Adds the Home-LEVEL moderation tables + the per-membership suspension overlay.
// This is strictly separate from the platform `content_report`/`moderation_action`
// tables (Frequency Super Admin). Safe to run repeatedly.
//
// Run: node --env-file=/vercel/share/.env.project scripts/add-home-moderation.mjs

import pg from "pg"

const { Client } = pg

const client = new Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
})

async function main() {
  await client.connect()

  // --- Suspension overlay on home_membership -------------------------------
  await client.query(`
    ALTER TABLE "home_membership"
      ADD COLUMN IF NOT EXISTS "suspendedAt" timestamp,
      ADD COLUMN IF NOT EXISTS "suspendedUntil" timestamp,
      ADD COLUMN IF NOT EXISTS "suspendedBy" text,
      ADD COLUMN IF NOT EXISTS "suspendedReason" text;
  `)

  // --- home_report ---------------------------------------------------------
  await client.query(`
    CREATE TABLE IF NOT EXISTS "home_report" (
      "id" text PRIMARY KEY,
      "homeId" text NOT NULL,
      "reporterId" text NOT NULL,
      "reporterName" text NOT NULL,
      "reportedUserId" text NOT NULL,
      "reportedName" text NOT NULL,
      "targetType" text NOT NULL,
      "targetId" text,
      "targetPreview" text,
      "reason" text NOT NULL,
      "details" text,
      "status" text NOT NULL DEFAULT 'pending',
      "resolution" text,
      "resolvedBy" text,
      "resolvedByName" text,
      "resolvedAt" timestamp,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );
  `)
  await client.query(`
    CREATE INDEX IF NOT EXISTS "home_report_home_status_idx" ON "home_report" ("homeId", "status");
    CREATE INDEX IF NOT EXISTS "home_report_home_created_idx" ON "home_report" ("homeId", "createdAt");
    CREATE INDEX IF NOT EXISTS "home_report_reported_idx" ON "home_report" ("homeId", "reportedUserId");
  `)

  // --- home_moderation_action ---------------------------------------------
  await client.query(`
    CREATE TABLE IF NOT EXISTS "home_moderation_action" (
      "id" text PRIMARY KEY,
      "homeId" text NOT NULL,
      "targetUserId" text NOT NULL,
      "action" text NOT NULL,
      "reason" text,
      "suspendedUntil" timestamp,
      "adminId" text NOT NULL,
      "adminName" text NOT NULL,
      "reportId" text,
      "createdAt" timestamp NOT NULL DEFAULT now()
    );
  `)
  await client.query(`
    CREATE INDEX IF NOT EXISTS "home_moderation_home_target_idx" ON "home_moderation_action" ("homeId", "targetUserId");
    CREATE INDEX IF NOT EXISTS "home_moderation_home_created_idx" ON "home_moderation_action" ("homeId", "createdAt");
  `)

  console.log("[v0] Home moderation migration complete.")
  await client.end()
}

main().catch((err) => {
  console.error("[v0] Migration failed:", err)
  process.exit(1)
})
