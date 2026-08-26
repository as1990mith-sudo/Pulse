import pg from "pg"
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const c = await pool.connect()
const q = async (label, sql) => {
  const { rows } = await c.query(sql)
  console.log(`\n== ${label}`)
  console.table(rows)
}
await q(
  "the 2 unscoped community posts",
  `SELECT p.id, p."userId", u.name AS author, left(p.text, 60) AS text, p."createdAt"
   FROM community_post p LEFT JOIN "user" u ON u.id = p."userId"
   WHERE p.deleted = false AND p."homeId" IS NULL ORDER BY p."createdAt"`,
)
await q(
  "that author's memberships",
  `SELECT m."userId", o.name AS home, m.role, m.status, m."createdAt"
   FROM home_membership m
   JOIN home h ON h.id = m."homeId"
   JOIN organization o ON o.id = h."organizationId"
   WHERE m.status = 'active' AND m."userId" IN (
     SELECT DISTINCT "userId" FROM community_post WHERE deleted = false AND "homeId" IS NULL
   )
   ORDER BY m."createdAt"`,
)
await q("community replies on those posts", `SELECT count(*) AS replies FROM community_reply`)
c.release()
await pool.end()
