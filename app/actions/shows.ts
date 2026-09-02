"use server"

import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { episode, liveCallRequest, liveStream } from "@/lib/db/schema"
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
export type PublishResult = { ok: true; slug: string } | { ok: false; error: string }

/**
 * Publishes a finished session to the host's catalogue. The episode is
 * attributed to the signed-in host and shows on their profile + the catalogue.
 *
 * Designed for AUTO-PUBLISH: only a title is required (which always exists from
 * the live session). Description and cover are optional and can be refined
 * afterwards via `updateEpisode`. Returns the created slug so the caller can
 * offer inline editing.
 */
export async function publishShow(input: {
  title: string
  tagline: string
  category: string
  duration: string
  description: string
  cover: string | null
  audioUrl?: string | null
  videoUrl?: string | null
  playlist?: string | null
  // "live" when this episode is auto-published from a finished live session,
  // "upload" (default) when a host manually uploads a file. Keeps the two
  // apart in the catalogue's separate Live tab.
  source?: "upload" | "live"
  // The room this recording came from, for `source: "live"`. Used ONLY to look
  // up the session's Home server-side — the caller never supplies homeId
  // directly, so a client can't publish into an arbitrary Home's catalogue.
  roomName?: string | null
}): Promise<PublishResult> {
  const user = await requireUser()

  // Carry the live session's Home onto the episode. Without this the replay is
  // saved unscoped, and a Home catalogue only picks it up through its
  // `homeId IS NULL AND host is an admin` fallback — which silently drops
  // recordings published by a co-host, since a co-host isn't a Home admin.
  // Resolving it from the room (rather than trusting an argument) keeps the
  // episode's Home authoritative.
  let homeId: string | null = null
  if (input.source === "live" && input.roomName) {
    const [row] = await db
      .select({ homeId: liveStream.homeId, hostId: liveStream.hostId })
      .from(liveStream)
      .where(eq(liveStream.roomName, input.roomName))
      .limit(1)
    homeId = row?.homeId ?? null

    // One canonical episode per session: anyone other than the session's host
    // needs an explicit grant. Enforced server-side because the client gate
    // alone could be bypassed by calling this action directly, which would let a
    // co-host publish a duplicate (often shorter) copy of the show.
    //
    // A co-host who can END the whole session is, by that grant, also trusted to
    // save its canonical recording: when such a guest ends the live it should
    // behave "as though the host ended it" and offer the same save-to-catalogue
    // choice. So either `canSaveRecording` OR `canEndSession` authorizes the
    // save. Either way `homeId` is resolved from the room above, so the replay
    // always lands in the SESSION'S (host's) Home catalogue, never the co-host's.
    if (row && row.hostId !== user.id) {
      const [grant] = await db
        .select({
          canSaveRecording: liveCallRequest.canSaveRecording,
          canEndSession: liveCallRequest.canEndSession,
        })
        .from(liveCallRequest)
        .where(
          and(
            eq(liveCallRequest.roomName, input.roomName),
            eq(liveCallRequest.userId, user.id),
            eq(liveCallRequest.role, "cohost"),
          ),
        )
        .limit(1)
      if (!grant?.canSaveRecording && !grant?.canEndSession) {
        return { ok: false, error: "The host hasn't allowed you to save a recording of this session." }
      }
    }
  }

  const title = input.title.trim() || "Untitled session"
  const tagline = input.tagline.trim()
  // Category is optional — title is the only hard requirement so sessions can be
  // auto-published the moment a host goes off air.
  const category = input.category.trim() || "Episode"
  const description = input.description.trim()

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
    videoUrl: input.videoUrl ?? null,
    playlist: input.playlist?.trim() || null,
    source: input.source === "live" ? "live" : "upload",
    homeId,
  })

  revalidatePath("/live")
  revalidatePath(`/u/${user.id}`)
  return { ok: true, slug }
}

/**
 * Updates details of a host's already-published episode (used by the post-session
 * recap to refine an auto-published episode's title, description, or cover).
 * Scoped to hostUserId so a user can only edit their own episodes.
 */
export async function updateEpisode(input: {
  slug: string
  title?: string
  description?: string
  cover?: string | null
}): Promise<ActionResult> {
  const user = await requireUser()

  const [row] = await db.select().from(episode).where(eq(episode.slug, input.slug)).limit(1)
  if (!row) return { ok: false, error: "Episode not found." }
  if (row.hostUserId !== user.id) {
    return { ok: false, error: "You can only edit your own episodes." }
  }

  const patch: Partial<typeof episode.$inferInsert> = {}
  if (input.title !== undefined) {
    const t = input.title.trim()
    if (!t) return { ok: false, error: "Title can't be empty." }
    patch.title = t
  }
  if (input.description !== undefined) patch.description = input.description.trim()
  if (input.cover !== undefined) patch.cover = input.cover

  if (Object.keys(patch).length > 0) {
    await db.update(episode).set(patch).where(and(eq(episode.slug, input.slug), eq(episode.hostUserId, user.id)))
  }

  revalidatePath("/live")
  revalidatePath(`/u/${user.id}`)
  return { ok: true }
}

/**
 * Toggles whether one of the signed-in user's own episodes is private. Private
 * episodes are hidden from everyone except the host (the owner). Scoped to
 * hostUserId so a user can only change the privacy of their own episodes.
 */
export async function setEpisodePrivacy(slug: string, isPrivate: boolean): Promise<ActionResult> {
  const user = await requireUser()

  const [row] = await db.select().from(episode).where(eq(episode.slug, slug)).limit(1)
  if (!row) return { ok: false, error: "Episode not found." }
  if (row.hostUserId !== user.id) {
    return { ok: false, error: "You can only change your own episodes." }
  }

  await db
    .update(episode)
    .set({ isPrivate })
    .where(and(eq(episode.slug, slug), eq(episode.hostUserId, user.id)))

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
