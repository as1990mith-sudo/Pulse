// Idempotent migration: guest (non-account) appointment booking support.
//
// - home_appointment.memberUserId becomes NULLABLE (guest bookings have no user)
// - adds guestName / guestEmail / guestPhone (public booking identity + email)
// - adds manageToken (unguessable token for the no-login manage page)
// - adds rescheduledFromId (link to the original appointment when rescheduled)
// - adds a UNIQUE index on manageToken
//
// Run: node --env-file=/vercel/share/.env.project scripts/add-appointment-guest-fields.mjs

import pg from "pg"

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

async function columnExists(table, column) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column],
  )
  return rows.length > 0
}

async function main() {
  console.log("[v0] Starting appointment guest-fields migration…")

  // 1. memberUserId -> nullable (safe to run repeatedly).
  await pool.query(`ALTER TABLE "home_appointment" ALTER COLUMN "memberUserId" DROP NOT NULL`)
  console.log('[v0] "memberUserId" is now nullable.')

  // 2. Add the new columns if missing.
  const columns = [
    ["guestName", `ADD COLUMN "guestName" text`],
    ["guestEmail", `ADD COLUMN "guestEmail" text`],
    ["guestPhone", `ADD COLUMN "guestPhone" text`],
    ["manageToken", `ADD COLUMN "manageToken" text`],
    ["rescheduledFromId", `ADD COLUMN "rescheduledFromId" text`],
  ]
  for (const [name, clause] of columns) {
    if (await columnExists("home_appointment", name)) {
      console.log(`[v0] Column "${name}" already exists — skipping.`)
      continue
    }
    await pool.query(`ALTER TABLE "home_appointment" ${clause}`)
    console.log(`[v0] Added column "${name}".`)
  }

  // 3. Unique index on manageToken (NULLs allowed & non-conflicting in Postgres).
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "home_appointment_manage_token_idx" ON "home_appointment" ("manageToken")`,
  )
  console.log('[v0] Ensured unique index on "manageToken".')

  console.log("[v0] Migration complete.")
}

main()
  .catch((err) => {
    console.error("[v0] Migration failed:", err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
