// Temporary: seeds a DM thread so the chat UI can be verified in the browser.
import pg from "pg"

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const A = "UToiiXCVXUPLUyrcwiGPMWEBRRXw76h0" // Andrew_Smith
const B = "geSVHGCB4gn5cL4vtEW3u5iVJ0dNi0sV" // Andrew Smith

const existing = await client.query(
  `SELECT id FROM dm_conversation WHERE ("userAId"=$1 AND "userBId"=$2) OR ("userAId"=$2 AND "userBId"=$1) LIMIT 1`,
  [A, B],
)

let convId = existing.rows[0]?.id
if (!convId) {
  const ins = await client.query(
    `INSERT INTO dm_conversation ("userAId","userBId","lastMessageAt") VALUES ($1,$2,now()) RETURNING id`,
    [A, B],
  )
  convId = ins.rows[0].id
}
console.log("[v0] conversation:", convId)

await client.query(`DELETE FROM dm_message WHERE "conversationId"=$1`, [convId])

const long =
  "Hey, quick update on the broadcast plan for next month. We are moving the Sunday stream to 6pm so the choir has time to set up, and I have asked the media team to test the new audio interface beforehand. If the levels are still clipping we will fall back to the old board for now. Also, I want to trial the call-in feature during the second half so listeners can join the conversation live, but only once we are confident the latency is under control. Let me know if any of that clashes with your schedule."

const msgs = [
  // Two days ago
  [B, "Morning! Are we still on for the run-through?", "2 days"],
  [A, "Yes, 4pm works.", "2 days"],
  // Yesterday
  [B, long, "1 day"],
  [A, "That all sounds good to me.", "1 day"],
  // Today
  [B, "Have a look at this: https://frequencyglobal.site", "0 day"],
  [A, "Nice, the new landing page looks sharp.", "0 day"],
]

for (const [sender, body, ago] of msgs) {
  await client.query(
    `INSERT INTO dm_message ("conversationId","senderId","body","createdAt")
     VALUES ($1,$2,$3, now() - $4::interval + (random() * interval '2 hours'))`,
    [convId, sender, body, ago],
  )
}

await client.query(`UPDATE dm_conversation SET "lastMessageAt"=now() WHERE id=$1`, [convId])
console.log("[v0] seeded", msgs.length, "messages")

await client.end()
