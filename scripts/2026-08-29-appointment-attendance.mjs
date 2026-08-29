// Idempotent: add attendance timestamps to home_appointment so the appointment
// lifecycle can resolve to "Finished" (both parties joined the meeting) or
// "No show" (they did not) once the meeting window has closed. Display status is
// derived at read time from these + the schedule; only attendance is persisted.
import pg from "pg"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    await client.query(`
      ALTER TABLE home_appointment
        ADD COLUMN IF NOT EXISTS "memberAttendedAt" timestamp,
        ADD COLUMN IF NOT EXISTS "hostAttendedAt" timestamp
    `)
    console.log("[attendance] home_appointment.memberAttendedAt / hostAttendedAt ready")
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[attendance] failed:", err)
  process.exit(1)
})
