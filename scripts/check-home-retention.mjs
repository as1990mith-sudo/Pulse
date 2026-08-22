// One-off verification: confirm the soft-deletion retention columns and index
// actually exist in the database, not just in the Drizzle schema file.
//
// Run with:
//   node --env-file=/vercel/share/.env.project scripts/check-home-retention.mjs
import pg from "pg"

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const cols = await client.query(
  `select column_name, data_type from information_schema.columns
   where table_name = 'home' and column_name in ('deletedAt','purgeAfter','status')
   order by column_name`,
)
console.log("COLUMNS:", cols.rows.map((c) => `${c.column_name}:${c.data_type}`).join(", ") || "NONE")

const idx = await client.query(`select indexname from pg_indexes where tablename = 'home'`)
console.log("INDEXES:", idx.rows.map((i) => i.indexname).join(", "))

const have = new Set(cols.rows.map((c) => c.column_name))
if (have.has("deletedAt") && have.has("purgeAfter")) {
  const pending = await client.query(
    `select id, "deletedAt", "purgeAfter", status from home where "deletedAt" is not null`,
  )
  console.log("SOFT-DELETED ROWS:", pending.rows.length)
  for (const r of pending.rows) console.log("  ", r.id, r.status, r.deletedAt, "->", r.purgeAfter)
} else {
  console.log("MISSING COLUMNS — migration not applied yet.")
}

await client.end()
