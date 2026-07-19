"use server"

// Private, per-user notes captured during a live session. Notes are written from
// the in-live Notes mini-panel and surface in the main-app "Live Notes" menu
// section grouped Host → Topic → Date. Every query is scoped by userId — there
// is no RLS on Neon, so the eq(userId) in each where clause is what keeps one
// user's notes private to them.

import { and, desc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { liveNote } from "@/lib/db/schema"

const MAX_BODY = 20000
const MAX_META = 300

async function getUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

export type LiveNoteView = {
  id: number
  roomName: string | null
  streamId: number | null
  hostId: string | null
  hostName: string | null
  topic: string | null
  sessionTitle: string | null
  mode: string | null
  body: string
  createdAt: string
  updatedAt: string
}

// Descriptor of the live the note belongs to, passed from the client so the
// note retains host/topic/date/session context for the main Live Notes section.
export type LiveNoteContext = {
  roomName?: string | null
  streamId?: number | null
  hostId?: string | null
  hostName?: string | null
  topic?: string | null
  sessionTitle?: string | null
  mode?: string | null
}

function toView(row: typeof liveNote.$inferSelect): LiveNoteView {
  return {
    id: row.id,
    roomName: row.roomName,
    streamId: row.streamId,
    hostId: row.hostId,
    hostName: row.hostName,
    topic: row.topic,
    sessionTitle: row.sessionTitle,
    mode: row.mode,
    body: row.body,
    createdAt: (row.createdAt ?? new Date()).toISOString(),
    updatedAt: (row.updatedAt ?? new Date()).toISOString(),
  }
}

/** Create a new note tagged with the live session's context. */
export async function createLiveNote(input: {
  body: string
  context?: LiveNoteContext
}): Promise<{ ok: boolean; note: LiveNoteView | null }> {
  const userId = await getUserId()
  if (!userId) return { ok: false, note: null }

  const body = input.body.slice(0, MAX_BODY)
  const ctx = input.context ?? {}
  const [row] = await db
    .insert(liveNote)
    .values({
      userId,
      roomName: ctx.roomName ?? null,
      streamId: ctx.streamId ?? null,
      hostId: ctx.hostId ?? null,
      hostName: ctx.hostName?.slice(0, MAX_META) ?? null,
      topic: ctx.topic?.slice(0, MAX_META) ?? null,
      sessionTitle: ctx.sessionTitle?.slice(0, MAX_META) ?? null,
      mode: ctx.mode ?? null,
    })
    .returning()

  // Persist the body after creation so an empty draft still creates the row and
  // subsequent autosaves land on the same note.
  if (body) {
    await db
      .update(liveNote)
      .set({ body, updatedAt: new Date() })
      .where(and(eq(liveNote.id, row.id), eq(liveNote.userId, userId)))
    row.body = body
  }

  revalidatePath("/live-notes")
  return { ok: true, note: toView(row) }
}

/** Update an existing note's body. Scoped to the owner. */
export async function updateLiveNote(id: number, body: string): Promise<{ ok: boolean }> {
  const userId = await getUserId()
  if (!userId) return { ok: false }

  await db
    .update(liveNote)
    .set({ body: body.slice(0, MAX_BODY), updatedAt: new Date() })
    .where(and(eq(liveNote.id, id), eq(liveNote.userId, userId)))

  revalidatePath("/live-notes")
  return { ok: true }
}

/** Delete a note. Scoped to the owner. */
export async function deleteLiveNote(id: number): Promise<{ ok: boolean }> {
  const userId = await getUserId()
  if (!userId) return { ok: false }

  await db.delete(liveNote).where(and(eq(liveNote.id, id), eq(liveNote.userId, userId)))
  revalidatePath("/live-notes")
  return { ok: true }
}

/** Notes the user took in a specific live session (newest first). */
export async function getLiveNotesForSession(roomName: string): Promise<LiveNoteView[]> {
  const userId = await getUserId()
  if (!userId || !roomName) return []

  const rows = await db
    .select()
    .from(liveNote)
    .where(and(eq(liveNote.userId, userId), eq(liveNote.roomName, roomName)))
    .orderBy(desc(liveNote.updatedAt))

  return rows.map(toView)
}

// A note grouped for the main Live Notes browser.
export type GroupedLiveNote = {
  id: number
  topic: string
  date: string // ISO
  sessionTitle: string | null
  roomName: string | null
  streamId: number | null
  mode: string | null
  preview: string
}

export type LiveNoteHostGroup = {
  hostId: string | null
  hostName: string
  notes: GroupedLiveNote[]
}

/**
 * All of the user's live notes grouped by host (each host's notes sorted newest
 * first) for the main-app Live Notes section. Groups are ordered by their most
 * recent note.
 */
export async function getLiveNotes(): Promise<LiveNoteHostGroup[]> {
  const userId = await getUserId()
  if (!userId) return []

  const rows = await db
    .select()
    .from(liveNote)
    .where(eq(liveNote.userId, userId))
    .orderBy(desc(liveNote.updatedAt))

  const groups = new Map<string, LiveNoteHostGroup>()
  for (const r of rows) {
    const key = r.hostId ?? r.hostName ?? "unknown"
    let g = groups.get(key)
    if (!g) {
      g = { hostId: r.hostId, hostName: r.hostName || "Unknown host", notes: [] }
      groups.set(key, g)
    }
    const body = (r.body ?? "").trim()
    g.notes.push({
      id: r.id,
      topic: (r.topic || r.sessionTitle || "Untitled note").trim(),
      date: (r.updatedAt ?? r.createdAt ?? new Date()).toISOString(),
      sessionTitle: r.sessionTitle,
      roomName: r.roomName,
      streamId: r.streamId,
      mode: r.mode,
      preview: body.length > 140 ? `${body.slice(0, 140)}…` : body,
    })
  }

  return Array.from(groups.values())
}
