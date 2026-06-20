"use server"

import { eq } from "drizzle-orm"
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
  const category = input.category.trim()
  const description = input.description.trim()

  if (!title || !category || !description) {
    return { ok: false, error: "Title, category, and description are required." }
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
