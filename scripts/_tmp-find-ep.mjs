import pg from "pg"
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
const tables = await c.query(
  `select table_name from information_schema.tables where table_schema='public' and table_name ilike '%home%'`,
)
console.log("HOME-ish TABLES", tables.rows.map((r) => r.table_name))
// Try organization again but also check membership/home tables for 809
for (const tn of tables.rows.map((r) => r.table_name)) {
  try {
    const cols = await c.query(
      `select column_name from information_schema.columns where table_schema='public' and table_name=$1`,
      [tn],
    )
    const hasId = cols.rows.some((r) => r.column_name === "id")
    if (hasId) {
      const hit = await c.query(`select * from "${tn}" where id='809dc239-9d17-479e-9cca-130d7609323e' limit 1`)
      if (hit.rows.length) console.log(`FOUND 809 in ${tn}:`, hit.rows[0])
    }
  } catch (e) { /* ignore */ }
}
await c.end()
