"use server"

// Per-user Bible annotations: verse highlights and verse notes, both persisted
// to the signed-in reader's account so they survive across sessions and devices
// (replacing the old localStorage-only highlight store). Every query is scoped
// by userId — there is no RLS on Neon, so the eq(userId) in each where clause is
// what keeps one reader's notes and highlights private to them.

import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { bibleHighlight, bibleNote } from "@/lib/db/schema"

// Colours the client understands. Anything else is rejected so a bad request
// can't write junk into the highlight column.
const HIGHLIGHT_COLORS = new Set(["yellow", "green", "blue", "pink"])
const MAX_NOTE_LENGTH = 5000

export type BibleNoteView = {
  body: string
  updatedAt: string
}

// A single note flattened with its parsed verse coordinates, for the notes list
// page. bookIndex is 0-based (matches BIBLE_BOOKS order) so sorting by
// [bookIndex, chapter, verse] yields canonical Bible order.
export type BibleNoteListItem = {
  verseId: string
  bookIndex: number
  chapter: number
  verse: number
  body: string
  updatedAt: string
}

export type BibleAnnotations = {
  // verseId ("bookIndex:chapter:verse") → highlight colour key.
  highlights: Record<string, string>
  // verseId → the reader's note on that verse.
  notes: Record<string, BibleNoteView>
}

async function getUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

/**
 * All of the signed-in reader's highlights and notes, keyed by verseId so the
 * reader can merge them into the chapter it's rendering. Returns empty maps when
 * signed out (the reader falls back to local highlights in that case).
 */
export async function getBibleAnnotations(): Promise<BibleAnnotations> {
  const userId = await getUserId()
  if (!userId) return { highlights: {}, notes: {} }

  const [hlRows, noteRows] = await Promise.all([
    db
      .select({ verseId: bibleHighlight.verseId, color: bibleHighlight.color })
      .from(bibleHighlight)
      .where(eq(bibleHighlight.userId, userId)),
    db
      .select({ verseId: bibleNote.verseId, body: bibleNote.body, updatedAt: bibleNote.updatedAt })
      .from(bibleNote)
      .where(eq(bibleNote.userId, userId)),
  ])

  const highlights: Record<string, string> = {}
  for (const r of hlRows) highlights[r.verseId] = r.color

  const notes: Record<string, BibleNoteView> = {}
  for (const r of noteRows) {
    notes[r.verseId] = { body: r.body, updatedAt: (r.updatedAt ?? new Date()).toISOString() }
  }

  return { highlights, notes }
}

/**
 * Set (or clear) the highlight colour on a verse. Passing null removes it.
 * Upserts on the (userId, verseId) unique index so re-highlighting just changes
 * the colour in place.
 */
export async function setBibleHighlight(
  verseId: string,
  color: string | null,
): Promise<{ ok: boolean }> {
  const userId = await getUserId()
  if (!userId) return { ok: false }

  if (color === null) {
    await db
      .delete(bibleHighlight)
      .where(and(eq(bibleHighlight.userId, userId), eq(bibleHighlight.verseId, verseId)))
    return { ok: true }
  }

  if (!HIGHLIGHT_COLORS.has(color)) return { ok: false }

  await db
    .insert(bibleHighlight)
    .values({ userId, verseId, color })
    .onConflictDoUpdate({
      target: [bibleHighlight.userId, bibleHighlight.verseId],
      set: { color, updatedAt: new Date() },
    })

  return { ok: true }
}

/**
 * Create or update the reader's note on a verse. An empty/blank body deletes the
 * note (so clearing the editor removes it). Returns the saved note view, or null
 * when the note was removed.
 */
export async function saveBibleNote(
  verseId: string,
  body: string,
): Promise<{ ok: boolean; note: BibleNoteView | null }> {
  const userId = await getUserId()
  if (!userId) return { ok: false, note: null }

  const trimmed = body.trim().slice(0, MAX_NOTE_LENGTH)

  if (!trimmed) {
    await db
      .delete(bibleNote)
      .where(and(eq(bibleNote.userId, userId), eq(bibleNote.verseId, verseId)))
    return { ok: true, note: null }
  }

  const now = new Date()
  await db
    .insert(bibleNote)
    .values({ userId, verseId, body: trimmed, updatedAt: now })
    .onConflictDoUpdate({
      target: [bibleNote.userId, bibleNote.verseId],
      set: { body: trimmed, updatedAt: now },
    })

  return { ok: true, note: { body: trimmed, updatedAt: now.toISOString() } }
}

/**
 * Every note the signed-in reader has made, sorted into canonical Bible order
 * (book, then chapter, then verse) for the notes page. Malformed verseIds are
 * skipped defensively. Returns an empty array when signed out.
 */
export async function getBibleNotesList(): Promise<BibleNoteListItem[]> {
  const userId = await getUserId()
  if (!userId) return []

  const rows = await db
    .select({ verseId: bibleNote.verseId, body: bibleNote.body, updatedAt: bibleNote.updatedAt })
    .from(bibleNote)
    .where(eq(bibleNote.userId, userId))

  const items: BibleNoteListItem[] = []
  for (const r of rows) {
    const [b, c, v] = r.verseId.split(":").map(Number)
    if (![b, c, v].every((n) => Number.isFinite(n))) continue
    items.push({
      verseId: r.verseId,
      bookIndex: b,
      chapter: c,
      verse: v,
      body: r.body,
      updatedAt: (r.updatedAt ?? new Date()).toISOString(),
    })
  }

  items.sort((a, b) => a.bookIndex - b.bookIndex || a.chapter - b.chapter || a.verse - b.verse)
  return items
}

/** Delete the reader's note on a verse. */
export async function deleteBibleNote(verseId: string): Promise<{ ok: boolean }> {
  const userId = await getUserId()
  if (!userId) return { ok: false }

  await db
    .delete(bibleNote)
    .where(and(eq(bibleNote.userId, userId), eq(bibleNote.verseId, verseId)))
  return { ok: true }
}
