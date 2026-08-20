"use server"

import { and, eq, lt } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { episode, notification } from "@/lib/db/schema"
import { getHandle } from "@/lib/identity"
import { getActiveHomeContext } from "@/lib/home/active-home"

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

async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || "session"
  let slug = base
  let n = 2
  while ((await db.select({ id: episode.id }).from(episode).where(eq(episode.slug, slug))).length > 0) {
    slug = `${base}-${n++}`
  }
  return slug
}

/**
 * Sends a notification to the current user themselves. `notifyUser` deliberately
 * skips self-notifications (userId === actorId), but post-live processing is one
 * case where the host DOES want to hear about their own replay, so we insert the
 * row directly.
 */
async function notifySelf(input: {
  userId: string
  name: string
  message: string
  link: string
}): Promise<void> {
  await db.insert(notification).values({
    userId: input.userId,
    actorId: input.userId,
    actorName: input.name,
    type: "live",
    message: input.message,
    link: input.link,
  })
}

// Jobs whose upload hasn't completed within this window are considered stalled
// and reconciled to "failed" so they never sit in "Processing…" forever.
const STALL_MS = 30 * 60 * 1000 // 30 minutes

export type CreateProcessingResult =
  | { ok: true; episodeId: number; slug: string }
  | { ok: false; error: string }

/**
 * Immediately creates a placeholder episode in the host's Live Catalogue with
 * `processingStatus = "processing"`. Crucially, NO media url is set — a partial
 * or preview recording is never published as the final replay, so the row is
 * never playable until `finalizeProcessing` attaches the complete upload.
 */
export async function createProcessingEpisode(input: {
  title: string
  category: string
  duration: string
  cover: string | null
  // Whether the recording being processed is a video or audio replay. Persisted
  // so the catalogue can file it under the right Live subtab BEFORE the media
  // url exists (a processing row has no videoUrl/audioUrl yet).
  mediaKind: "video" | "audio"
  // The Home this replay belongs to. The video path passes the live session's
  // own homeId for an exact match; the audio path omits it, so we fall back to
  // the host's currently-active Home. Null => a Universal (non-Home) session.
  homeId?: string | null
}): Promise<CreateProcessingResult> {
  const user = await requireUser()

  const title = input.title.trim() || "Live session"
  const category = input.category.trim() || "Episode"
  const slug = await uniqueSlug(title)

  // Scope the replay to a Home so it surfaces only in that Home's organisation
  // Catalogue (and is kept out of the Universal Live catalogue). Prefer the
  // explicit session homeId; otherwise use the host's active Home at save time.
  const homeId = input.homeId ?? (await getActiveHomeContext()).home?.id ?? null

  const [row] = await db
    .insert(episode)
    .values({
      slug,
      title,
      tagline: category,
      category,
      hostName: user.name,
      hostUserId: user.id,
      hostHandle: getHandle(user.name),
      duration: input.duration.trim() || null,
      cover: input.cover,
      description: "",
      audioUrl: null,
      videoUrl: null,
      mediaKind: input.mediaKind === "video" ? "video" : "audio",
      source: "live",
      homeId,
      processingStatus: "processing",
      processingStartedAt: new Date(),
    })
    .returning({ id: episode.id, slug: episode.slug })

  revalidatePath("/live")
  revalidatePath(`/u/${user.id}`)
  return { ok: true, episodeId: row.id, slug: row.slug }
}

/**
 * Marks a processing episode as ready once the COMPLETE recording has finished
 * uploading: attaches the media url to the right column, flips status to
 * "ready", clears any error, and notifies the host that their replay is live.
 * Scoped to hostUserId so a user can only finalize their own episode.
 */
export async function finalizeProcessing(input: {
  episodeId: number
  mediaKind: "video" | "audio"
  url: string
}): Promise<ActionResult> {
  const user = await requireUser()

  const [row] = await db.select().from(episode).where(eq(episode.id, input.episodeId)).limit(1)
  if (!row) return { ok: false, error: "Episode not found." }
  if (row.hostUserId !== user.id) return { ok: false, error: "You can only update your own episodes." }

  await db
    .update(episode)
    .set({
      [input.mediaKind === "video" ? "videoUrl" : "audioUrl"]: input.url,
      processingStatus: "ready",
      processingError: null,
    })
    .where(and(eq(episode.id, input.episodeId), eq(episode.hostUserId, user.id)))

  await notifySelf({
    userId: user.id,
    name: user.name,
    message: "Your live replay is now ready in your Live Catalogue.",
    link: `/live/${row.slug}`,
  })

  revalidatePath("/live")
  revalidatePath(`/u/${user.id}`)
  return { ok: true }
}

/**
 * Marks a processing episode as failed (upload errored or was abandoned) and
 * records the error so the catalogue can show a Retry affordance. Notifies the
 * host so they know to retry. Scoped to hostUserId.
 */
export async function failProcessing(input: {
  episodeId: number
  error?: string
}): Promise<ActionResult> {
  const user = await requireUser()

  const [row] = await db.select().from(episode).where(eq(episode.id, input.episodeId)).limit(1)
  if (!row) return { ok: false, error: "Episode not found." }
  if (row.hostUserId !== user.id) return { ok: false, error: "You can only update your own episodes." }
  // Don't clobber an already-finalized episode.
  if (row.processingStatus === "ready") return { ok: true }

  await db
    .update(episode)
    .set({
      processingStatus: "failed",
      processingError: (input.error || "Upload failed").slice(0, 500),
    })
    .where(and(eq(episode.id, input.episodeId), eq(episode.hostUserId, user.id)))

  await notifySelf({
    userId: user.id,
    name: user.name,
    message: "We couldn't finish processing your live replay. Tap to retry.",
    link: `/u/${user.id}`,
  })

  revalidatePath("/live")
  revalidatePath(`/u/${user.id}`)
  return { ok: true }
}

/**
 * Deletes a processing/failed placeholder outright (used when the host discards
 * a stuck job). Scoped to hostUserId.
 */
export async function deleteProcessingEpisode(episodeId: number): Promise<ActionResult> {
  const user = await requireUser()
  await db.delete(episode).where(and(eq(episode.id, episodeId), eq(episode.hostUserId, user.id)))
  revalidatePath("/live")
  revalidatePath(`/u/${user.id}`)
  return { ok: true }
}

/**
 * Server-side watchdog: flips any of the current user's "processing" episodes
 * that started more than STALL_MS ago to "failed", so a crashed/closed uploader
 * can never leave a row stuck in "Processing…" forever. Called opportunistically
 * whenever the host's catalogue is read. Scoped to hostUserId.
 */
export async function reconcileStalledProcessing(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - STALL_MS)
  await db
    .update(episode)
    .set({ processingStatus: "failed", processingError: "Processing timed out" })
    .where(
      and(
        eq(episode.hostUserId, userId),
        eq(episode.processingStatus, "processing"),
        lt(episode.processingStartedAt, cutoff),
      ),
    )
}

type ActionResult = { ok: true } | { ok: false; error: string }
