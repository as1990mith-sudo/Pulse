// Read-only survey of Community Help data, so the scope of a wipe is known
// BEFORE anything is destroyed. Counts posts (split by Universal vs Home-scoped),
// their comments, and the orphaned like rows that reference them.
//
// Run with:
//   node --env-file=/vercel/share/.env.project scripts/survey-community-help.mjs
import pg from "pg"

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const q = async (label, sql) => {
  const { rows } = await client.query(sql)
  console.log(label, JSON.stringify(rows))
}

await q(
  "POSTS:",
  `select count(*)::int as total,
          count(*) filter (where "homeId" is null)::int as universal,
          count(*) filter (where "homeId" is not null)::int as home_scoped,
          count(*) filter (where deleted)::int as soft_deleted
   from community_post`,
)

await q("COMMENTS:", `select count(*)::int as total from community_comment`)

await q(
  "LIKES:",
  `select "targetType", count(*)::int as n from "like"
   where "targetType" in ('community_post','community_comment')
   group by "targetType"`,
)

await q(
  "POSTS BY HOME:",
  `select coalesce("homeId",'(universal)') as home, count(*)::int as n
   from community_post group by 1 order by n desc limit 10`,
)

await client.end()
