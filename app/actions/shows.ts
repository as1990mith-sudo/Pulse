"use server"

import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { episode } from "@/lib/db/schema"
import { getHandle } from "@/lib/identity"

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * Publishes a finished session to the host's catalogue. The episode is
 * attributed to the signed-in host and shows on their profile + the catalogue.
 */
export async function publishShow(input: {
  title: string
  tagline: string
  category: string
  duration: string
  description: string
  cover: string | null
  audioUrl?: string | null
}): Promise<ActionResult> {
  const user = await requireUser()

  const title = input.title.trim()
  const tagline = input.tagline.trim()
  // Category is optional now — only title + description are required to publish.
  const category = input.category.trim() || "Episode"
  const description = input.description.trim()

  if (!title || !description) {
    return { ok: false, error: "Title and description are required." }
  }

  const base = slugify(title) || "session"
  let slug = base
  let n = 2
  while ((await db.select({ id: episode.id }).from(episode).where(eq(episode.slug, slug))).length > 0) {
    slug = `${base}-${n++}`
  }

  await db.insert(episode).values({
    slug,
    title,
    tagline: tagline || category,
    category,
    hostName: user.name,
    hostUserId: user.id,
    hostHandle: getHandle(user.name),
    duration: input.duration.trim() || null,
    cover: input.cover,
    description,
    audioUrl: input.audioUrl ?? null,
  })

  revalidatePath("/live")
  revalidatePath(`/u/${user.id}`)
  return { ok: true }
}

/**
 * Deletes one of the signed-in user's own published episodes (identified by its
 * slug). Scoped to hostUserId so a user can only remove their own episodes.
 */
export async function deleteEpisode(slug: string): Promise<ActionResult> {
  const user = await requireUser()

  const [row] = await db.select().from(episode).where(eq(episode.slug, slug)).limit(1)
  if (!row) return { ok: false, error: "Episode not found." }
  if (row.hostUserId !== user.id) {
    return { ok: false, error: "You can only delete your own episodes." }
  }

  await db.delete(episode).where(and(eq(episode.slug, slug), eq(episode.hostUserId, user.id)))

  revalidatePath("/live")
  revalidatePath(`/u/${user.id}`)
  return { ok: true }
}
