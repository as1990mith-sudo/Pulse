// Adds the two tables behind native push notifications (idempotent):
//
//   push_subscription      one row per device/browser endpoint
//   notification_preference per-user, per-category opt-outs
//
// Run with:
//   node --env-file=/vercel/share/.env.project scripts/add-push-notifications.mjs

import pg from "pg"

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "push_subscription" (
        "id" serial PRIMARY KEY,
        "userId" text NOT NULL,
        "endpoint" text NOT NULL,
        "p256dh" text NOT NULL,
        "auth" text NOT NULL,
        "userAgent" text,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `)

    // The push service treats the endpoint as the device identity, so this
    // uniqueness is what makes re-subscribing on the same device an upsert
    // instead of a duplicate delivery.
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "push_subscription_endpoint_idx" ON "push_subscription" ("endpoint")`,
    )
    // Fan-out reads every endpoint for a set of recipients.
    await client.query(
      `CREATE INDEX IF NOT EXISTS "push_subscription_user_idx" ON "push_subscription" ("userId")`,
    )

    await client.query(`
      CREATE TABLE IF NOT EXISTS "notification_preference" (
        "id" serial PRIMARY KEY,
        "userId" text NOT NULL,
        "category" text NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `)

    // One row per (user, category): backs the upsert on toggle and the
    // eligibility lookup during fan-out.
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "notification_preference_user_category_idx" ON "notification_preference" ("userId", "category")`,
    )

    console.log("[v0] Migration complete: push_subscription + notification_preference (+ indexes)")
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] push notifications migration failed:", err)
  process.exit(1)
})
