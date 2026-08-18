"use server"

import "server-only"

import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { pool } from "@/lib/db"

// Column names across the schema that identify a row as "belonging to" a user.
// Any public table carrying one of these is cleaned up when that user deletes
// their account. Discovered dynamically so new tables are covered automatically.
const USER_REF_COLUMNS = [
  "userId",
  "authorId",
  "ownerId",
  "createdBy",
  "senderId",
  "actorId",
  "userAId",
  "userBId",
  "targetUserId",
  "recipientId",
]

// The auth tables clean themselves up via ON DELETE CASCADE when the user row
// goes, so we never touch them directly — and we must never delete the user
// table through the generic sweep.
const SKIP_TABLES = new Set(["user", "session", "account", "verification"])

/**
 * Permanently deletes the signed-in user's account and everything tied to it.
 *
 * This is irreversible. In a single transaction it:
 *  1. Deletes every Home (organisation) the user OWNS — its memberships, keys,
 *     and all Home/organisation-scoped content — because a Home cannot outlive
 *     its owner (per product decision).
 *  2. Deletes every row across the app that references the user as author,
 *     sender, owner, actor, etc., discovered dynamically from the live schema.
 *  3. Deletes the user row itself, which cascades their sessions and auth
 *     records.
 *
 * Table/column names come from the database catalog (not user input), and the
 * only interpolated value is the authenticated user's own id via a bound
 * parameter, so there is no SQL-injection surface.
 */
export async function deleteMyAccount(): Promise<{ ok: true }> {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session?.user?.id
  if (!userId) throw new Error("You must be signed in to do that.")

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    // 1) Resolve the organisations this user owns and the Homes attached to them.
    const orgRows = await client.query<{ id: string }>(
      `SELECT id FROM organization WHERE "ownerId" = $1`,
      [userId],
    )
    const ownedOrgIds = orgRows.rows.map((r) => r.id)

    let ownedHomeIds: string[] = []
    if (ownedOrgIds.length > 0) {
      const homeRows = await client.query<{ id: string }>(
        `SELECT id FROM home WHERE "organizationId" = ANY($1::text[])`,
        [ownedOrgIds],
      )
      ownedHomeIds = homeRows.rows.map((r) => r.id)
    }

    // Which public tables carry a homeId / organizationId / user-ref column?
    const cols = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'`,
    )
    const tablesWith = (col: string) =>
      cols.rows.filter((c) => c.column_name === col).map((c) => c.table_name)

    // 2) Delete Home- and organisation-scoped content for the owned Homes.
    if (ownedHomeIds.length > 0) {
      for (const table of tablesWith("homeId")) {
        if (SKIP_TABLES.has(table)) continue
        await client.query(`DELETE FROM "${table}" WHERE "homeId" = ANY($1::text[])`, [ownedHomeIds])
      }
    }
    if (ownedOrgIds.length > 0) {
      for (const table of tablesWith("organizationId")) {
        if (SKIP_TABLES.has(table) || table === "organization") continue
        await client.query(`DELETE FROM "${table}" WHERE "organizationId" = ANY($1::text[])`, [ownedOrgIds])
      }
      // Then the Homes and the organisations themselves.
      await client.query(`DELETE FROM home WHERE "organizationId" = ANY($1::text[])`, [ownedOrgIds])
      await client.query(`DELETE FROM organization WHERE id = ANY($1::text[])`, [ownedOrgIds])
    }

    // 3) Sweep every row that references this user directly.
    for (const col of USER_REF_COLUMNS) {
      for (const table of tablesWith(col)) {
        if (SKIP_TABLES.has(table)) continue
        await client.query(`DELETE FROM "${table}" WHERE "${col}" = $1`, [userId])
      }
    }

    // 4) Finally the user row — cascades sessions and auth accounts.
    await client.query(`DELETE FROM "user" WHERE id = $1`, [userId])

    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
  }

  return { ok: true }
}
