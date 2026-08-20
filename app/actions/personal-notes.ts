"use server"

// Free-form personal notes for the main-app Notes → Personal Notes tab. A plain
// notes app, unconnected to any live. Every query is scoped by userId — there is
// no RLS on Neon, so the eq(userId) in each where clause is what keeps one
// user's notes private to them.

import { and, desc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { personalNote } from "@/lib/db/schema"

const MAX_TITLE = 200
const MAX_BODY = 50000

async function getUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

export type PersonalNoteView = {
  id: number
  title: string
  body: string
  createdAt: string
  updatedAt: string
}

function toView(row: typeof personalNote.$inferSelect): PersonalNoteView {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: (row.createdAt ?? new Date()).toISOString(),
    updatedAt: (row.updatedAt ?? new Date()).toISOString(),
  }
}

/** All of the user's personal notes, newest-updated first. */
export async function getPersonalNotes(): Promise<PersonalNoteView[]> {
  const userId = await getUserId()
  if (!userId) return []

  const rows = await db
    .select()
    .from(personalNote)
    .where(eq(personalNote.userId, userId))
    .orderBy(desc(personalNote.updatedAt))

  return rows.map(toView)
}

/** Create a new (blank) note and return it so the client can open the editor. */
export async function createPersonalNote(input?: {
  title?: string
  body?: string
}): Promise<{ ok: boolean; note: PersonalNoteView | null }> {
  const userId = await getUserId()
  if (!userId) return { ok: false, note: null }

  const [row] = await db
    .insert(personalNote)
    .values({
      userId,
      title: (input?.title ?? "").slice(0, MAX_TITLE),
      body: (input?.body ?? "").slice(0, MAX_BODY),
    })
    .returning()

  revalidatePath("/live-notes")
  return { ok: true, note: toView(row) }
}

/** Update a note's title/body. Scoped to the owner. */
export async function updatePersonalNote(
  id: number,
  input: { title: string; body: string },
): Promise<{ ok: boolean }> {
  const userId = await getUserId()
  if (!userId) return { ok: false }

  await db
    .update(personalNote)
    .set({
      title: input.title.slice(0, MAX_TITLE),
      body: input.body.slice(0, MAX_BODY),
      updatedAt: new Date(),
    })
    .where(and(eq(personalNote.id, id), eq(personalNote.userId, userId)))

  revalidatePath("/live-notes")
  return { ok: true }
}

/** Delete a note. Scoped to the owner. */
export async function deletePersonalNote(id: number): Promise<{ ok: boolean }> {
  const userId = await getUserId()
  if (!userId) return { ok: false }

  await db.delete(personalNote).where(and(eq(personalNote.id, id), eq(personalNote.userId, userId)))
  revalidatePath("/live-notes")
  return { ok: true }
}
