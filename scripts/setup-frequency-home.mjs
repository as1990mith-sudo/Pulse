// One-off DDL to provision the Frequency Home tables on Neon.
// Run with: node --env-file=/vercel/share/.env.project scripts/setup-frequency-home.mjs
// Safe to re-run: every statement uses IF NOT EXISTS.
import pg from "pg"

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const statements = [
  // A Frequency Home: the private environment layered on a public organisation.
  `CREATE TABLE IF NOT EXISTS home (
    id text PRIMARY KEY,
    "organizationId" text NOT NULL UNIQUE,
    name text NOT NULL,
    plan text NOT NULL DEFAULT 'premium',
    "planStatus" text NOT NULL DEFAULT 'active',
    "accentColor" text,
    "joinPolicy" text NOT NULL DEFAULT 'auto',
    status text NOT NULL DEFAULT 'active',
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,

  // Organisation Authorisation Keys. One active key per Home; history retained.
  `CREATE TABLE IF NOT EXISTS home_auth_key (
    id text PRIMARY KEY,
    "homeId" text NOT NULL,
    key text NOT NULL UNIQUE,
    active boolean NOT NULL DEFAULT true,
    "createdBy" text,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "disabledAt" timestamp
  )`,

  // Individual-account ↔ Home membership bridge.
  `CREATE TABLE IF NOT EXISTS home_membership (
    id text PRIMARY KEY,
    "homeId" text NOT NULL,
    "userId" text NOT NULL,
    role text NOT NULL DEFAULT 'member',
    status text NOT NULL DEFAULT 'active',
    "joinedVia" text NOT NULL DEFAULT 'key_auto',
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  )`,

  // Indexes for the hot query paths.
  `CREATE UNIQUE INDEX IF NOT EXISTS home_organization_idx ON home ("organizationId")`,
  `CREATE INDEX IF NOT EXISTS home_auth_key_home_idx ON home_auth_key ("homeId")`,
  `CREATE INDEX IF NOT EXISTS home_auth_key_active_idx ON home_auth_key ("homeId", active)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS home_membership_home_user_idx ON home_membership ("homeId", "userId")`,
  `CREATE INDEX IF NOT EXISTS home_membership_user_idx ON home_membership ("userId")`,
  `CREATE INDEX IF NOT EXISTS home_membership_home_status_idx ON home_membership ("homeId", status)`,
]

async function main() {
  const client = await pool.connect()
  try {
    for (const sql of statements) {
      await client.query(sql)
      console.log("[v0] applied:", sql.split("\n")[0].trim())
    }
    console.log("[v0] Frequency Home tables ready.")
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] setup failed:", err)
  process.exit(1)
})
