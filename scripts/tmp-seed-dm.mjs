// Temporary: removes the DM thread seeded for browser verification.
import pg from "pg"

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

for (const id of [1, 4]) {
  await client.query(`DELETE FROM dm_message WHERE "conversationId"=$1`, [id])
  await client.query(`DELETE FROM dm_conversation WHERE id=$1`, [id])
}
console.log("[v0] cleaned up seeded conversations")

await client.end()
