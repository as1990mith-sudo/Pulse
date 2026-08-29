// One-off verification seed for the native Appointments feature.
// Creates a FREE appointment type + a wide availability window for the
// Prayer Palace Home, and a throwaway member to book with. Prints exact ids so
// the teardown script deletes precisely what was inserted (never by time window).
import pg from "pg"
import crypto from "crypto"

const HOME_ID = "809dc239-9d17-479e-9cca-130d7609323e"
const p = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const out = {}
try {
  // Resolve an admin/owner host in this Home.
  const host = await p.query(
    `select m."userId", u.name from home_membership m
     join "user" u on u.id = m."userId"
     where m."homeId"=$1 and m.status='active' and m.role in ('owner','administrator','leader')
     order by case m.role when 'owner' then 0 when 'administrator' then 1 else 2 end
     limit 1`,
    [HOME_ID],
  )
  if (!host.rows.length) throw new Error("no admin host in home")
  const hostUserId = host.rows[0].userId
  const hostName = host.rows[0].name
  out.hostUserId = hostUserId
  out.hostName = hostName

  // Free, Frequency Live appointment type.
  const typeId = "appttype_verify_" + crypto.randomUUID().slice(0, 8)
  await p.query(
    `insert into home_appointment_type
     (id,"homeId","hostUserId","hostName",title,description,"durationMinutes","priceCents",currency,"useFrequencyLive",active)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [typeId, HOME_ID, hostUserId, hostName, "Verify Pastoral Chat", "Seed type for verification", 30, null, "usd", true, true],
  )
  out.typeId = typeId

  // Availability every weekday, 00:00–23:59 local, so an open slot always exists.
  for (let wd = 0; wd < 7; wd++) {
    await p.query(
      `insert into home_appointment_availability (id,"typeId","homeId",weekday,"startMinute","endMinute")
       values ($1,$2,$3,$4,$5,$6)`,
      ["apptavail_verify_" + crypto.randomUUID().slice(0, 8), typeId, HOME_ID, wd, 0, 1439],
    )
  }
  out.availabilitySeeded = true

  console.log("SEED_OK " + JSON.stringify(out))
} catch (e) {
  console.log("ERR:" + e.message)
} finally {
  await p.end()
}
