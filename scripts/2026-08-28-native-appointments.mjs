// Native Appointments + auto-created Conversation.
//
// Idempotent — safe to run repeatedly (no Drizzle Kit in this project; schema
// changes are hand-written .mjs). Run with:
//   node --env-file=/vercel/share/.env.project scripts/2026-08-28-native-appointments.mjs
//
// Adds:
//  1. home_appointment_type          — admin-defined bookable appointment types
//  2. home_appointment_availability  — recurring weekly windows per type
//  3. home_appointment (extend)      — link to type + conversation, duration,
//                                      Frequency Live flag, payment fields
//  4. dm_conversation (extend)       — kind + appointmentId (the two-way link
//                                      between an appointment and its dedicated
//                                      private conversation)
import pg from "pg"

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    await client.query("begin")

    // 1. Appointment types — what a member can choose to book.
    await client.query(`
      create table if not exists home_appointment_type (
        id text primary key,
        "homeId" text not null,
        "hostUserId" text,
        "hostName" text,
        title text not null,
        description text,
        "durationMinutes" integer not null default 30,
        "priceCents" integer,                       -- null = free
        currency text not null default 'usd',
        "useFrequencyLive" boolean not null default true,
        location text,                              -- in-person venue when not Live
        active boolean not null default true,
        "createdAt" timestamp not null default now(),
        "updatedAt" timestamp not null default now()
      )
    `)
    await client.query(
      `create index if not exists home_appointment_type_home_idx on home_appointment_type ("homeId")`,
    )
    await client.query(
      `create index if not exists home_appointment_type_home_active_idx on home_appointment_type ("homeId", active)`,
    )

    // 2. Recurring availability windows for a type (open slots are computed from
    //    these minus already-booked appointments of the same type/host).
    await client.query(`
      create table if not exists home_appointment_availability (
        id text primary key,
        "typeId" text not null,
        "homeId" text not null,
        weekday integer not null,                   -- 0 (Sun) .. 6 (Sat)
        "startMinute" integer not null,             -- minutes from local midnight
        "endMinute" integer not null,
        "createdAt" timestamp not null default now()
      )
    `)
    await client.query(
      `create index if not exists home_appointment_availability_type_idx on home_appointment_availability ("typeId")`,
    )
    await client.query(
      `create index if not exists home_appointment_availability_home_idx on home_appointment_availability ("homeId")`,
    )

    // 3. Extend home_appointment with the type/conversation link + payment.
    const apptCols = [
      `add column if not exists "typeId" text`,
      `add column if not exists "conversationId" integer`,
      `add column if not exists "durationMinutes" integer not null default 30`,
      `add column if not exists "useFrequencyLive" boolean not null default true`,
      // not_required | pending | paid | refunded
      `add column if not exists "paymentStatus" text not null default 'not_required'`,
      `add column if not exists "priceCents" integer`,
      `add column if not exists currency text not null default 'usd'`,
      `add column if not exists "stripeSessionId" text`,
    ]
    for (const col of apptCols) {
      await client.query(`alter table home_appointment ${col}`)
    }
    await client.query(
      `create index if not exists home_appointment_conversation_idx on home_appointment ("conversationId")`,
    )
    await client.query(`create index if not exists home_appointment_type_ref_idx on home_appointment ("typeId")`)

    // 4. Extend dm_conversation with the appointment link. kind='appointment'
    //    marks a dedicated appointment conversation (distinct from a general DM
    //    for the same pair); appointmentId is the back-reference.
    await client.query(`alter table dm_conversation add column if not exists kind text not null default 'direct'`)
    await client.query(`alter table dm_conversation add column if not exists "appointmentId" text`)
    await client.query(
      `create index if not exists dm_conversation_appointment_idx on dm_conversation ("appointmentId")`,
    )

    await client.query("commit")
    console.log("[migrate] native appointments schema ready")
  } catch (err) {
    await client.query("rollback")
    throw err
  } finally {
    client.release()
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("[migrate] failed:", err)
    pool.end()
    process.exit(1)
  })
