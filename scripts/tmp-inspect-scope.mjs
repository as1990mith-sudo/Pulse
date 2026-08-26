import pg from "pg"
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const c = await pool.connect()
const q = async (label, sql) => {
  const { rows } = await c.query(sql)
  console.log(`\n== ${label}`)
  console.table(rows)
}
await q(
  "home for org c56c2753 (post 13's publishing org)",
  `SELECT h.id AS "homeId", o.id AS "orgId", o.name
   FROM organization o JOIN home h ON h."organizationId" = o.id
   WHERE o.id = 'c56c2753-efff-4f23-adf4-b690d5e0f973'`,
)
await q(
  "replies on the 2 unscoped posts",
  `SELECT "postId", count(*) AS replies FROM community_reply
   WHERE "postId" IN (10, 13) GROUP BY 1 ORDER BY 1`,
)
c.release()
await pool.end()
