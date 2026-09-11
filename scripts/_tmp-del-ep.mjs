import pg from "pg"
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
const ID = 23
const before = await c.query(`select id, title, "mediaKind", "audioUrl" is not null as "hasAudio", "homeId" from episode where id=$1`, [ID])
console.log("TARGET", before.rows)
// Remove dependent rows that reference this episode, then the episode itself.
const depTables = await c.query(
  `select table_name, column_name from information_schema.columns
    where table_schema='public' and column_name in ('episodeId','episode_id')`,
)
for (const d of depTables.rows) {
  const r = await c.query(`delete from "${d.table_name}" where "${d.column_name}"=$1`, [ID])
  console.log(`deleted ${r.rowCount} from ${d.table_name}`)
}
const del = await c.query(`delete from episode where id=$1`, [ID])
console.log("deleted episode rows:", del.rowCount)
await c.end()
