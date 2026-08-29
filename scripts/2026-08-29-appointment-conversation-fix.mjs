// Fix: appointment conversations were blocked by a full UNIQUE index on the
// DM pair (userAId, userBId). That index enforces one-DM-per-pair, but it also
// prevented a second appointment between the same member and host from getting
// its own conversation — the insert threw and the appointment was left with a
// NULL conversationId (no thread, no meeting link).
//
// The intended design: DIRECT DMs are unique per pair, but APPOINTMENT
// conversations are not. So we swap the full unique index for a PARTIAL unique
// index scoped to kind = 'direct', then backfill any appointment that is missing
// its conversation.
//
// Idempotent: safe to run repeatedly.
//   node --env-file=/vercel/share/.env.project scripts/2026-08-29-appointment-conversation-fix.mjs
import pg from "pg"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    // 1) Drop the full unique index and replace with a direct-only partial one.
    await client.query(`DROP INDEX IF EXISTS dm_conversation_pair_idx`)
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS dm_conversation_direct_pair_idx
         ON dm_conversation ("userAId", "userBId")
         WHERE kind = 'direct'`,
    )
    console.log("[fix] direct-only partial unique index in place")

    // 2) Backfill appointments that never got a conversation (blocked by the old
    //    index). Only confirmed/active appointments with a host qualify.
    const { rows: orphans } = await client.query(
      `SELECT id, "memberUserId", "hostUserId", "memberName", "hostName", title,
              "startsAt", "durationMinutes", "useFrequencyLive", location, "paymentStatus"
         FROM home_appointment
        WHERE "conversationId" IS NULL
          AND "hostUserId" IS NOT NULL
          AND status <> 'cancelled'
          AND status <> 'pending_payment'
        ORDER BY "createdAt"`,
    )
    console.log(`[fix] ${orphans.length} appointment(s) missing a conversation`)

    let created = 0
    for (const a of orphans) {
      const [userAId, userBId] =
        a.memberUserId < a.hostUserId ? [a.memberUserId, a.hostUserId] : [a.hostUserId, a.memberUserId]

      await client.query("BEGIN")
      try {
        const { rows: convRows } = await client.query(
          `INSERT INTO dm_conversation ("userAId", "userBId", kind, "appointmentId", "lastMessageAt")
           VALUES ($1, $2, 'appointment', $3, now())
           RETURNING id`,
          [userAId, userBId, a.id],
        )
        const conversationId = convRows[0].id

        await client.query(`UPDATE home_appointment SET "conversationId" = $1, "updatedAt" = now() WHERE id = $2`, [
          conversationId,
          a.id,
        ])

        const when = new Date(a.startsAt).toUTCString()
        const meetingLine = a.useFrequencyLive
          ? "Meeting: Frequency Live"
          : a.location
            ? `Location: ${a.location}`
            : "Meeting: in person"
        const paymentLine =
          a.paymentStatus === "paid"
            ? "Payment: paid"
            : a.paymentStatus === "not_required"
              ? "Payment: free"
              : "Payment: pending"
        const summary = [
          `Appointment booked: ${a.title}`,
          `When: ${when}`,
          `Duration: ${a.durationMinutes} min`,
          meetingLine,
          paymentLine,
        ].join("\n")

        await client.query(
          `INSERT INTO dm_message ("conversationId", "senderId", body, "createdAt")
           VALUES ($1, $2, $3, now())`,
          [conversationId, a.hostUserId, summary],
        )

        await client.query("COMMIT")
        created++
        console.log(`[fix] appointment ${a.id} -> conversation ${conversationId}`)
      } catch (err) {
        await client.query("ROLLBACK")
        console.error(`[fix] failed for appointment ${a.id}: ${err.message}`)
      }
    }

    console.log(`[fix] done. backfilled ${created} conversation(s)`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
