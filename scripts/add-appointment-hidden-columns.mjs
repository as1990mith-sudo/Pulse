// Idempotent: add per-viewer dismissal columns to home_appointment.
//
// memberHiddenAt / hostHiddenAt let each party remove a PAST appointment from
// their own Appointments timeline without destroying the shared row or its
// linked conversation. Reads filter these out for the matching viewer only.
//
// Run: node --env-file=/vercel/share/.env.project scripts/add-appointment-hidden-columns.mjs
import pg from "pg"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    await client.query(`
      ALTER TABLE home_appointment
        ADD COLUMN IF NOT EXISTS "memberHiddenAt" timestamp,
        ADD COLUMN IF NOT EXISTS "hostHiddenAt" timestamp
    `)
    console.log("[hidden] home_appointment.memberHiddenAt / hostHiddenAt ready")
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[hidden] failed:", err)
  process.exit(1)
})
