// Adds the poll / poll_option / poll_vote tables (idempotent).
//
// A poll hangs off exactly one feed_post: the post's `text` is the question, so
// the poll itself only stores the mechanics (options, multi-select, closing
// time). That keeps polls inside the normal feed — they like, comment, sort and
// scope by Home like any other post, with no separate "poll feed".
//
// Votes are individual rows rather than a counter on the option, because voters
// may CHANGE their mind while the poll is open. A counter would need a
// read-modify-write per vote and would drift under concurrency; counting rows is
// always exact, and "has this person voted?" is the same lookup.
//
// Run with:
//   node --env-file=/vercel/share/.env.project scripts/add-polls.mjs

import pg from "pg"

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "poll" (
        "id" serial PRIMARY KEY,
        "postId" integer NOT NULL,
        -- Whether a voter may pick several options. Fixed at creation: changing
        -- it later would silently re-interpret votes already cast.
        "allowMultiple" boolean NOT NULL DEFAULT false,
        -- Optional closing time. NULL = stays open indefinitely.
        "closesAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `)
    // One poll per post, and the feed's per-post lookup.
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "poll_post_idx" ON "poll" ("postId")`)

    await client.query(`
      CREATE TABLE IF NOT EXISTS "poll_option" (
        "id" serial PRIMARY KEY,
        "pollId" integer NOT NULL,
        "label" text NOT NULL,
        -- Author's chosen display order, so options never reshuffle between reads.
        "position" integer NOT NULL DEFAULT 0
      )
    `)
    await client.query(
      `CREATE INDEX IF NOT EXISTS "poll_option_poll_position_idx" ON "poll_option" ("pollId", "position")`,
    )

    await client.query(`
      CREATE TABLE IF NOT EXISTS "poll_vote" (
        "id" serial PRIMARY KEY,
        "pollId" integer NOT NULL,
        "optionId" integer NOT NULL,
        "userId" text NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `)
    // Makes a double-tap on the same option a no-op instead of a second vote.
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "poll_vote_unique_idx" ON "poll_vote" ("pollId", "userId", "optionId")`,
    )
    // Backs "what did this viewer choose?" (results are withheld until they vote).
    await client.query(`CREATE INDEX IF NOT EXISTS "poll_vote_poll_user_idx" ON "poll_vote" ("pollId", "userId")`)
    // Backs the per-option tally.
    await client.query(`CREATE INDEX IF NOT EXISTS "poll_vote_option_idx" ON "poll_vote" ("optionId")`)

    console.log("[v0] Migration complete: created poll, poll_option, poll_vote (+ indexes)")
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] poll migration failed:", err)
  process.exit(1)
})
