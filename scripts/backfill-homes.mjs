// One-time (idempotent) backfill: guarantee every organisation is a Frequency
// Home. For each org lacking a Home this creates the home row, an active Owner
// membership for the org owner, and an active Organisation Authorisation Key.
// Safe to re-run — every step is skipped when the row already exists.
//
// Run with:
//   node --env-file=/vercel/share/.env.project scripts/backfill-homes.mjs
//
// Mirrors lib/home/provision.ts (ensureHomeForOrg). Kept as plain SQL so it can
// run standalone without the app's TypeScript/server-only modules.

import pg from "pg"
import { randomUUID, randomInt } from "node:crypto"

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ" // Crockford-style, no ambiguous chars

function randomGroup(len) {
  let out = ""
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(0, ALPHABET.length)]
  return out
}
function orgToken(name) {
  const letters = String(name || "").toUpperCase().replace(/[^A-Z]/g, "")
  return (letters.slice(0, 3) || "ORG").padEnd(3, "X")
}
function generateAuthKey(orgName) {
  return `FREQ-${orgToken(orgName)}-${randomGroup(4)}-${randomGroup(4)}`
}

async function insertFreshKey(client, homeId, orgName, createdBy) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const key = generateAuthKey(orgName)
    try {
      await client.query(
        `INSERT INTO home_auth_key (id, "homeId", key, active, "createdBy", "createdAt")
         VALUES ($1, $2, $3, true, $4, now())`,
        [randomUUID(), homeId, key, createdBy],
      )
      return key
    } catch (err) {
      if (String(err.code) === "23505") continue // unique violation — retry
      throw err
    }
  }
  throw new Error("Could not generate an authorisation key after several attempts.")
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  const summary = { orgs: 0, homesCreated: 0, ownersAdded: 0, keysIssued: 0, alreadyComplete: 0 }

  try {
    const { rows: orgs } = await client.query(
      `SELECT id, name, handle, "ownerId" FROM organization ORDER BY "createdAt" ASC`,
    )
    summary.orgs = orgs.length

    for (const org of orgs) {
      let touched = false

      // 1) Home row.
      const { rows: homeRows } = await client.query(
        `SELECT id FROM home WHERE "organizationId" = $1 LIMIT 1`,
        [org.id],
      )
      let homeId
      if (homeRows.length > 0) {
        homeId = homeRows[0].id
      } else {
        homeId = randomUUID()
        await client.query(
          `INSERT INTO home (id, "organizationId", name, plan, "joinPolicy", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 'premium', 'auto', now(), now())`,
          [homeId, org.id, `${org.name} Home`],
        )
        summary.homesCreated++
        touched = true
      }

      // 2) Owner membership for the org owner.
      const { rows: ownerRows } = await client.query(
        `SELECT id FROM home_membership WHERE "homeId" = $1 AND "userId" = $2 LIMIT 1`,
        [homeId, org.ownerId],
      )
      if (ownerRows.length === 0) {
        await client.query(
          `INSERT INTO home_membership (id, "homeId", "userId", role, status, "joinedVia", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 'owner', 'active', 'created', now(), now())`,
          [randomUUID(), homeId, org.ownerId],
        )
        summary.ownersAdded++
        touched = true
      }

      // 3) Active authorisation key.
      const { rows: keyRows } = await client.query(
        `SELECT id FROM home_auth_key WHERE "homeId" = $1 AND active = true LIMIT 1`,
        [homeId],
      )
      if (keyRows.length === 0) {
        const key = await insertFreshKey(client, homeId, org.name, org.ownerId)
        summary.keysIssued++
        touched = true
        console.log(`[v0] provisioned key for ${org.name} (${org.handle}): ${key}`)
      }

      if (!touched) summary.alreadyComplete++
    }

    console.log("[v0] backfill complete:", JSON.stringify(summary))
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[v0] backfill failed:", err)
  process.exit(1)
})
