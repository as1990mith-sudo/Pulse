import pg from "pg"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const { rows } = await pool.query(
  `select o.handle, o.name, u.email
   from organization o join "user" u on u.id = o."ownerId" limit 5`,
)
console.log("[v0] orgs:", JSON.stringify(rows, null, 2))
await pool.end()
