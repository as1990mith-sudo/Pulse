// Idempotent migration: event registration, contacts and audiences.
//
// Adds the ability for anyone — member or not, Frequency account or not — to
// register for a Home's event, and for that Home's admins to see and email the
// resulting audience.
//
// Additive only. Every new column has a default that preserves today's exact
// behaviour (registrationEnabled/publicPageEnabled default false), so events
// that already exist keep working as feed adverts with RSVP and nothing else.
//
//   user.phone                      captured once, lazily, never re-asked
//   announcement.registration*      per-event registration configuration
//   event_contact                   a person known to ONE Home
//   event_registration              one person's place at one event
//   event_broadcast                 audit of audience emails
//
// The two identity rules that matter, both enforced here in the database:
//
//   1. Home scoping. event_contact is unique on (homeId, emailLower), NOT on
//      email. The same human registering with Home A and Home B is two separate
//      contact rows, so one Home's registrants can never appear inside another.
//
//   2. Registration is not membership. Nothing in this migration writes to
//      home_membership, and event_registration.isMember is a stamped snapshot
//      of the registrant's status at the time they registered, never a live
//      recomputation.
//
// Safe to re-run.
//
// Run with:
//   node --env-file=/vercel/share/.env.project scripts/add-event-registration.mjs

import pg from "pg"

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    // --- Optional mobile on the account ------------------------------------
    // Nullable: Frequency does not ask for a mobile at signup. The first event
    // that genuinely needs one asks, saves it here, and never asks again.
    await client.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phone" text`)

    // --- Per-event registration configuration ------------------------------
    await client.query(
      `ALTER TABLE "announcement" ADD COLUMN IF NOT EXISTS "registrationEnabled" boolean NOT NULL DEFAULT false`,
    )
    await client.query(
      `ALTER TABLE "announcement" ADD COLUMN IF NOT EXISTS "publicPageEnabled" boolean NOT NULL DEFAULT false`,
    )
    await client.query(`ALTER TABLE "announcement" ADD COLUMN IF NOT EXISTS "capacity" integer`)
    await client.query(`ALTER TABLE "announcement" ADD COLUMN IF NOT EXISTS "registrationClosesAt" timestamp`)
    await client.query(`ALTER TABLE "announcement" ADD COLUMN IF NOT EXISTS "questions" jsonb`)
    await client.query(
      `ALTER TABLE "announcement" ADD COLUMN IF NOT EXISTS "requiresPhone" boolean NOT NULL DEFAULT true`,
    )

    // --- Contacts ----------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS "event_contact" (
        "id" serial PRIMARY KEY,
        "homeId" text NOT NULL,
        "userId" text,
        "fullName" text NOT NULL,
        "email" text NOT NULL,
        "emailLower" text NOT NULL,
        "phone" text,
        "marketingOptIn" boolean NOT NULL DEFAULT false,
        "marketingOptInAt" timestamp,
        "eventEmailUnsubscribedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `)
    // THE privacy boundary: unique per (Home, email), never per email. This is
    // what keeps Home A's registrant list out of Home B.
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "event_contact_home_email_idx" ON "event_contact" ("homeId", "emailLower")`,
    )
    await client.query(`CREATE INDEX IF NOT EXISTS "event_contact_home_idx" ON "event_contact" ("homeId")`)
    await client.query(
      `CREATE INDEX IF NOT EXISTS "event_contact_user_idx" ON "event_contact" ("userId") WHERE "userId" IS NOT NULL`,
    )

    // --- Registrations -----------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS "event_registration" (
        "id" serial PRIMARY KEY,
        "announcementId" integer NOT NULL,
        "homeId" text NOT NULL,
        "contactId" integer NOT NULL,
        "userId" text,
        "isMember" boolean NOT NULL DEFAULT false,
        "fullName" text NOT NULL,
        "email" text NOT NULL,
        "phone" text,
        "answers" jsonb,
        "guests" integer NOT NULL DEFAULT 1,
        "status" text NOT NULL DEFAULT 'registered',
        "attendedAt" timestamp,
        "source" text NOT NULL DEFAULT 'member',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `)
    // One place per person per event, enforced in the DB so a double-tapped
    // Register button or a resubmitted public form is idempotent regardless of
    // what the UI does.
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "event_registration_unique" ON "event_registration" ("announcementId", "contactId")`,
    )
    await client.query(
      `CREATE INDEX IF NOT EXISTS "event_registration_event_idx" ON "event_registration" ("announcementId")`,
    )
    await client.query(`CREATE INDEX IF NOT EXISTS "event_registration_home_idx" ON "event_registration" ("homeId")`)
    await client.query(
      `CREATE INDEX IF NOT EXISTS "event_registration_contact_idx" ON "event_registration" ("contactId")`,
    )

    // --- Broadcast audit ---------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS "event_broadcast" (
        "id" serial PRIMARY KEY,
        "homeId" text NOT NULL,
        "sentByUserId" text NOT NULL,
        "audienceKind" text NOT NULL,
        "announcementId" integer,
        "purpose" text NOT NULL DEFAULT 'event',
        "subject" text NOT NULL,
        "body" text NOT NULL,
        "recipientCount" integer NOT NULL DEFAULT 0,
        "failedCount" integer NOT NULL DEFAULT 0,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS "event_broadcast_home_idx" ON "event_broadcast" ("homeId")`)

    console.log("[v0] Event registration migration complete (contacts, registrations, broadcasts).")
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] Event registration migration failed:", err)
  process.exit(1)
})
