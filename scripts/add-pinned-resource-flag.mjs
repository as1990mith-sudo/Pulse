// Idempotent: add the `pinned` quick-access flag to pinned_resource.
//
// Uploaded documents (kind "pdf") are shown in the dedicated PDF/Document panel
// and must NOT be auto-duplicated into the "Pinned Resources" quick-access list.
// The flag defaults to true (so notes, images, verses, links keep appearing in
// Pinned as before), and every existing document row is reset to NOT pinned so
// the historical duplication is cleared too. A host can re-pin any document
// later, which flips this flag on the same row rather than creating a copy.
//
// Run: node --env-file=/vercel/share/.env.project scripts/add-pinned-resource-flag.mjs
import pg from "pg"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    await client.query(`
      ALTER TABLE pinned_resource
        ADD COLUMN IF NOT EXISTS "pinned" boolean NOT NULL DEFAULT true
    `)
    // Clear the historical auto-duplication: existing documents leave the
    // quick-access list but stay in the PDF/Document panel (kind is unchanged).
    const res = await client.query(`
      UPDATE pinned_resource SET "pinned" = false WHERE kind = 'pdf'
    `)
    console.log(`[pinned-flag] pinned_resource.pinned ready; ${res.rowCount} document row(s) unpinned`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[pinned-flag] failed:", err)
  process.exit(1)
})
