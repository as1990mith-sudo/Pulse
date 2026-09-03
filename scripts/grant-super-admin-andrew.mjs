// Grant platform Super Admin to the Andrew Smith account (as1990mith@gmail.com).
// This is the PLATFORM superadmin (admin_member.role = 'super_admin') — it is
// unrelated to Home roles (lib/home/roles.ts). Identity is anchored to the
// permanent user.id resolved from the email, never a display name.
//
// Idempotent: upserts on the unique userId; re-running is a no-op beyond
// ensuring the role is 'super_admin'. Grants only — never demotes anyone, so it
// cannot lock an existing admin out.
//
// Run: node --env-file=/vercel/share/.env.project scripts/grant-super-admin-andrew.mjs
import pg from "pg"
import { randomUUID } from "node:crypto"

const TARGET_EMAIL = "as1990mith@gmail.com"

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    const { rows } = await client.query(
      `SELECT id, email, name FROM "user" WHERE lower(email) = lower($1) ORDER BY "createdAt" ASC LIMIT 1`,
      [TARGET_EMAIL],
    )
    if (rows.length === 0) {
      console.error(`[v0] No user found for ${TARGET_EMAIL}.`)
      console.error("[v0] The account must have signed up at least once first, then re-run this script.")
      process.exit(1)
    }

    const target = rows[0]
    await client.query(
      `INSERT INTO admin_member (id, "userId", role, "createdBy")
       VALUES ($1, $2, 'super_admin', $2)
       ON CONFLICT ("userId") DO UPDATE SET role = 'super_admin', "updatedAt" = now()`,
      [randomUUID(), target.id],
    )
    console.log(`[v0] Super Admin granted: ${target.email} (id=${target.id}, name=${target.name})`)

    const { rows: supers } = await client.query(
      `SELECT u.email FROM admin_member a JOIN "user" u ON u.id = a."userId" WHERE a.role = 'super_admin' ORDER BY u.email`,
    )
    console.log(`[v0] Current super admins: ${supers.map((r) => r.email).join(", ")}`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] grant failed:", err)
  process.exit(1)
})
