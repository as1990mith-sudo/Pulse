// One-off DDL to provision the Frequency Admin Console tables on Neon.
// Run with: node --env-file=/vercel/share/.env.project scripts/setup-admin-console.mjs
// Safe to re-run: every statement uses IF NOT EXISTS.
import pg from "pg"

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const statements = [
  // Role-based access control: who is an admin and at what level.
  `CREATE TABLE IF NOT EXISTS admin_member (
    id text PRIMARY KEY,
    "userId" text NOT NULL UNIQUE,
    role text NOT NULL DEFAULT 'moderator',
    "createdBy" text,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,

  // User-submitted reports against any content type or profile/message.
  `CREATE TABLE IF NOT EXISTS content_report (
    id text PRIMARY KEY,
    "contentType" text NOT NULL,
    "contentId" text NOT NULL,
    "reporterId" text,
    reason text NOT NULL,
    details text,
    status text NOT NULL DEFAULT 'pending',
    "resolvedBy" text,
    "resolvedAt" timestamp,
    "createdAt" timestamp NOT NULL DEFAULT now()
  )`,

  // Permanent, append-only moderation history.
  `CREATE TABLE IF NOT EXISTS moderation_action (
    id text PRIMARY KEY,
    "targetType" text NOT NULL,
    "targetId" text NOT NULL,
    action text NOT NULL,
    reason text,
    "adminId" text NOT NULL,
    "reportId" text,
    metadata jsonb,
    "createdAt" timestamp NOT NULL DEFAULT now()
  )`,

  // Current moderation status per user (suspension/ban/verification/warnings).
  `CREATE TABLE IF NOT EXISTS user_moderation_state (
    "userId" text PRIMARY KEY,
    status text NOT NULL DEFAULT 'active',
    verified boolean NOT NULL DEFAULT false,
    warnings integer NOT NULL DEFAULT 0,
    "suspendedUntil" timestamp,
    reason text,
    "updatedBy" text,
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,

  // Support/complaints/feedback ticketing.
  `CREATE TABLE IF NOT EXISTS support_ticket (
    id text PRIMARY KEY,
    "userId" text,
    subject text NOT NULL,
    body text NOT NULL,
    category text NOT NULL DEFAULT 'complaint',
    priority text NOT NULL DEFAULT 'normal',
    status text NOT NULL DEFAULT 'open',
    "assignedTo" text,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,

  // Mandatory pre-publication approval workflow for books.
  `CREATE TABLE IF NOT EXISTS book_submission (
    id text PRIMARY KEY,
    "productId" text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    "reviewedBy" text,
    "reviewedAt" timestamp,
    feedback text,
    "internalNotes" text,
    "submissionCount" integer NOT NULL DEFAULT 1,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,

  // Broadcast Centre: announcements, maintenance notices, emergency, banners.
  `CREATE TABLE IF NOT EXISTS broadcast (
    id text PRIMARY KEY,
    type text NOT NULL DEFAULT 'announcement',
    title text NOT NULL,
    body text NOT NULL,
    audience text NOT NULL DEFAULT 'everyone',
    status text NOT NULL DEFAULT 'draft',
    "scheduledFor" timestamp,
    "sentAt" timestamp,
    "createdBy" text NOT NULL,
    "createdAt" timestamp NOT NULL DEFAULT now()
  )`,

  // Targeted push notification campaigns.
  `CREATE TABLE IF NOT EXISTS push_campaign (
    id text PRIMARY KEY,
    title text NOT NULL,
    body text NOT NULL,
    audience text NOT NULL DEFAULT 'everyone',
    status text NOT NULL DEFAULT 'draft',
    "scheduledFor" timestamp,
    "sentAt" timestamp,
    "recipientCount" integer,
    "createdBy" text NOT NULL,
    "createdAt" timestamp NOT NULL DEFAULT now()
  )`,

  // Append-only audit trail for every admin action.
  `CREATE TABLE IF NOT EXISTS audit_log (
    id text PRIMARY KEY,
    "adminId" text NOT NULL,
    action text NOT NULL,
    "targetType" text,
    "targetId" text,
    result text NOT NULL DEFAULT 'success',
    "ipAddress" text,
    "userAgent" text,
    metadata jsonb,
    "createdAt" timestamp NOT NULL DEFAULT now()
  )`,

  // Indexes for the hot query paths.
  `CREATE INDEX IF NOT EXISTS content_report_status_idx ON content_report (status, "createdAt")`,
  `CREATE INDEX IF NOT EXISTS moderation_action_target_idx ON moderation_action ("targetType", "targetId")`,
  `CREATE INDEX IF NOT EXISTS support_ticket_status_idx ON support_ticket (status, "createdAt")`,
  `CREATE INDEX IF NOT EXISTS book_submission_status_idx ON book_submission (status, "createdAt")`,
  `CREATE INDEX IF NOT EXISTS audit_log_admin_idx ON audit_log ("adminId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log ("createdAt")`,
]

async function main() {
  const client = await pool.connect()
  try {
    for (const sql of statements) {
      await client.query(sql)
      console.log("[v0] applied:", sql.split("\n")[0].trim())
    }
    console.log("[v0] Admin Console tables ready.")
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] setup failed:", err)
  process.exit(1)
})
