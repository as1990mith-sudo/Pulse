"use server"

// Host-pinned resources for a live room. Hosts pin verses, PDFs, books,
// devotionals, links, or previous sessions; participants read them from the
// resource drawer's Pinned panel. Pin/unpin is gated to the stream's host (or a
// grid co-host); reads are open to any participant of the room.

import { and, desc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { liveStream, pinnedResource } from "@/lib/db/schema"
import { PIN_KINDS, type PinKind, type PinnedResourceView } from "@/lib/pinned-resources"

// Types may be re-exported from a "use server" file (they're erased at runtime).
// Runtime values like PIN_KINDS must NOT be re-exported here — import those
// directly from "@/lib/pinned-resources".
export type { PinKind, PinnedResourceView }

async function getUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

// True when the user hosts (or co-hosts) the given room. Only hosts can pin.
async function isRoomHost(roomName: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ hostId: liveStream.hostId, cohostId: liveStream.gridCohostId })
    .from(liveStream)
    .where(eq(liveStream.roomName, roomName))
    .limit(1)
  if (!row) return false
  return row.hostId === userId || row.cohostId === userId
}

export async function pinResource(input: {
  roomName: string
  kind: PinKind
  title: string
  subtitle?: string | null
  url?: string | null
  refId?: string | null
  meta?: Record<string, unknown> | null
}): Promise<{ ok: boolean; resource: PinnedResourceView | null }> {
  const userId = await getUserId()
  if (!userId) return { ok: false, resource: null }
  if (!PIN_KINDS.includes(input.kind)) return { ok: false, resource: null }
  if (!(await isRoomHost(input.roomName, userId))) return { ok: false, resource: null }

  const [row] = await db
    .insert(pinnedResource)
    .values({
      roomName: input.roomName,
      pinnedBy: userId,
      kind: input.kind,
      title: input.title.slice(0, 300),
      subtitle: input.subtitle?.slice(0, 300) ?? null,
      url: input.url ?? null,
      refId: input.refId ?? null,
      meta: input.meta ?? null,
    })
    .returning()

  return { ok: true, resource: toView(row) }
}

export async function unpinResource(id: number, roomName: string): Promise<{ ok: boolean }> {
  const userId = await getUserId()
  if (!userId) return { ok: false }
  if (!(await isRoomHost(roomName, userId))) return { ok: false }

  await db.delete(pinnedResource).where(and(eq(pinnedResource.id, id), eq(pinnedResource.roomName, roomName)))
  return { ok: true }
}

export async function getPinnedResources(roomName: string): Promise<PinnedResourceView[]> {
  if (!roomName) return []
  const rows = await db
    .select()
    .from(pinnedResource)
    .where(eq(pinnedResource.roomName, roomName))
    .orderBy(desc(pinnedResource.createdAt))
  return rows.map(toView)
}

function toView(row: typeof pinnedResource.$inferSelect): PinnedResourceView {
  return {
    id: row.id,
    kind: row.kind as PinKind,
    title: row.title,
    subtitle: row.subtitle,
    url: row.url,
    refId: row.refId,
    meta: (row.meta as Record<string, unknown> | null) ?? null,
    createdAt: (row.createdAt ?? new Date()).toISOString(),
  }
}
