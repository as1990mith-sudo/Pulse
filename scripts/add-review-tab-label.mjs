// Adds home.reviewTabLabel — the admin-chosen name for the iTestify tab.
// Cosmetic label only; one of "Praise Reports" | "Testimonials" | "Feedback".
// Idempotent: safe to run repeatedly.
import pg from "pg"

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  await pool.query(`
    ALTER TABLE "home"
    ADD COLUMN IF NOT EXISTS "reviewTabLabel" text NOT NULL DEFAULT 'Testimonials'
  `)
  console.log("[v0] home.reviewTabLabel ready (default 'Testimonials')")

  const { rows } = await pool.query(
    `SELECT "reviewTabLabel", count(*)::int AS c FROM "home" GROUP BY "reviewTabLabel" ORDER BY c DESC`,
  )
  for (const r of rows) console.log(`[v0]   ${r.c} home(s): "${r.reviewTabLabel}"`)
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("[v0] migration failed:", err)
    pool.end()
    process.exit(1)
  })
