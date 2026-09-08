import { Pool } from "pg"

// Idempotent: adds the nullable `rating` column used by iTestify testimonies.
// NULL for every existing row, so legacy testimonies (and all non-testimony
// posts) gracefully show no rating until a new rated testimony is created.
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  await pool.query(`ALTER TABLE feed_post ADD COLUMN IF NOT EXISTS rating integer;`)
  console.log("[migrate] feed_post.rating column ensured")
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => pool.end())
