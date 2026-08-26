/**
 * One-off backfill: give every unscoped Community thread a Home.
 *
 * Community Help used to be a single Universal room, so existing threads have
 * `homeId = null`. Now that each Home has its own private room, those threads
 * would only be reachable from the Universal room — effectively vanishing for
 * members who are always inside a Home.
 *
 * Home is resolved per post, most reliable signal first:
 *
 *   1. `organizationId` — the post was published in an organisation's voice, so
 *      that organisation's Home is a FACT, not a guess.
 *   2. The author's single active Home — unambiguous when they belong to one.
 *   3. The author's OLDEST active membership — a genuine guess, used only when
 *      the author belongs to several Homes and nothing else disambiguates.
 *
 * Anything still unresolved (author has no active membership) is left null and
 * stays in the Universal room rather than being assigned somewhere arbitrary.
 *
 * Idempotent: only touches rows where "homeId" IS NULL, so re-running is safe.
 * Pass --apply to write; the default is a dry run that only reports.
 */
import pg from "pg"

const APPLY = process.argv.includes("--apply")

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const client = await pool.connect()

try {
  const { rows: posts } = await client.query(`
    SELECT p.id, p."userId", p."organizationId", left(p.body, 50) AS preview
    FROM community_post p
    WHERE p.deleted = false AND p."homeId" IS NULL
    ORDER BY p.id
  `)

  if (posts.length === 0) {
    console.log("[v0] No unscoped community threads. Nothing to do.")
    process.exit(0)
  }

  // Home that each organisation owns, for rule 1.
  const { rows: orgHomes } = await client.query(`SELECT id, "organizationId" FROM home`)
  const homeByOrg = new Map(orgHomes.map((h) => [h.organizationId, h.id]))

  // Every active membership per author, oldest first, for rules 2 and 3.
  const { rows: memberships } = await client.query(
    `SELECT m."userId", m."homeId", o.name
     FROM home_membership m
     JOIN home h ON h.id = m."homeId"
     JOIN organization o ON o.id = h."organizationId"
     WHERE m.status = 'active'
     ORDER BY m."createdAt" ASC`,
  )
  const homesByUser = new Map()
  for (const m of memberships) {
    if (!homesByUser.has(m.userId)) homesByUser.set(m.userId, [])
    homesByUser.get(m.userId).push(m)
  }

  const homeNames = new Map(memberships.map((m) => [m.homeId, m.name]))
  const plan = []

  for (const p of posts) {
    const mine = homesByUser.get(p.userId) ?? []
    const fromOrg = p.organizationId ? homeByOrg.get(p.organizationId) : null

    let homeId = null
    let basis = "unresolved"
    if (fromOrg) {
      homeId = fromOrg
      basis = "publishing org (exact)"
    } else if (mine.length === 1) {
      homeId = mine[0].homeId
      basis = "sole active home (exact)"
    } else if (mine.length > 1) {
      homeId = mine[0].homeId
      basis = `GUESS: oldest of ${mine.length} homes`
    }

    plan.push({ id: p.id, preview: p.preview, home: homeNames.get(homeId) ?? "— left global —", basis, homeId })
  }

  console.table(plan.map(({ homeId, ...show }) => show))

  const resolved = plan.filter((p) => p.homeId)
  const guesses = resolved.filter((p) => p.basis.startsWith("GUESS"))
  console.log(
    `[v0] ${resolved.length}/${plan.length} resolvable (${guesses.length} by guess, ${plan.length - resolved.length} left global).`,
  )

  if (!APPLY) {
    console.log("[v0] Dry run. Re-run with --apply to write these changes.")
    process.exit(0)
  }

  let updated = 0
  for (const p of resolved) {
    // Re-assert "homeId" IS NULL so a concurrent write can't be clobbered.
    const res = await client.query(
      `UPDATE community_post SET "homeId" = $1 WHERE id = $2 AND "homeId" IS NULL`,
      [p.homeId, p.id],
    )
    updated += res.rowCount
  }
  console.log(`[v0] Updated ${updated} thread(s).`)
} finally {
  client.release()
  await pool.end()
}
