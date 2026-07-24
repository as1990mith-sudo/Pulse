// Seed the first Super Admin by resolving the permanent user.id from the
// ADMIN_EMAILS env value. Identity is anchored to user.id, never a display name.
// Run: node --env-file=/vercel/share/.env.project scripts/seed-super-admin.mjs
import pg from "pg"
import { randomUUID } from "node:crypto"

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const emails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  if (emails.length === 0) {
    console.error("[v0] ADMIN_EMAILS is empty — cannot resolve Super Admin.")
    process.exit(1)
  }

  const client = await pool.connect()
  try {
    // Resolve the permanent id for the primary admin email.
    const { rows } = await client.query(
      `SELECT id, email, name FROM "user" WHERE lower(email) = ANY($1::text[]) ORDER BY "createdAt" ASC`,
      [emails],
    )
    if (rows.length === 0) {
      console.error("[v0] No user found for ADMIN_EMAILS:", emails.join(", "))
      console.error("[v0] The account must have signed up at least once first.")
      process.exit(1)
    }

    // Primary Super Admin = the first (oldest) matching account (Andrew Smith).
    const primary = rows[0]
    await client.query(
      `INSERT INTO admin_member (id, "userId", role, "createdBy")
       VALUES ($1, $2, 'super_admin', $2)
       ON CONFLICT ("userId") DO UPDATE SET role = 'super_admin', "updatedAt" = now()`,
      [randomUUID(), primary.id],
    )
    console.log(`[v0] Super Admin seeded: ${primary.email} (id=${primary.id})`)

    // Any other ADMIN_EMAILS accounts become administrators (not super).
    for (const row of rows.slice(1)) {
      await client.query(
        `INSERT INTO admin_member (id, "userId", role, "createdBy")
         VALUES ($1, $2, 'administrator', $3)
         ON CONFLICT ("userId") DO NOTHING`,
        [randomUUID(), row.id, primary.id],
      )
      console.log(`[v0] Administrator seeded: ${row.email} (id=${row.id})`)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] seed failed:", err)
  process.exit(1)
})
