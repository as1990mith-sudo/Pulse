// Removes the RSVP attendance format, leaving registration as the only one.
//
// Two independent steps, both idempotent so this can be re-run safely:
//
//   1. Turn registration on for existing events. Every event published before
//      this change was written with registrationEnabled/publicPageEnabled at
//      their `false` defaults, and no UI ever set them — so the feed card fell
//      back to RSVP and the registration page was unreachable.
//   2. Drop `event_rsvp`. Its rows are the old lightweight coming/not_coming
//      signal; the real headcount lives in `event_registration`, which this
//      script does not touch.
//
// Run: node --env-file=/vercel/share/.env.project scripts/remove-event-rsvp.mjs
import pg from "pg"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  // Step 1 — only rows that are actually off, so re-runs report 0 and this can
  // never re-enable an event an admin has deliberately closed since.
  const enabled = await pool.query(
    `update announcement
        set "registrationEnabled" = true,
            "publicPageEnabled"   = true
      where "adType" = 'event'
        and "homeId" is not null
        and ("registrationEnabled" = false or "publicPageEnabled" = false)
      returning id, title`,
  )
  console.log(`[v0] events switched to registration: ${enabled.rowCount}`)
  for (const r of enabled.rows) console.log(`[v0]   #${r.id} ${r.title}`)

  // Universal events have no Home, so no handle to build /events/[handle]/[id]
  // from. Enabling registration on them would render a CTA that cannot resolve,
  // so they are deliberately skipped above and reported here instead.
  const universal = await pool.query(
    `select count(*)::int as c from announcement where "adType" = 'event' and "homeId" is null`,
  )
  if (universal.rows[0].c > 0) {
    console.log(`[v0] skipped ${universal.rows[0].c} Universal event(s): no Home, so no registration page`)
  }

  // Step 2 — drop the table. `to_regclass` keeps this idempotent.
  const exists = await pool.query(`select to_regclass('public.event_rsvp') is not null as present`)
  if (exists.rows[0].present) {
    const { rows } = await pool.query(`select count(*)::int as c from event_rsvp`)
    await pool.query(`drop table event_rsvp`)
    console.log(`[v0] dropped table event_rsvp (${rows[0].c} row(s))`)
  } else {
    console.log("[v0] table event_rsvp already absent")
  }
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("[v0] failed:", err)
    await pool.end()
    process.exit(1)
  })
