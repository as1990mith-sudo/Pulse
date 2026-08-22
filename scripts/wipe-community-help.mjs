// Permanently removes ALL Community Help posts and everything hanging off them.
//
// This is a hard delete, not the app's `deleted` soft flag: the intent is to
// clear the room out entirely rather than leave tombstoned rows that still
// occupy ids and can be resurrected.
//
// Order matters — children first, then the posts — so nothing is left pointing
// at a row that no longer exists. There are no FK constraints between these
// tables, so the cleanup has to be explicit; deleting only the posts would
// strand comment and like rows that the app would keep counting.
//
// Everything runs in ONE transaction, so a failure part-way leaves the data
// exactly as it was instead of half-wiped.
//
// Run with:
//   node --env-file=/vercel/share/.env.project scripts/wipe-community-help.mjs
import pg from "pg"

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

try {
  await client.query("begin")

  // Like rows are keyed by (targetType, targetId) with no FK, so they must be
  // cleared for BOTH posts and comments or they'd linger as unreachable rows.
  const likes = await client.query(
    `delete from "like"
     where ("targetType" = 'community_post' and "targetId" in (select id from community_post))
        or ("targetType" = 'community_comment' and "targetId" in (select id from community_comment))`,
  )

  const comments = await client.query(`delete from community_comment`)
  const posts = await client.query(`delete from community_post`)

  await client.query("commit")

  console.log("WIPED — likes:", likes.rowCount, "comments:", comments.rowCount, "posts:", posts.rowCount)

  const { rows } = await client.query(`select count(*)::int as remaining from community_post`)
  console.log("REMAINING POSTS:", rows[0].remaining)
} catch (error) {
  await client.query("rollback")
  console.log("ROLLED BACK —", error.message)
  process.exitCode = 1
} finally {
  await client.end()
}
