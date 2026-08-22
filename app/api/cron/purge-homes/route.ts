// Scheduled purge of Homes whose 30-day recovery window has elapsed.
//
// Without this the retention window never actually ends: `deleteHome` stamps
// `purgeAfter`, but nothing was ever calling `purgeExpiredHomes`, so deleted
// Homes' data would have been kept indefinitely.
import { purgeExpiredHomes } from "@/lib/home/retention"

// The purge reads and writes many rows across ~20 tables, so it must never be
// served from a cache, and it needs more than the default execution budget.
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request): Promise<Response> {
  // This endpoint permanently destroys data, so it must be callable only by
  // Vercel Cron. Vercel signs scheduled invocations with CRON_SECRET as a bearer
  // token; anything else is rejected. If the secret isn't configured we refuse
  // outright rather than leaving an unauthenticated purge endpoint exposed.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 500 })
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { purged } = await purgeExpiredHomes()
    return Response.json({ ok: true, purged })
  } catch (error) {
    console.log("[v0] purge-homes cron failed:", error instanceof Error ? error.message : error)
    return Response.json({ error: "Purge failed." }, { status: 500 })
  }
}
