// Pass C migration (idempotent): deepen Home data isolation.
//
//   - devotional.homeId       → a Daily Devotional owned/published by one Home.
//                               Null = a Universal devotional. Homes never share.
//   - home_booking            → booking requests made inside a Home (triaged by admins).
//   - home_appointment        → scheduled appointments between members and hosts in a Home.
//
// All Home-owned rows carry a NOT NULL homeId so a query for Organisation A can
// never return Organisation B's rows. Safe to re-run.
//
// Run with:
//   node --env-file=/vercel/share/.env.project scripts/add-home-scope-passc.mjs

import pg from "pg"

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    // --- devotional Home scoping -------------------------------------------
    await client.query(`ALTER TABLE "devotional" ADD COLUMN IF NOT EXISTS "homeId" text`)
    await client.query(
      `CREATE INDEX IF NOT EXISTS "devotional_home_idx" ON "devotional" ("homeId") WHERE "homeId" IS NOT NULL`,
    )

    // --- home_booking ------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS "home_booking" (
        "id" text PRIMARY KEY,
        "homeId" text NOT NULL,
        "requesterUserId" text NOT NULL,
        "requesterName" text NOT NULL,
        "requesterEmail" text,
        "title" text NOT NULL,
        "notes" text,
        "requestedFor" timestamp,
        "status" text NOT NULL DEFAULT 'pending',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS "home_booking_home_idx" ON "home_booking" ("homeId")`)
    await client.query(
      `CREATE INDEX IF NOT EXISTS "home_booking_home_status_idx" ON "home_booking" ("homeId", "status")`,
    )

    // --- home_appointment --------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS "home_appointment" (
        "id" text PRIMARY KEY,
        "homeId" text NOT NULL,
        "memberUserId" text NOT NULL,
        "memberName" text NOT NULL,
        "hostUserId" text,
        "hostName" text,
        "title" text NOT NULL,
        "notes" text,
        "location" text,
        "startsAt" timestamp NOT NULL,
        "endsAt" timestamp,
        "status" text NOT NULL DEFAULT 'upcoming',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS "home_appointment_home_idx" ON "home_appointment" ("homeId")`)
    await client.query(
      `CREATE INDEX IF NOT EXISTS "home_appointment_home_start_idx" ON "home_appointment" ("homeId", "startsAt")`,
    )

    console.log("[v0] Pass C migration complete: devotional.homeId + home_booking + home_appointment")
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] Pass C migration failed:", err)
  process.exit(1)
})
