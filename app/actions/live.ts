"use server"

import { and, asc, desc, eq, gt, isNull, lt } from "drizzle-orm"
import { cookies, headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { isActiveHomeMember, canViewerGoLive, HOME_GO_LIVE_COOKIE } from "@/lib/home/access"
import { getActiveHomeContext } from "@/lib/home/active-home"
import { createGuestSession, getGuestSession } from "@/lib/guest-session"
import {
  liveStream,
  liveChatMessage,
  liveCallRequest,
  liveReaction,
  livePresence,
  liveBlocked,
  episode,
  user as userTable,
} from "@/lib/db/schema"
import { getHandle, getAvatarColor, getInitials } from "@/lib/identity"
import { LIVE_CATEGORIES, CONVERSATION_CATEGORIES } from "@/lib/live-categories"
import {
  createAccessToken,
  isLiveKitConfigured,
  LIVEKIT_URL,
  setParticipantPublish,
  removeParticipant,
  muteParticipantAudio,
} from "@/lib/livekit"
import { isEgressConfigured, startRoomVideoEgress, stopRoomEgress, replayObjectKey } from "@/lib/livekit-egress"
import { deleteReplayObject } from "@/lib/storage"
import { createProcessingEpisode, deleteProcessingEpisode } from "@/app/actions/live-processing"
import { notifyFollowers, notifyUser, notifyHomeLive } from "@/app/actions/notifications"

// Host + up to 11 guests = 12 on stage.
const MAX_GUESTS = 11

// A live stream whose host hasn't sent a heartbeat in this long is considered
// abandoned (closed tab, lost connection, killed app) and is auto-ended. The
// host pings every ~20s, so this tolerates a couple of missed beats + reconnect.
const STALE_AFTER_MS = 60_000

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("You must be signed in to do that.")
  return session.user
}

/**
 * Who is acting in a live room right now: either a signed-in Better Auth user,
 * or a display-name-only guest (for PUBLIC lives), or nobody. Guests carry a
 * `guest:<id>` identity so they slot into the FK-free live tables and LiveKit
 * exactly like a real user, while `isGuest` lets callers keep them out of
 * private lives and anything outside the Live itself.
 */
export type LiveActor = {
  id: string
  name: string
  image: string | null
  isGuest: boolean
}

async function getLiveActor(): Promise<LiveActor | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) {
    return { id: session.user.id, name: session.user.name, image: session.user.image ?? null, isGuest: false }
  }
  const guest = await getGuestSession()
  if (guest) return { id: `guest:${guest.id}`, name: guest.name, image: null, isGuest: true }
  return null
}

/**
 * Public-live join: records a display-name-only guest session (a signed cookie,
 * never a real login) so the visitor can enter a PUBLIC Live without an account.
 * The visibility check happens in `joinBroadcast`; this only captures the name.
 */
export async function joinLiveAsGuest(input: { name: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    await createGuestSession(input.name)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Please enter a display name." }
  }
}

/**
 * Resolves the current actor for an IN-ROOM action (chat, reaction, presence,
 * raise-hand) and enforces the same access rule as joinBroadcast: guests are
 * allowed only in PUBLIC rooms. Returns null when there's no actor at all, or
 * when a guest targets a non-public room — callers treat null as "not allowed"
 * and no-op, so guest identities can never act on a private live.
 */
async function getRoomActor(roomName: string): Promise<LiveActor | null> {
  const actor = await getLiveActor()
  if (!actor) return null
  if (actor.isGuest) {
    const [stream] = await db
      .select({ visibility: liveStream.visibility })
      .from(liveStream)
      .where(eq(liveStream.roomName, roomName))
      .limit(1)
    if (!stream || stream.visibility !== "public") return null
  }
  return actor
}

/**
 * Marks any "live" streams with a stale heartbeat as ended. Cheap single UPDATE
 * run at the top of every read path so abandoned streams never linger as live
 * (which is what previously stranded a dropped host and orphaned the row).
 */
/**
 * Stops the LiveKit Egress recording (if any) for a room and clears the id so it
 * isn't stopped twice. Best-effort: the egress-ended webhook finalizes the
 * replay regardless of how the egress stopped, so a failure here is harmless.
 */
async function stopEgressForRoom(roomName: string): Promise<void> {
  try {
    const [row] = await db
      .select({ egressId: liveStream.egressId })
      .from(liveStream)
      .where(eq(liveStream.roomName, roomName))
      .limit(1)
    if (row?.egressId) {
      await stopRoomEgress(row.egressId)
      await db.update(liveStream).set({ egressId: null }).where(eq(liveStream.roomName, roomName))
    }
  } catch {
    /* best-effort — webhook still finalizes the replay */
  }
}

async function endStaleStreams(): Promise<void> {
  // Best-effort cleanup that runs at the top of read paths — swallow errors so a
  // transient DB failure (or the DB being unreachable) can't crash the page that
  // just wanted to list streams. The next read will retry the cleanup.
  try {
    // Stop egress for any abandoned VIDEO host (closed tab / lost connection)
    // before ending the rows, so the replay finalizes promptly rather than
    // waiting on LiveKit's room-empty timeout. This is exactly the case that
    // used to truncate device-side recordings.
    const stale = await db
      .select({ roomName: liveStream.roomName, egressId: liveStream.egressId })
      .from(liveStream)
      .where(and(eq(liveStream.status, "live"), lt(liveStream.lastSeenAt, new Date(Date.now() - STALE_AFTER_MS))))
    for (const s of stale) {
      if (s.egressId) await stopRoomEgress(s.egressId)
    }
    await db
      .update(liveStream)
      .set({ status: "ended", endedAt: new Date(), egressId: null })
      .where(and(eq(liveStream.status, "live"), lt(liveStream.lastSeenAt, new Date(Date.now() - STALE_AFTER_MS))))
  } catch (err) {
    console.error("[v0] endStaleStreams cleanup failed:", err)
  }
}

/**
 * Host heartbeat — keeps the host's live stream marked active. Returns
 * `ended:true` if the stream is no longer live (e.g. it was already cleaned up
 * or ended elsewhere), which tells the client to stop and finalize.
 */
export async function heartbeatBroadcast(input: { roomName: string }): Promise<{ ok: boolean; ended: boolean }> {
  const user = await requireUser()
  const rows = await db
    .update(liveStream)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(liveStream.roomName, input.roomName), eq(liveStream.hostId, user.id), eq(liveStream.status, "live")))
    .returning({ id: liveStream.id })
  return { ok: true, ended: rows.length === 0 }
}

export type LiveMode = "audio" | "video"
export type LiveVisibility = "public" | "private"
// Video layout the host broadcasts in. Only meaningful when mode === "video".
export type LiveOrientation = "portrait" | "landscape"
// Audio-Live layout. "podcast" = original broadcast studio; "conversation" =
// community room where every participant can speak. Only meaningful for audio.
export type LiveLayout = "podcast" | "conversation"

export type LiveStreamView = {
  id: number
  roomName: string
  hostId: string
  hostName: string
  hostHandle: string
  title: string
  category: string | null
  cover: string | null
  mode: LiveMode
  orientation: LiveOrientation
  layout: LiveLayout
  topic?: string | null
  gridPinnedId?: string | null
  visibility: LiveVisibility
  locked?: boolean
  pinnedChatId?: number | null
  chatBgUrl?: string | null
  chatBgEffect?: ChatBgEffect
  theme?: string
  startedAt: string
}

export type GoLiveResult =
  | {
      ok: true
      token: string
      serverUrl: string
      roomName: string
      // True when the replay is being recorded SERVER-SIDE by LiveKit Egress.
      // The client then skips its own MediaRecorder capture (and the replay
      // enqueue) so we never produce a duplicate or the old truncated recording.
      recordOnServer?: boolean
    }
  | { ok: false; error: string }

export type JoinResult =
  | { ok: true; token: string; serverUrl: string; roomName: string; canPublish: boolean; recordOnServer?: boolean }
  // `needsIdentity`: public live, but the visitor hasn't given a display name yet
  //   → show the "Join Live" display-name gate.
  // `needsAuth`: private live and the visitor isn't a member → they must sign up
  //   and join the Home before they can enter.
  | { ok: false; error: string; needsIdentity?: boolean; needsAuth?: boolean }

/** Host starts broadcasting: creates the stream row, mints a publisher token, notifies followers. */
export async function startBroadcast(input: {
  title: string
  category?: string
  cover?: string | null
  mode?: LiveMode
  orientation?: LiveOrientation
  layout?: LiveLayout
  topic?: string | null
  visibility?: LiveVisibility
}): Promise<GoLiveResult> {
  const user = await requireUser()
  // Only platform admins/staff and organisation owners/admins (anyone with the
  // Home `live.manage` permission) may start a live session. This is the real
  // security boundary — the UI hides the go-live actions from members, but this
  // server-side gate is what actually prevents a crafted request from opening a
  // room.
  if (!(await canViewerGoLive())) {
    return { ok: false, error: "Only admins and organisation owners can start live sessions." }
  }
  if (!isLiveKitConfigured()) {
    return { ok: false, error: "Live is not configured yet. Add your LiveKit credentials to start broadcasting." }
  }
  const mode: LiveMode = input.mode === "video" ? "video" : "audio"
  // Conversation layout only applies to audio rooms; video/podcast stays "podcast".
  const layout: LiveLayout = mode === "audio" && input.layout === "conversation" ? "conversation" : "podcast"
  // A category is mandatory for every live session — "Uncategorised" is not an
  // option. Conversation rooms use their own gathering-style category list;
  // everything else uses the standard live categories.
  const category = input.category?.trim()
  const allowedCategories: readonly string[] =
    layout === "conversation" ? CONVERSATION_CATEGORIES : LIVE_CATEGORIES
  if (!category || !allowedCategories.includes(category)) {
    return { ok: false, error: "Please choose a category before going live." }
  }
  // Cover artwork is required for audio live sessions (there's no video feed to
  // represent the room, so the cover is what listeners see).
  if (mode === "audio" && !input.cover) {
    return { ok: false, error: "Cover artwork is required for audio live sessions." }
  }
  // Orientation only applies to video; audio is always stored as "portrait".
  const orientation: LiveOrientation = mode === "video" && input.orientation === "landscape" ? "landscape" : "portrait"
  const visibility: LiveVisibility = input.visibility === "private" ? "private" : "public"

  const title = input.title.trim() || `${user.name} — live`
  // Deterministic, unique room name per host session.
  const roomName = `live_${user.id}_${Date.now()}`

  // ── Home scoping ──────────────────────────────────────────────────────────
  // If this go-live was started from inside a private Home, the entry action
  // dropped a cookie carrying the Home's id. Consume it once here: verify the
  // host is (still) an active member, stamp the session with the Home, and clear
  // the cookie so it can't bleed onto a later, unrelated broadcast. A Home
  // session is unlisted in Universal discovery and gated to Home members.
  let homeId: string | null = null
  const jar = await cookies()
  const pendingHomeId = jar.get(HOME_GO_LIVE_COOKIE)?.value
  if (pendingHomeId) {
    if (await isActiveHomeMember(pendingHomeId, user.id)) homeId = pendingHomeId
    jar.delete(HOME_GO_LIVE_COOKIE)
  }
  // Fallback: no explicit Home-go-live cookie was set, so scope the session to
  // the Home the host is currently active in (the `freq_active_home` selection).
  // Frequency is Home-centric — a host with any Home is always "inside" one — so
  // this is what makes a live (and its saved replay) belong to that Home and
  // appear only in that organisation's Catalogue. A host with no Homes stays
  // null → a Universal session shown in global discovery.
  if (!homeId) {
    homeId = (await getActiveHomeContext()).home?.id ?? null
  }

  // End any stale streams this host may have left open.
  await db
    .update(liveStream)
    .set({ status: "ended", endedAt: new Date() })
    .where(and(eq(liveStream.hostId, user.id), eq(liveStream.status, "live")))

  // Open the room on the host's remembered backdrop (their last-used theme /
  // uploaded image) so listeners see it from the first second, without the host
  // re-picking it. Falls back to the schema default for a first-time host.
  const [hostPref] = await db
    .select({ preferredLiveTheme: userTable.preferredLiveTheme })
    .from(userTable)
    .where(eq(userTable.id, user.id))
    .limit(1)

  await db.insert(liveStream).values({
    roomName,
    hostId: user.id,
    hostName: user.name,
    hostHandle: getHandle(user.name),
    title,
    category,
    cover: input.cover ?? null,
    mode,
    orientation,
    layout,
    ...(hostPref?.preferredLiveTheme ? { theme: hostPref.preferredLiveTheme } : {}),
    // Optional room topic. Applies to audio live sessions (podcast &
    // conversation) and to Conversation (landscape) video gatherings, where it
    // is shown as "Today's Discussion" in the room header.
    topic: input.topic?.trim() || null,
    visibility,
    homeId,
    status: "live",
  })

  // ── Server-side replay recording (VIDEO only) ────────────────────────────
  // The replay is recorded on LiveKit's servers via Egress, not the host's
  // device. Egress is deliberately NOT started here: at this point the host's
  // browser hasn't connected to the room yet, so compositing would record an
  // EMPTY room — a black lead-in, or (worse) a failed/short recording that
  // stranded the replay at 0:00. Instead the host's client calls
  // beginRoomRecording() once it is actually connected and publishing video,
  // and that starts egress against a room that already has the host's camera.
  // Here we only advertise whether the server WILL record, so the client knows
  // to skip its own (legacy, unreliable) MediaRecorder capture.
  const recordOnServer = mode === "video" && isEgressConfigured()

  const token = await createAccessToken({
    roomName,
    identity: user.id,
    name: user.name,
    canPublish: true,
    metadata: JSON.stringify({ image: user.image ?? null }),
  })

  if (homeId) {
    // A private Home session must NOT leak to Universal followers (its room is
    // member-gated). Instead, tell this Home's members — inside the Home inbox.
    await notifyHomeLive({ homeId, actorId: user.id, actorName: user.name, title, roomName })
  } else {
    // Public session: let the host's followers know they're on air.
    await notifyFollowers({
      actorId: user.id,
      actorName: user.name,
      type: "live",
      message: title,
      link: `/live/${roomName}`,
    })
  }

  revalidatePath("/live")
  return { ok: true, token, serverUrl: LIVEKIT_URL, roomName, recordOnServer }
}

/**
 * Starts the server-side replay recording for a live VIDEO room. Called by the
 * HOST'S CLIENT once it is connected and actually publishing — NOT from
 * startBroadcast, because at go-live time the host's browser hasn't joined the
 * room yet and egress would composite an empty room (the 0:00 / black-frame
 * replay bug). Starting it here guarantees LiveKit records a room that already
 * has the host's camera, so the replay spans the full session from frame one.
 *
 * Creates the placeholder catalogue episode and hands its id to the egress
 * (encoded in the object key) so the egress-ended webhook can finalize it.
 * Idempotent and host-scoped: a no-op if a recording is already running for the
 * room (e.g. the host reconnects, or the effect fires twice). Any failure is
 * swallowed — a missing recording is far better than blocking the live session.
 */
export async function beginRoomRecording(input: { roomName: string }): Promise<{ recording: boolean }> {
  let user
  try {
    user = await requireUser()
  } catch {
    return { recording: false }
  }
  if (!isEgressConfigured()) return { recording: false }

  const [row] = await db
    .select({
      mode: liveStream.mode,
      orientation: liveStream.orientation,
      title: liveStream.title,
      category: liveStream.category,
      cover: liveStream.cover,
      egressId: liveStream.egressId,
      replayEpisodeId: liveStream.replayEpisodeId,
      homeId: liveStream.homeId,
    })
    .from(liveStream)
    .where(and(eq(liveStream.roomName, input.roomName), eq(liveStream.hostId, user.id), eq(liveStream.status, "live")))
    .limit(1)

  // Only the live video host records; ignore audio rooms and non-hosts.
  if (!row || row.mode !== "video") return { recording: false }
  // Already recording (or resumed session) → nothing to do. This is what makes
  // the action safe to call more than once from the client.
  if (row.egressId || row.replayEpisodeId) return { recording: true }

  const orientation: LiveOrientation = row.orientation === "landscape" ? "landscape" : "portrait"

  let placeholderId: number | null = null
  try {
    const created = await createProcessingEpisode({
      title: row.title,
      category: row.category ?? "",
      duration: "",
      cover: row.cover ?? null,
      mediaKind: "video",
      // Scope the replay to the exact Home this session was started in.
      homeId: row.homeId ?? null,
    })
    if (!created.ok) return { recording: false }
    placeholderId = created.episodeId
    const { egressId } = await startRoomVideoEgress({
      roomName: input.roomName,
      episodeId: created.episodeId,
      orientation,
    })
    await db
      .update(liveStream)
      .set({ egressId, replayEpisodeId: created.episodeId })
      .where(eq(liveStream.roomName, input.roomName))
    return { recording: true }
  } catch (err) {
    console.log("[v0] beginRoomRecording failed:", (err as Error)?.message)
    // Roll back the placeholder so it doesn't linger as a stuck "processing" row.
    if (placeholderId != null) {
      try {
        await deleteProcessingEpisode(placeholderId)
      } catch {
        /* best-effort cleanup */
      }
    }
    return { recording: false }
  }
}

/** Host stops broadcasting. */
export async function endBroadcast(input: { roomName: string }): Promise<void> {
  const user = await requireUser()
  // The host can always end. In a grid meeting the co-host has full parity and
  // may end the live for everyone too.
  const { isController } = await getGridControl(input.roomName, user.id)
  if (!isController) return
  // Stop the server-side recording first so the replay finalizes promptly.
  await stopEgressForRoom(input.roomName)
  await db
    .update(liveStream)
    .set({ status: "ended", endedAt: new Date() })
    .where(eq(liveStream.roomName, input.roomName))
  revalidatePath("/live")
}

/**
 * Host chose NOT to keep the just-ended session, and it was recorded server-side
 * by egress. Deletes the placeholder replay episode (and best-effort removes the
 * stored object) so a discarded session doesn't linger in the catalogue. Scoped
 * to the host. Safe no-op if there's no server recording for the room.
 */
export async function discardRoomReplay(input: { roomName: string }): Promise<void> {
  const user = await requireUser()
  const [row] = await db
    .select({ hostId: liveStream.hostId, replayEpisodeId: liveStream.replayEpisodeId })
    .from(liveStream)
    .where(eq(liveStream.roomName, input.roomName))
    .limit(1)
  if (!row || row.hostId !== user.id || !row.replayEpisodeId) return
  // Best-effort: delete the stored MP4 (may not exist yet if egress is still
  // finalizing — the webhook will then find no episode and skip finalizing).
  try {
    await deleteReplayObject(replayObjectKey(row.replayEpisodeId, input.roomName))
  } catch {
    /* best-effort */
  }
  await db.delete(episode).where(and(eq(episode.id, row.replayEpisodeId), eq(episode.hostUserId, user.id)))
  await db.update(liveStream).set({ replayEpisodeId: null }).where(eq(liveStream.roomName, input.roomName))
  revalidatePath("/live")
  revalidatePath(`/u/${user.id}`)
}

/** A listener (or the host returning) joins an existing live room. */
export async function joinBroadcast(input: { roomName: string }): Promise<JoinResult> {
  if (!isLiveKitConfigured()) {
    return { ok: false, error: "Live audio is not configured yet." }
  }

  // Clean up abandoned streams before deciding whether this room is still live.
  await endStaleStreams()

  const [stream] = await db
    .select()
    .from(liveStream)
    .where(and(eq(liveStream.roomName, input.roomName), eq(liveStream.status, "live")))

  if (!stream) return { ok: false, error: "This stream has ended." }

  const isPublic = stream.visibility === "public"

  // Who is joining: a signed-in member, a display-name-only guest, or nobody yet.
  // A PUBLIC live grants access to the Live only — never the organisation's Home
  // — so a guest with just a display name can enter. A PRIVATE live is restricted
  // to members, so anyone without a member session is turned away to sign up.
  const actor = await getLiveActor()

  if (!actor) {
    return isPublic
      ? { ok: false, error: "Enter a display name to join.", needsIdentity: true }
      : { ok: false, error: "This live is private. Sign in as a member to join.", needsAuth: true }
  }

  const isHost = !actor.isGuest && stream.hostId === actor.id

  // Guests may ONLY join public lives. A private (or member-only Home) live sends
  // them to sign up and join the organisation first.
  if (actor.isGuest && !isPublic) {
    return {
      ok: false,
      error: "This live is private. Sign up and join the community to enter.",
      needsAuth: true,
    }
  }

  // Home privacy gate for members: a PRIVATE Home-scoped session can only be
  // joined by an active member of that Home — even with a direct link. Public
  // Home lives stay open (the entry half of the isolation boundary; discovery
  // hides private ones from Universal). Guests never reach here on a private
  // live — they were turned away above.
  if (!isPublic && stream.homeId && !isHost && !actor.isGuest) {
    const allowed = await isActiveHomeMember(stream.homeId, actor.id)
    if (!allowed) {
      return { ok: false, error: "This session is private to its community.", needsAuth: true }
    }
  }

  // Blocked users can't (re)join. The host is never blockable, so this only
  // affects listeners/guests the host removed.
  if (!isHost) {
    const [blocked] = await db
      .select({ id: liveBlocked.id })
      .from(liveBlocked)
      .where(and(eq(liveBlocked.roomName, input.roomName), eq(liveBlocked.userId, actor.id)))
      .limit(1)
    if (blocked) return { ok: false, error: "You can no longer join this live." }
  }

  // A host rejoining (e.g. recovering from a dropped connection) refreshes the
  // heartbeat right away so the in-flight reconnect isn't swept as stale.
  if (isHost) {
    await db
      .update(liveStream)
      .set({ lastSeenAt: new Date() })
      .where(eq(liveStream.roomName, input.roomName))
  }
  // Grid video streams are Meet/Zoom-style meetings: every participant gets a
  // tile and publishes their own camera + mic. Everyone else (audio rooms, or
  // Focused/portrait video) keeps the broadcast model where only the host (and
  // invited guests) may publish.
  const isGridMeeting = stream.mode === "video" && (stream.orientation ?? "portrait") === "landscape"
  // Conversation audio rooms let every participant speak — they get a publish
  // token on join (the client starts them muted; they tap Unmute to speak).
  const isConversation = stream.mode === "audio" && (stream.layout ?? "podcast") === "conversation"
  const canPublish = isHost || isGridMeeting || isConversation

  const token = await createAccessToken({
    roomName: input.roomName,
    identity: actor.id,
    name: actor.name,
    canPublish,
    metadata: JSON.stringify({ image: actor.image ?? null, isGuest: actor.isGuest }),
  })

  // A host resuming their own video broadcast keeps the server-side recording
  // path: if egress is already running it just continues; if it hasn't started
  // yet (recording begins lazily once the host is publishing), the client will
  // call beginRoomRecording — which is idempotent. Either way the client must
  // skip its own MediaRecorder, so advertise the server path whenever egress is
  // configured for this video room.
  const recordOnServer = isHost && stream.mode === "video" && isEgressConfigured()

  return { ok: true, token, serverUrl: LIVEKIT_URL, roomName: input.roomName, canPublish, recordOnServer }
}

/** All currently-live streams, newest first. */
export async function getLiveStreams(): Promise<LiveStreamView[]> {
  await endStaleStreams()
  const rows = await db
    .select()
    .from(liveStream)
    // Only public streams are listed in discovery; private streams stay unlisted.
    // Home-scoped sessions (homeId set) are never shown in Universal discovery —
    // they live only inside their organisation's private Home.
    .where(
      and(eq(liveStream.status, "live"), eq(liveStream.visibility, "public"), isNull(liveStream.homeId)),
    )
    .orderBy(desc(liveStream.startedAt))

  return rows.map((r) => ({
    id: r.id,
    roomName: r.roomName,
    hostId: r.hostId,
    hostName: r.hostName,
    hostHandle: r.hostHandle,
    title: r.title,
    category: r.category,
    cover: r.cover,
    mode: (r.mode as LiveMode) ?? "audio",
    orientation: (r.orientation as LiveOrientation) ?? "portrait",
    layout: (r.layout as LiveLayout) ?? "podcast",
    topic: r.topic ?? null,
    gridPinnedId: r.gridPinnedId ?? null,
    visibility: (r.visibility as LiveVisibility) ?? "public",
    startedAt: r.startedAt.toISOString(),
  }))
}

export type LiveChatMessageView = {
  id: number
  userId: string
  userName: string
  userImage: string | null
  isHost: boolean
  kind: "message" | "system"
  body: string
}

/** Posts a chat message to a live room. */
export async function sendLiveChat(input: { roomName: string; body: string }): Promise<void> {
  const actor = await getRoomActor(input.roomName)
  if (!actor) return
  const body = input.body.trim()
  if (!body) return

  const [stream] = await db
    .select({ hostId: liveStream.hostId })
    .from(liveStream)
    .where(eq(liveStream.roomName, input.roomName))

  await db.insert(liveChatMessage).values({
    roomName: input.roomName,
    userId: actor.id,
    userName: actor.name,
    userImage: actor.image ?? null,
    isHost: !actor.isGuest && stream?.hostId === actor.id,
    kind: "message",
    body,
  })
}

/** Fetches chat messages for a room, optionally only those after `afterId` (for polling). */
export async function getLiveChat(input: { roomName: string; afterId?: number }): Promise<LiveChatMessageView[]> {
  const rows = await db
    .select()
    .from(liveChatMessage)
    .where(
      input.afterId
        ? and(eq(liveChatMessage.roomName, input.roomName), gt(liveChatMessage.id, input.afterId))
        : eq(liveChatMessage.roomName, input.roomName),
    )
    .orderBy(asc(liveChatMessage.id))
    .limit(100)

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    userImage: r.userImage ?? null,
    isHost: r.isHost,
    kind: (r.kind as "message" | "system") ?? "message",
    body: r.body,
  }))
}

// --- Live presence (audience count + names, "entered the room" notices) -----

export type LiveAudienceMember = {
  userId: string
  userName: string
  userImage: string | null
  isHost: boolean
}

// Presence rows older than this are treated as "left the room".
const PRESENCE_STALE_MS = 30_000

/**
 * Heartbeat for anyone in a live room (host + listeners). Upserts the caller's
 * presence row; the very first time a listener appears it also posts a
 * "<name> entered the room" system message (nothing is posted when they leave).
 * Returns the current fresh audience so the caller can render count + names.
 */
export async function heartbeatPresence(input: {
  roomName: string
}): Promise<{ count: number; members: LiveAudienceMember[] }> {
  const actor = await getRoomActor(input.roomName)
  if (!actor) return { count: 0, members: [] }

  const [stream] = await db
    .select({ hostId: liveStream.hostId })
    .from(liveStream)
    .where(eq(liveStream.roomName, input.roomName))
  const isHost = !actor.isGuest && stream?.hostId === actor.id

  // Has this user been (recently) present already? Decides whether to announce.
  const [existing] = await db
    .select({ id: livePresence.id, lastSeenAt: livePresence.lastSeenAt })
    .from(livePresence)
    .where(and(eq(livePresence.roomName, input.roomName), eq(livePresence.userId, actor.id)))

  const now = new Date()
  const isNewArrival =
    !existing || now.getTime() - new Date(existing.lastSeenAt).getTime() > PRESENCE_STALE_MS

  if (existing) {
    await db
      .update(livePresence)
      .set({ lastSeenAt: now, userName: actor.name, userImage: actor.image ?? null, isHost })
      .where(eq(livePresence.id, existing.id))
  } else {
    await db.insert(livePresence).values({
      roomName: input.roomName,
      userId: actor.id,
      userName: actor.name,
      userImage: actor.image ?? null,
      isHost,
    })
  }

  // Announce arrivals for listeners only (the host's presence isn't announced).
  if (isNewArrival && !isHost) {
    await db.insert(liveChatMessage).values({
      roomName: input.roomName,
      userId: actor.id,
      userName: actor.name,
      userImage: actor.image ?? null,
      isHost: false,
      kind: "system",
      body: `${actor.name} entered the room`,
    })
  }

  return getAudience({ roomName: input.roomName })
}

/** Current fresh audience for a room (everyone whose heartbeat is recent). */
export async function getAudience(input: {
  roomName: string
}): Promise<{ count: number; members: LiveAudienceMember[] }> {
  const rows = await db
    .select()
    .from(livePresence)
    .where(
      and(
        eq(livePresence.roomName, input.roomName),
        gt(livePresence.lastSeenAt, new Date(Date.now() - PRESENCE_STALE_MS)),
      ),
    )
    .orderBy(desc(livePresence.isHost), asc(livePresence.createdAt))

  const members: LiveAudienceMember[] = rows.map((r) => ({
    userId: r.userId,
    userName: r.userName,
    userImage: r.userImage ?? null,
    isHost: r.isHost,
  }))
  // Audience count excludes the host (it's the listener count).
  const count = members.filter((m) => !m.isHost).length
  return { count, members }
}

/** Removes the caller's presence row when they intentionally leave a room. */
export async function leavePresence(input: { roomName: string }): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() })
  const u = session?.user
  if (!u) return
  await db
    .delete(livePresence)
    .where(and(eq(livePresence.roomName, input.roomName), eq(livePresence.userId, u.id)))
}

// --- Reactions & virtual gifts ---------------------------------------------

export type LiveReactionView = {
  id: number
  userId: string
  userName: string
  kind: "reaction" | "gift"
  emoji: string
  label: string | null
}

/** Sends a reaction or virtual gift that every participant will see float up. */
export async function sendLiveReaction(input: {
  roomName: string
  emoji: string
  kind?: "reaction" | "gift"
  label?: string
}): Promise<void> {
  const actor = await getRoomActor(input.roomName)
  if (!actor) return
  const emoji = input.emoji.trim().slice(0, 8)
  if (!emoji) return
  await db.insert(liveReaction).values({
    roomName: input.roomName,
    userId: actor.id,
    userName: actor.name,
    kind: input.kind ?? "reaction",
    emoji,
    label: input.label?.trim().slice(0, 40) ?? null,
  })
}

/** Polls recent reactions for a room (only those after `afterId`). */
export async function getLiveReactions(input: {
  roomName: string
  afterId?: number
}): Promise<LiveReactionView[]> {
  const rows = await db
    .select()
    .from(liveReaction)
    .where(
      input.afterId
        ? and(eq(liveReaction.roomName, input.roomName), gt(liveReaction.id, input.afterId))
        : eq(liveReaction.roomName, input.roomName),
    )
    .orderBy(asc(liveReaction.id))
    .limit(60)

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    kind: r.kind as "reaction" | "gift",
    emoji: r.emoji,
    label: r.label,
  }))
}

/**
 * The current user's own still-live audio stream, if any. Used so the host can
 * resume broadcasting (rather than starting a duplicate or being shown the
 * offline setup) when they reopen the studio after signing back in.
 */
export async function getMyActiveStream(): Promise<LiveStreamView | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  await endStaleStreams()
  const [r] = await db
    .select()
    .from(liveStream)
    .where(and(eq(liveStream.hostId, session.user.id), eq(liveStream.status, "live")))
    .orderBy(desc(liveStream.startedAt))
  if (!r || (r.mode ?? "audio") !== "audio") return null
  return {
    id: r.id,
    roomName: r.roomName,
    hostId: r.hostId,
    hostName: r.hostName,
    hostHandle: r.hostHandle,
    title: r.title,
    category: r.category,
    cover: r.cover,
    mode: (r.mode as LiveMode) ?? "audio",
    orientation: (r.orientation as LiveOrientation) ?? "portrait",
    layout: (r.layout as LiveLayout) ?? "podcast",
    topic: r.topic ?? null,
    gridPinnedId: r.gridPinnedId ?? null,
    visibility: (r.visibility as LiveVisibility) ?? "public",
    locked: r.locked ?? false,
    pinnedChatId: r.pinnedChatId ?? null,
    chatBgUrl: r.chatBgUrl,
    chatBgEffect: (r.chatBgEffect as ChatBgEffect) ?? "none",
    theme: r.theme ?? "default",
    startedAt: r.startedAt.toISOString(),
  }
}

/**
 * The current user's own still-live *video* stream, if any. Lets the host
 * resume their broadcast (rather than starting a duplicate) when they reopen
 * the studio after minimising or signing back in.
 */
export async function getMyActiveVideoStream(): Promise<LiveStreamView | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  await endStaleStreams()
  const [r] = await db
    .select()
    .from(liveStream)
    .where(and(eq(liveStream.hostId, session.user.id), eq(liveStream.status, "live")))
    .orderBy(desc(liveStream.startedAt))
  if (!r || (r.mode ?? "audio") !== "video") return null
  return {
    id: r.id,
    roomName: r.roomName,
    hostId: r.hostId,
    hostName: r.hostName,
    hostHandle: r.hostHandle,
    title: r.title,
    category: r.category,
    cover: r.cover,
    mode: (r.mode as LiveMode) ?? "video",
    orientation: (r.orientation as LiveOrientation) ?? "portrait",
    layout: (r.layout as LiveLayout) ?? "podcast",
    topic: r.topic ?? null,
    gridPinnedId: r.gridPinnedId ?? null,
    visibility: (r.visibility as LiveVisibility) ?? "public",
    locked: r.locked ?? false,
    pinnedChatId: r.pinnedChatId ?? null,
    chatBgUrl: r.chatBgUrl,
    chatBgEffect: (r.chatBgEffect as ChatBgEffect) ?? "none",
    theme: r.theme ?? "default",
    startedAt: r.startedAt.toISOString(),
  }
}

/** A single live stream by room name. */
export async function getLiveStream(roomName: string): Promise<LiveStreamView | null> {
  await endStaleStreams()
  const [r] = await db
    .select()
    .from(liveStream)
    .where(and(eq(liveStream.roomName, roomName), eq(liveStream.status, "live")))
  if (!r) return null
  return {
    id: r.id,
    roomName: r.roomName,
    hostId: r.hostId,
    hostName: r.hostName,
    hostHandle: r.hostHandle,
    title: r.title,
    category: r.category,
    cover: r.cover,
    mode: (r.mode as LiveMode) ?? "audio",
    orientation: (r.orientation as LiveOrientation) ?? "portrait",
    layout: (r.layout as LiveLayout) ?? "podcast",
    topic: r.topic ?? null,
    gridPinnedId: r.gridPinnedId ?? null,
    visibility: (r.visibility as LiveVisibility) ?? "public",
    locked: r.locked ?? false,
    pinnedChatId: r.pinnedChatId ?? null,
    chatBgUrl: r.chatBgUrl,
    chatBgEffect: (r.chatBgEffect as ChatBgEffect) ?? "none",
    theme: r.theme ?? "default",
    startedAt: r.startedAt.toISOString(),
  }
}

// --- Guest call-in system --------------------------------------------------

export type LiveRole = "host" | "cohost" | "guest"

export type CoHostPermissions = {
  acceptRequests: boolean
  controlTracks: boolean
  endSession: boolean
}

export type CallRequestView = {
  id: number
  userId: string
  userName: string
  initials: string
  color: string
  kind: "request" | "invite"
  // "left" = a co-host who stepped off the call but is still granted co-host
  // status (can call back in); distinct from "ended" (gone from the room).
  status: "pending" | "accepted" | "declined" | "ended" | "left"
  // "guest" = ordinary speaker on stage; "cohost" = promoted by the main host.
  role: "guest" | "cohost"
  // Co-host permissions (meaningful only while role === "cohost").
  permissions: CoHostPermissions
  // Music approval flow state for a track-controlling co-host.
  musicApproved: boolean
  musicRequestPending: boolean
}

export type BlockedUserView = {
  userId: string
  userName: string
  initials: string
  color: string
}

async function getHostId(roomName: string): Promise<string | null> {
  const [s] = await db.select({ hostId: liveStream.hostId }).from(liveStream).where(eq(liveStream.roomName, roomName))
  return s?.hostId ?? null
}

/**
 * A "grid controller" is the host OR the grid meeting's co-host. The co-host
 * mirrors every host power in a video grid meeting (mute, pin, promote, end),
 * so moderation actions accept either. Returns the resolved host id too so
 * callers can reason about who the host is.
 */
async function getGridControl(
  roomName: string,
  userId: string,
): Promise<{ hostId: string | null; cohostId: string | null; isController: boolean }> {
  const [s] = await db
    .select({ hostId: liveStream.hostId, gridCohostId: liveStream.gridCohostId })
    .from(liveStream)
    .where(eq(liveStream.roomName, roomName))
  const hostId = s?.hostId ?? null
  const cohostId = s?.gridCohostId ?? null
  return { hostId, cohostId, isController: userId === hostId || userId === cohostId }
}

function mapRequest(r: typeof liveCallRequest.$inferSelect): CallRequestView {
  return {
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    initials: getInitials(r.userName),
    color: getAvatarColor(r.userId),
    kind: r.kind as "request" | "invite",
    status: r.status as CallRequestView["status"],
    role: (r.role as "guest" | "cohost") ?? "guest",
    permissions: {
      acceptRequests: r.canAcceptRequests ?? false,
      controlTracks: r.canControlTracks ?? false,
      endSession: r.canEndSession ?? false,
    },
    musicApproved: r.musicApproved ?? false,
    musicRequestPending: r.musicRequestPending ?? false,
  }
}

/** True if the user may accept call requests: the main host, or a co-host
 *  who has been granted the "Accept Call Requests" permission. A co-host keeps
 *  this power even while off the call (status "left"). */
async function canManageRequests(roomName: string, userId: string): Promise<boolean> {
  if ((await getHostId(roomName)) === userId) return true
  const [row] = await db
    .select({ role: liveCallRequest.role, can: liveCallRequest.canAcceptRequests, status: liveCallRequest.status })
    .from(liveCallRequest)
    .where(and(eq(liveCallRequest.roomName, roomName), eq(liveCallRequest.userId, userId)))
    .orderBy(desc(liveCallRequest.updatedAt))
  return (row?.status === "accepted" || row?.status === "left") && row.role === "cohost" && !!row.can
}

/** Latest co-host-granted row for a user, regardless of status. The grant
 *  lives on the row, so it survives stepping off the call (status "left") or
 *  leaving the room (status "ended") — letting the host still manage them. */
async function getCoHostRow(roomName: string, userId: string) {
  const [row] = await db
    .select()
    .from(liveCallRequest)
    .where(
      and(
        eq(liveCallRequest.roomName, roomName),
        eq(liveCallRequest.userId, userId),
        eq(liveCallRequest.role, "cohost"),
      ),
    )
    .orderBy(desc(liveCallRequest.updatedAt))
  return row ?? null
}

/** Count of guests currently allowed live (accepted requests/invites). */
async function acceptedGuestCount(roomName: string): Promise<number> {
  const rows = await db
    .select({ id: liveCallRequest.id })
    .from(liveCallRequest)
    .where(and(eq(liveCallRequest.roomName, roomName), eq(liveCallRequest.status, "accepted")))
  return rows.length
}

// Broadcast (portrait video) is a presenter-focused stage capped at 3 guests
// (host + 3 = 4 on stage) so the dynamic 1/2/3/4-person layouts stay premium.
// Every other format keeps the general MAX_GUESTS cap.
const BROADCAST_MAX_GUESTS = 3

/** Resolves the on-stage guest cap for a room based on its format. */
async function stageCapFor(roomName: string): Promise<number> {
  const [s] = await db
    .select({ mode: liveStream.mode, orientation: liveStream.orientation })
    .from(liveStream)
    .where(eq(liveStream.roomName, roomName))
  const isBroadcast = s?.mode === "video" && (s?.orientation ?? "portrait") === "portrait"
  return isBroadcast ? BROADCAST_MAX_GUESTS : MAX_GUESTS
}

/** Listener asks to come on as a guest. */
export async function requestToJoin(input: { roomName: string }): Promise<{ ok: boolean; error?: string }> {
  const actor = await getRoomActor(input.roomName)
  if (!actor) return { ok: false, error: "You can't request the stage in this live." }
  // Honor a host-locked stage or a disabled guest section: no new requests.
  const [s] = await db
    .select({ locked: liveStream.locked, guestsEnabled: liveStream.guestsEnabled })
    .from(liveStream)
    .where(eq(liveStream.roomName, input.roomName))
  if (s && !s.guestsEnabled) return { ok: false, error: "The host has turned off call-ins." }
  if (s?.locked) return { ok: false, error: "The host has locked the stage." }
  // Clear any prior resolved row for this user so they can re-request.
  await db
    .delete(liveCallRequest)
    .where(
      and(
        eq(liveCallRequest.roomName, input.roomName),
        eq(liveCallRequest.userId, actor.id),
        eq(liveCallRequest.kind, "request"),
      ),
    )
  await db.insert(liveCallRequest).values({
    roomName: input.roomName,
    userId: actor.id,
    userName: actor.name,
    kind: "request",
    status: "pending",
  })
  return { ok: true }
}

/** Host invites a specific listener to come on as a guest. */
export async function inviteToStage(input: { roomName: string; userId: string; userName: string }): Promise<void> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) throw new Error("Only the host can invite guests.")
  await db
    .delete(liveCallRequest)
    .where(
      and(
        eq(liveCallRequest.roomName, input.roomName),
        eq(liveCallRequest.userId, input.userId),
        eq(liveCallRequest.kind, "invite"),
      ),
    )
  await db.insert(liveCallRequest).values({
    roomName: input.roomName,
    userId: input.userId,
    userName: input.userName,
    kind: "invite",
    status: "pending",
  })
  // Real notification so the invited user hears about it even if they're not
  // looking at the room right now (they still accept/decline in-session).
  await notifyUser({
    userId: input.userId,
    actorId: user.id,
    actorName: user.name,
    type: "live",
    message: "invited you to join the live as a guest",
    link: `/live/${input.roomName}`,
  })
}

/**
 * Host blocks a participant: they are kicked from the LiveKit room, pulled off
 * the stage if they were speaking, and prevented from rejoining for the life of
 * the broadcast. Host-only; the host can't block themselves.
 */
export async function blockParticipant(input: {
  roomName: string
  userId: string
  userName: string
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  // Host or grid co-host may remove/block a participant.
  const { isController } = await getGridControl(input.roomName, user.id)
  if (!isController) return { ok: false, error: "Only the host or co-host can remove participants." }
  if (input.userId === user.id) return { ok: false, error: "You can't remove yourself." }

  // Record the block (idempotent — clear any prior row first).
  await db
    .delete(liveBlocked)
    .where(and(eq(liveBlocked.roomName, input.roomName), eq(liveBlocked.userId, input.userId)))
  await db.insert(liveBlocked).values({
    roomName: input.roomName,
    userId: input.userId,
    userName: input.userName,
  })

  // If they were on stage, end their speaking rows too so they don't linger.
  await db
    .update(liveCallRequest)
    .set({ status: "ended", updatedAt: new Date() })
    .where(and(eq(liveCallRequest.roomName, input.roomName), eq(liveCallRequest.userId, input.userId)))

  // Hard-kick them out of the live room immediately.
  await removeParticipant({ roomName: input.roomName, identity: input.userId })
  return { ok: true }
}

/** Host lifts a block, letting the participant rejoin. Host-only. */
export async function unblockParticipant(input: {
  roomName: string
  userId: string
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) return { ok: false, error: "Only the host can unblock participants." }
  await db
    .delete(liveBlocked)
    .where(and(eq(liveBlocked.roomName, input.roomName), eq(liveBlocked.userId, input.userId)))
  return { ok: true }
}

/**
 * Host force-mutes a participant's mic in a grid meeting (server-side hard
 * mute). Host-only; the host can't mute themselves this way. To bring someone
 * back on, the host sends an "ask to unmute" data message from the client —
 * a server can't silently reopen a mic.
 */
export async function muteParticipant(input: {
  roomName: string
  userId: string
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  // The host or the grid co-host may mute others.
  const { isController } = await getGridControl(input.roomName, user.id)
  if (!isController) return { ok: false, error: "Only the host or co-host can mute participants." }
  if (input.userId === user.id) return { ok: false, error: "You can't mute yourself." }
  await muteParticipantAudio({ roomName: input.roomName, identity: input.userId })
  return { ok: true }
}

// --- Grid meeting: co-host + spotlight pin -------------------------------
// These power the video "landscape" Meet/Zoom grid. Only the host promotes a
// co-host; the co-host then shares every host power. Either controller can
// request to spotlight (pin) any participant on page 1 once that person
// accepts. State lives on live_stream and is polled via getCallState so late
// joiners and everyone else stay in sync.

/** Host promotes/demotes the single grid co-host. Pass userId "" to clear. */
export async function setGridCohost(input: {
  roomName: string
  userId: string
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  // Only the host may appoint or remove the co-host.
  const hostId = await getHostId(input.roomName)
  if (hostId !== user.id) return { ok: false, error: "Only the host can set a co-host." }
  const next = input.userId && input.userId !== hostId ? input.userId : null
  await db.update(liveStream).set({ gridCohostId: next }).where(eq(liveStream.roomName, input.roomName))
  return { ok: true }
}

/**
 * The host (or co-host) sets the Conversation video layout for the whole room.
 * Synced via the `gridLayout` column so every participant sees the same tiling.
 */
const GRID_LAYOUTS = ["compact", "balanced", "focus"] as const
export type GridLayout = (typeof GRID_LAYOUTS)[number]
export async function setGridLayout(input: {
  roomName: string
  layout: GridLayout
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  const hostId = await getHostId(input.roomName)
  const [row] = await db
    .select({ cohost: liveStream.gridCohostId })
    .from(liveStream)
    .where(eq(liveStream.roomName, input.roomName))
  const isController = hostId === user.id || (!!row?.cohost && row.cohost === user.id)
  if (!isController) return { ok: false, error: "Only the host can change the layout." }
  const layout = GRID_LAYOUTS.includes(input.layout) ? input.layout : "balanced"
  await db.update(liveStream).set({ gridLayout: layout }).where(eq(liveStream.roomName, input.roomName))
  return { ok: true }
}

// Up to two participants may be spotlighted at once. They're stored as a
// comma-separated list in the `gridPinnedId` text column (no schema change).
const MAX_GRID_PINS = 2
function parseGridPins(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_GRID_PINS)
}
function serializeGridPins(ids: string[]): string | null {
  const unique = [...new Set(ids)].slice(0, MAX_GRID_PINS)
  return unique.length ? unique.join(",") : null
}

/**
 * A controller (host or co-host) toggles a participant's spotlight on page 1.
 * Up to two people can be spotlighted at once:
 *  - Pinning someone already pinned removes them (toggle off), immediately.
 *  - Pinning the host, or a controller pinning themselves, applies immediately
 *    (no accept needed) so the host can spotlight himself.
 *  - Any other participant must accept via respondGridPin before being pinned.
 */
export async function requestGridPin(input: {
  roomName: string
  userId: string
  userName: string
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  const { isController, hostId } = await getGridControl(input.roomName, user.id)
  if (!isController) return { ok: false, error: "Only the host or co-host can pin participants." }

  const [stream] = await db
    .select({ gridPinnedId: liveStream.gridPinnedId })
    .from(liveStream)
    .where(eq(liveStream.roomName, input.roomName))
  const pins = parseGridPins(stream?.gridPinnedId)

  // Toggle off if already pinned.
  if (pins.includes(input.userId)) {
    await db
      .update(liveStream)
      .set({
        gridPinnedId: serializeGridPins(pins.filter((id) => id !== input.userId)),
        // Clear any pending request that targeted this same person.
        gridPinRequestId: null,
        gridPinRequestName: null,
      })
      .where(eq(liveStream.roomName, input.roomName))
    return { ok: true }
  }

  // Adding a new pin — enforce the two-person cap.
  if (pins.length >= MAX_GRID_PINS) {
    return { ok: false, error: "You can spotlight up to two people. Remove one first." }
  }

  // The host, or a controller pinning themselves, is applied immediately.
  if (input.userId === hostId || input.userId === user.id) {
    await db
      .update(liveStream)
      .set({ gridPinnedId: serializeGridPins([...pins, input.userId]) })
      .where(eq(liveStream.roomName, input.roomName))
    return { ok: true }
  }

  // Otherwise the participant must accept the spotlight.
  await db
    .update(liveStream)
    .set({ gridPinRequestId: input.userId, gridPinRequestName: input.userName })
    .where(eq(liveStream.roomName, input.roomName))
  return { ok: true }
}

/**
 * Resolves an in-flight pin request. The requested participant accepts (becomes
 * the spotlight) or declines; a controller may also decline to cancel it.
 */
export async function respondGridPin(input: {
  roomName: string
  accept: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  const [stream] = await db
    .select({ gridPinRequestId: liveStream.gridPinRequestId, gridPinnedId: liveStream.gridPinnedId })
    .from(liveStream)
    .where(eq(liveStream.roomName, input.roomName))
  if (!stream?.gridPinRequestId) return { ok: false, error: "No pin request pending." }
  const { isController } = await getGridControl(input.roomName, user.id)
  const isTarget = stream.gridPinRequestId === user.id
  if (!isTarget && !isController) return { ok: false, error: "Not authorized." }
  if (input.accept && isTarget) {
    // Only the requested person can accept; they join the spotlight list (up to
    // two people) rather than replacing the existing pins.
    const pins = parseGridPins(stream.gridPinnedId)
    await db
      .update(liveStream)
      .set({
        gridPinnedId: serializeGridPins([...pins, user.id]),
        gridPinRequestId: null,
        gridPinRequestName: null,
      })
      .where(eq(liveStream.roomName, input.roomName))
  } else {
    await db
      .update(liveStream)
      .set({ gridPinRequestId: null, gridPinRequestName: null })
      .where(eq(liveStream.roomName, input.roomName))
  }
  return { ok: true }
}

/**
 * Focused (portrait) broadcast spotlight. Unlike the grid pin, this applies
 * immediately with no accept flow: the host taps to spotlight a called-in guest
 * so the guest's video fills the big frame and the host drops to a small slot.
 * A single guest is spotlighted at a time; passing the currently-pinned guest
 * (or null) clears it. Reuses the `gridPinnedId` column (portrait broadcasts
 * never run the grid, so there's no conflict) and is broadcast to everyone via
 * getCallState so viewers see the same swap.
 */
export async function setSpotlightGuest(input: {
  roomName: string
  userId: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  const { isController } = await getGridControl(input.roomName, user.id)
  if (!isController) return { ok: false, error: "Only the host can spotlight a guest." }
  const [stream] = await db
    .select({ gridPinnedId: liveStream.gridPinnedId })
    .from(liveStream)
    .where(eq(liveStream.roomName, input.roomName))
  const current = parseGridPins(stream?.gridPinnedId)[0] ?? null
  // Toggle off when re-tapping the pinned guest (or an explicit null); otherwise
  // spotlight the given guest, replacing any previous one.
  const next = !input.userId || current === input.userId ? null : input.userId
  await db.update(liveStream).set({ gridPinnedId: next }).where(eq(liveStream.roomName, input.roomName))
  return { ok: true }
}

/** Host accepts a pending request (or listener accepts an invite is handled separately). */
export async function respondToCallRequest(input: {
  id: number
  accept: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  const [req] = await db.select().from(liveCallRequest).where(eq(liveCallRequest.id, input.id))
  if (!req) return { ok: false, error: "Request no longer exists." }

  // Authorization: the host ��� or a co-host with the Accept Call Requests
  // permission — responds to "request"; the invited user responds to "invite".
  if (req.kind === "request" && !(await canManageRequests(req.roomName, user.id)))
    return { ok: false, error: "Not authorized." }
  if (req.kind === "invite" && req.userId !== user.id) return { ok: false, error: "Not authorized." }

  if (input.accept) {
    const cap = await stageCapFor(req.roomName)
    if ((await acceptedGuestCount(req.roomName)) >= cap) {
      return { ok: false, error: `All ${cap} guest spots are full.` }
    }
    await setParticipantPublish({ roomName: req.roomName, identity: req.userId, canPublish: true })
    await db
      .update(liveCallRequest)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(liveCallRequest.id, input.id))
  } else {
    await db
      .update(liveCallRequest)
      .set({ status: "declined", updatedAt: new Date() })
      .where(eq(liveCallRequest.id, input.id))
  }
  return { ok: true }
}

/** Removes a guest from the stage (host action or guest leaving) -> back to listener. */
export async function removeFromStage(input: { roomName: string; userId: string }): Promise<void> {
  const user = await requireUser()
  const hostId = await getHostId(input.roomName)
  if (hostId !== user.id && user.id !== input.userId) throw new Error("Not authorized.")

  await setParticipantPublish({ roomName: input.roomName, identity: input.userId, canPublish: false })
  await db
    .update(liveCallRequest)
    .set({ status: "ended", updatedAt: new Date() })
    .where(
      and(
        eq(liveCallRequest.roomName, input.roomName),
        eq(liveCallRequest.userId, input.userId),
        eq(liveCallRequest.status, "accepted"),
      ),
    )
  // If this guest was the focused-broadcast spotlight (or a grid pin), drop the
  // pin so the layout falls back cleanly to the host in the big frame.
  const [pinRow] = await db
    .select({ gridPinnedId: liveStream.gridPinnedId })
    .from(liveStream)
    .where(eq(liveStream.roomName, input.roomName))
  const remainingPins = parseGridPins(pinRow?.gridPinnedId).filter((id) => id !== input.userId)
  if ((pinRow?.gridPinnedId ?? null) !== serializeGridPins(remainingPins)) {
    await db
      .update(liveStream)
      .set({ gridPinnedId: serializeGridPins(remainingPins) })
      .where(eq(liveStream.roomName, input.roomName))
  }
}

/**
 * A participant steps off the call but stays in the room. For a co-host this
 * preserves their grant (status -> "left") so they can call back in and keep
 * their permissions; for a plain guest it behaves like leaving the stage.
 * Self-only.
 */
export async function stepOffStage(input: { roomName: string }): Promise<{ ok: boolean }> {
  const user = await requireUser()
  await setParticipantPublish({ roomName: input.roomName, identity: user.id, canPublish: false })
  const [row] = await db
    .select()
    .from(liveCallRequest)
    .where(and(eq(liveCallRequest.roomName, input.roomName), eq(liveCallRequest.userId, user.id)))
    .orderBy(desc(liveCallRequest.updatedAt))
  if (!row) return { ok: true }
  // Co-hosts keep their grant (and thus reappear in the host's Co-hosts tab as
  // "Off call"); ordinary guests are simply removed from the stage.
  const nextStatus = row.role === "cohost" ? "left" : "ended"
  await db
    .update(liveCallRequest)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(liveCallRequest.id, row.id))
  return { ok: true }
}

/**
 * A co-host who stepped off / dropped the call rejoins the stage. No host
 * approval needed (they are already trusted), but the guest cap still applies.
 * Self-only.
 */
export async function callIn(input: { roomName: string }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  const row = await getCoHostRow(input.roomName, user.id)
  if (!row) return { ok: false, error: "You're not a co-host of this session." }
  if (row.status !== "accepted") {
    const cap = await stageCapFor(input.roomName)
    if ((await acceptedGuestCount(input.roomName)) >= cap) {
      return { ok: false, error: `All ${cap} stage spots are full.` }
    }
  }
  await setParticipantPublish({ roomName: input.roomName, identity: user.id, canPublish: true })
  await db
    .update(liveCallRequest)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(eq(liveCallRequest.id, row.id))
  return { ok: true }
}

/**
 * Polled by host (sees pending requests + accepted guests) and by listeners
 * (sees their own invite + whether they were accepted).
 */
export async function getCallState(input: { roomName: string }): Promise<{
  pendingRequests: CallRequestView[]
  guests: CallRequestView[]
  myInvite: CallRequestView | null
  myStatus: CallRequestView["status"] | null
  chatBgUrl: string | null
  chatBgEffect: ChatBgEffect
  locked: boolean
  // Host toggle for the guest call-in section (default true). When false,
  // viewers see no call-in slots and the space is given to video + chat.
  guestsEnabled: boolean
  pinnedChatId: number | null
  // Host-chosen studio theme id, polled so listeners restyle live.
  theme: string
  // True once the host has ended the broadcast — lets listeners auto-close.
  ended: boolean
  // True when the caller has been blocked by the host — lets the viewer auto-exit.
  blocked: boolean
  // Users the host has blocked from this room (host view: drives the Unblock list).
  blockedUsers: BlockedUserView[]
  // --- Co-host system (polled so promotions/permissions apply ~instantly) ---
  // The caller's own role + permissions in this room.
  myRole: LiveRole
  myPermissions: CoHostPermissions
  myMusicApproved: boolean
  myMusicRequestPending: boolean
  // True when the caller is actively publishing on the call (status "accepted").
  // A co-host who stepped off keeps myRole "cohost" but myOnCall false.
  myOnCall: boolean
  // Every user granted co-host status, regardless of whether they're currently
  // on the call — drives the host's Co-hosts management tab. Each entry's
  // `status` is "accepted" (On stage) or otherwise (Off call).
  coHosts: CallRequestView[]
  // The single co-host (if any) who currently controls music — when set, the
  // host's own music controls are disabled and handed to that co-host.
  musicControllerId: string | null
  // Pending "may I control music?" request from a co-host (host view: approve/decline).
  musicApprovalRequest: CallRequestView | null
  // A co-host's pending "end live session" request awaiting the host's answer.
  // Includes who asked and how many ms remain before the live auto-ends.
  endRequest: { byId: string; byName: string; remainingMs: number } | null
  // --- Grid meeting coordination (video "landscape" Meet/Zoom layout) ---
  // The room's host id, so grid clients can compute control rights.
  hostId: string | null
  // The single grid co-host (mirrors every host power), or null.
  gridCohostId: string | null
  // Up to two participants spotlighted on page 1 (in pin order). Empty = pure grid.
  gridPinnedIds: string[]
  // An in-flight request to pin a participant, awaiting their acceptance.
  gridPinRequest: { userId: string; userName: string } | null
  // Host-selected Conversation video layout, synced to everyone.
  gridLayout: GridLayout
}> {
  // Auto-end abandoned streams first so listeners of a vanished host close out.
  await endStaleStreams()
  // Resolve the caller as either a member or a display-name guest, so an accepted
  // guest still sees their own call status (myStatus/myOnCall) and can come on
  // stage. A guest id (`guest:<id>`) never matches a hostId, so guests never gain
  // host controls from this.
  const actor = await getLiveActor()
  const me = actor?.id ?? null

  let [stream] = await db
    .select({
      chatBgUrl: liveStream.chatBgUrl,
      chatBgEffect: liveStream.chatBgEffect,
      status: liveStream.status,
      locked: liveStream.locked,
      guestsEnabled: liveStream.guestsEnabled,
      pinnedChatId: liveStream.pinnedChatId,
      theme: liveStream.theme,
      endRequestAt: liveStream.endRequestAt,
      endRequestById: liveStream.endRequestById,
      endRequestByName: liveStream.endRequestByName,
      gridCohostId: liveStream.gridCohostId,
      gridPinnedId: liveStream.gridPinnedId,
      gridPinRequestId: liveStream.gridPinRequestId,
      gridPinRequestName: liveStream.gridPinRequestName,
      gridLayout: liveStream.gridLayout,
    })
    .from(liveStream)
    .where(eq(liveStream.roomName, input.roomName))

  // A co-host's "end live session" request that the host never answered. Once
  // the 30s window elapses, the live ends automatically on the next poll.
  let endRequest: { byId: string; byName: string; remainingMs: number } | null = null
  if (stream && stream.status === "live" && stream.endRequestAt) {
    const remainingMs = END_REQUEST_WINDOW_MS - (Date.now() - stream.endRequestAt.getTime())
    if (remainingMs <= 0) {
      await stopEgressForRoom(input.roomName)
      await db
        .update(liveStream)
        .set({
          status: "ended",
          endedAt: new Date(),
          endRequestAt: null,
          endRequestById: null,
          endRequestByName: null,
          egressId: null,
        })
        .where(and(eq(liveStream.roomName, input.roomName), eq(liveStream.status, "live")))
      revalidatePath("/live")
      stream = { ...stream, status: "ended" }
    } else if (stream.endRequestById) {
      endRequest = {
        byId: stream.endRequestById,
        byName: stream.endRequestByName ?? "A co-host",
        remainingMs,
      }
    }
  }

  const rows = await db
    .select()
    .from(liveCallRequest)
    .where(eq(liveCallRequest.roomName, input.roomName))
    .orderBy(asc(liveCallRequest.createdAt))

  // Blocked participants for this room (host list) + whether the caller is one.
  const blockedRows = await db
    .select()
    .from(liveBlocked)
    .where(eq(liveBlocked.roomName, input.roomName))
    .orderBy(asc(liveBlocked.createdAt))
  const blocked = me ? blockedRows.some((b) => b.userId === me) : false
  const blockedUsers: BlockedUserView[] = blockedRows.map((b) => ({
    userId: b.userId,
    userName: b.userName,
    initials: getInitials(b.userName),
    color: getAvatarColor(b.userId),
  }))

  const pendingRequests = rows.filter((r) => r.kind === "request" && r.status === "pending").map(mapRequest)
  const acceptedRows = rows.filter((r) => r.status === "accepted")
  const guests = acceptedRows.map(mapRequest)
  // All granted co-hosts, deduped to the latest row per user, regardless of
  // status — so off-call co-hosts still appear in the host's management tab.
  const coHostByUser = new Map<string, typeof liveCallRequest.$inferSelect>()
  for (const r of rows) {
    if (r.role !== "cohost") continue
    const prev = coHostByUser.get(r.userId)
    if (!prev || r.updatedAt.getTime() > prev.updatedAt.getTime()) coHostByUser.set(r.userId, r)
  }
  // Sort On-stage (accepted) first, then by most recent. The host can retract
  // any of them whether or not they're still in the session.
  const coHosts = [...coHostByUser.values()]
    .sort((a, b) => {
      const aOn = a.status === "accepted" ? 0 : 1
      const bOn = b.status === "accepted" ? 0 : 1
      return aOn - bOn || b.updatedAt.getTime() - a.updatedAt.getTime()
    })
    .map(mapRequest)
  const myRows = me ? rows.filter((r) => r.userId === me) : []
  const myInvite = myRows.find((r) => r.kind === "invite" && r.status === "pending")
  const mine = [...myRows].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]

  const hostId = stream ? await getHostId(input.roomName) : null
  // A co-host keeps their role + permissions whether on the call ("accepted")
  // or stepped off ("left"); only the host outranks them.
  const myCoHost = mine && mine.role === "cohost" && (mine.status === "accepted" || mine.status === "left") ? mine : null
  const myRole: LiveRole = me && hostId === me ? "host" : myCoHost ? "cohost" : "guest"
  const myOnCall = mine?.status === "accepted"
  const myPermissions: CoHostPermissions =
    myRole === "cohost"
      ? {
          acceptRequests: myCoHost?.canAcceptRequests ?? false,
          controlTracks: myCoHost?.canControlTracks ?? false,
          endSession: myCoHost?.canEndSession ?? false,
        }
      : { acceptRequests: false, controlTracks: false, endSession: false }

  // A co-host controls music once they have the Control Tracks permission AND
  // their first upload has been approved by the host.
  const controller = acceptedRows.find(
    (r) => r.role === "cohost" && r.canControlTracks && r.musicApproved,
  )
  // A pending approval request (only relevant to the host).
  const pendingMusic = acceptedRows.find(
    (r) => r.role === "cohost" && r.canControlTracks && r.musicRequestPending && !r.musicApproved,
  )

  return {
    pendingRequests,
    guests,
    myInvite: myInvite ? mapRequest(myInvite) : null,
    myStatus: mine ? (mine.status as CallRequestView["status"]) : null,
    chatBgUrl: stream?.chatBgUrl ?? null,
    chatBgEffect: (stream?.chatBgEffect as ChatBgEffect) ?? "none",
    locked: stream?.locked ?? false,
    guestsEnabled: stream?.guestsEnabled ?? true,
    pinnedChatId: stream?.pinnedChatId ?? null,
    theme: stream?.theme ?? "default",
    // No row, or row flipped to "ended", both mean the session is over.
    ended: !stream || stream.status !== "live",
    blocked,
    blockedUsers,
    myRole,
    myPermissions,
    myMusicApproved: myCoHost?.musicApproved ?? false,
    myMusicRequestPending: myCoHost?.musicRequestPending ?? false,
    myOnCall,
    coHosts,
    musicControllerId: controller?.userId ?? null,
    musicApprovalRequest: pendingMusic ? mapRequest(pendingMusic) : null,
    endRequest,
    hostId,
    gridCohostId: stream?.gridCohostId ?? null,
    gridPinnedIds: parseGridPins(stream?.gridPinnedId),
    gridPinRequest:
      stream?.gridPinRequestId
        ? { userId: stream.gridPinRequestId, userName: stream.gridPinRequestName ?? "A participant" }
        : null,
    gridLayout: ((stream?.gridLayout as GridLayout | undefined) ?? "balanced") as GridLayout,
  }
}

// --- Co-host system --------------------------------------------------------

/** Loads the accepted on-stage row for a user, or null. */
async function getAcceptedRow(roomName: string, userId: string) {
  const [row] = await db
    .select()
    .from(liveCallRequest)
    .where(
      and(
        eq(liveCallRequest.roomName, roomName),
        eq(liveCallRequest.userId, userId),
        eq(liveCallRequest.status, "accepted"),
      ),
    )
    .orderBy(desc(liveCallRequest.updatedAt))
  return row ?? null
}

/**
 * Main host promotes an accepted speaker to co-host. Co-hosts start with only
 * the "Accept Call Requests" permission enabled (per spec). Host-only.
 */
export async function makeCoHost(input: { roomName: string; userId: string }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) return { ok: false, error: "Only the host can add co-hosts." }
  const row = await getAcceptedRow(input.roomName, input.userId)
  if (!row) return { ok: false, error: "That speaker is no longer on stage." }
  await db
    .update(liveCallRequest)
    .set({
      role: "cohost",
      canAcceptRequests: true,
      canControlTracks: false,
      canEndSession: false,
      musicApproved: false,
      musicRequestPending: false,
      updatedAt: new Date(),
    })
    .where(eq(liveCallRequest.id, row.id))
  return { ok: true }
}

/**
 * Main host toggles a single co-host permission. Turning off Control Tracks
 * also clears the music approval state, so music control returns to the host.
 * Host-only.
 */
export async function setCoHostPermission(input: {
  roomName: string
  userId: string
  permission: "acceptRequests" | "controlTracks" | "endSession"
  enabled: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id)
    return { ok: false, error: "Only the host can manage co-hosts." }
  // Use the co-host grant row (any status) so permissions are editable even
  // while the co-host is off the call.
  const row = await getCoHostRow(input.roomName, input.userId)
  if (!row) return { ok: false, error: "That user is not a co-host." }

  const patch: Partial<typeof liveCallRequest.$inferInsert> = { updatedAt: new Date() }
  if (input.permission === "acceptRequests") patch.canAcceptRequests = input.enabled
  if (input.permission === "endSession") patch.canEndSession = input.enabled
  if (input.permission === "controlTracks") {
    patch.canControlTracks = input.enabled
    // Revoking Control Tracks immediately hands music back to the host.
    if (!input.enabled) {
      patch.musicApproved = false
      patch.musicRequestPending = false
    }
  }
  await db.update(liveCallRequest).set(patch).where(eq(liveCallRequest.id, row.id))
  return { ok: true }
}

/**
 * Main host removes a co-host: they return to the ordinary Speaker (guest) role
 * and lose every co-host permission. They stay on stage as a speaker. Host-only.
 */
export async function removeCoHost(input: { roomName: string; userId: string }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) return { ok: false, error: "Only the host can manage co-hosts." }
  // Retract via the grant row (any status), so the host can demote a co-host
  // whether or not they're still in the session.
  const row = await getCoHostRow(input.roomName, input.userId)
  if (!row) return { ok: false, error: "That user is not a co-host." }
  await db
    .update(liveCallRequest)
    .set({
      role: "guest",
      canAcceptRequests: false,
      canControlTracks: false,
      canEndSession: false,
      musicApproved: false,
      musicRequestPending: false,
      updatedAt: new Date(),
    })
    .where(eq(liveCallRequest.id, row.id))
  return { ok: true }
}

/**
 * A track-controlling co-host requests music control the first time they try to
 * upload. Flags a pending approval the host resolves. No-op once approved.
 */
export async function requestMusicControl(input: { roomName: string }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  const row = await getAcceptedRow(input.roomName, user.id)
  if (!row || row.role !== "cohost" || !row.canControlTracks)
    return { ok: false, error: "You don't have track control." }
  if (row.musicApproved) return { ok: true }
  await db
    .update(liveCallRequest)
    .set({ musicRequestPending: true, updatedAt: new Date() })
    .where(eq(liveCallRequest.id, row.id))
  return { ok: true }
}

/** Main host approves/declines a co-host's pending music control request. Host-only. */
export async function resolveMusicControl(input: {
  roomName: string
  userId: string
  approve: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) return { ok: false, error: "Only the host can decide." }
  const row = await getAcceptedRow(input.roomName, input.userId)
  if (!row || row.role !== "cohost") return { ok: false, error: "That user is not a co-host." }
  await db
    .update(liveCallRequest)
    .set({ musicApproved: input.approve, musicRequestPending: false, updatedAt: new Date() })
    .where(eq(liveCallRequest.id, row.id))
  return { ok: true }
}

// How long the host has to answer a co-host's "end live session" request
// before the live ends automatically. Not exported ��� a "use server" module may
// only export async functions; the client derives its countdown from the
// server-reported remainingMs instead.
const END_REQUEST_WINDOW_MS = 30_000

/**
 * A co-host who holds the End Session permission asks the host to end the live.
 * Instead of ending immediately, this records a pending request on the stream.
 * The host then has 30s to approve/decline; if unanswered, `getCallState`
 * auto-ends the stream once the window elapses.
 */
export async function requestEndSession(input: { roomName: string }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  const row = await getAcceptedRow(input.roomName, user.id)
  if (!row || row.role !== "cohost" || !row.canEndSession)
    return { ok: false, error: "You can't end this session." }
  await db
    .update(liveStream)
    .set({ endRequestAt: new Date(), endRequestById: user.id, endRequestByName: user.name ?? row.userName })
    .where(and(eq(liveStream.roomName, input.roomName), eq(liveStream.status, "live")))
  return { ok: true }
}

/**
 * The host answers a co-host's pending "end live session" request. `approve`
 * true ends the broadcast immediately; false clears the request and the session
 * continues. Only the main host may resolve it.
 */
export async function resolveEndSession(input: {
  roomName: string
  approve: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id)
    return { ok: false, error: "Only the host can answer this request." }
  if (input.approve) {
    await stopEgressForRoom(input.roomName)
    await db
      .update(liveStream)
      .set({
        status: "ended",
        endedAt: new Date(),
        endRequestAt: null,
        endRequestById: null,
        endRequestByName: null,
        egressId: null,
      })
      .where(and(eq(liveStream.roomName, input.roomName), eq(liveStream.status, "live")))
    revalidatePath("/live")
  } else {
    await db
      .update(liveStream)
      .set({ endRequestAt: null, endRequestById: null, endRequestByName: null })
      .where(eq(liveStream.roomName, input.roomName))
  }
  return { ok: true }
}

// --- Host-controlled chat background ---------------------------------------

export type ChatBgEffect = "none" | "blur" | "dim"

export async function setChatBackground(input: {
  roomName: string
  url?: string | null
  effect?: ChatBgEffect
}): Promise<void> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) throw new Error("Only the host can change the background.")
  const patch: { chatBgUrl?: string | null; chatBgEffect?: ChatBgEffect } = {}
  if (input.url !== undefined) patch.chatBgUrl = input.url
  if (input.effect !== undefined) patch.chatBgEffect = input.effect
  await db.update(liveStream).set(patch).where(eq(liveStream.roomName, input.roomName))
}

// --- Host stage controls: lock & pinned comment ----------------------------

/** Host locks/unlocks the stage. While locked, no new requests to speak are accepted. */
export async function setRoomLock(input: { roomName: string; locked: boolean }): Promise<{ ok: boolean }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) throw new Error("Only the host can lock the stage.")
  await db.update(liveStream).set({ locked: input.locked }).where(eq(liveStream.roomName, input.roomName))
  return { ok: true }
}

/**
 * Host turns the guest call-in section on/off. When off, no call-in slots are
 * shown to viewers and the freed space is split between the host video and chat.
 */
export async function setGuestsEnabled(input: { roomName: string; enabled: boolean }): Promise<{ ok: boolean }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) throw new Error("Only the host can change guest settings.")
  // Turning call-ins off also clears any focused-broadcast spotlight so the host
  // returns to the big frame.
  await db
    .update(liveStream)
    .set({ guestsEnabled: input.enabled, ...(input.enabled ? {} : { gridPinnedId: null }) })
    .where(eq(liveStream.roomName, input.roomName))
  return { ok: true }
}

/** Host switches the immersive studio theme. Applies live to all listeners. */
export async function setLiveTheme(input: { roomName: string; theme: string }): Promise<{ ok: boolean }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) throw new Error("Only the host can change the theme.")
  await db.update(liveStream).set({ theme: input.theme }).where(eq(liveStream.roomName, input.roomName))
  // Remember this as the host's default so their next broadcast opens on the
  // same backdrop (including a custom uploaded image) without re-picking it.
  await db
    .update(userTable)
    .set({ preferredLiveTheme: input.theme })
    .where(eq(userTable.id, user.id))
  return { ok: true }
}

/** Host pins (or unpins, with chatId=null) a chat message to the top of the room. */
export async function pinLiveChat(input: { roomName: string; chatId: number | null }): Promise<{ ok: boolean }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) throw new Error("Only the host can pin a comment.")
  await db.update(liveStream).set({ pinnedChatId: input.chatId }).where(eq(liveStream.roomName, input.roomName))
  return { ok: true }
}

// --- Shared live state: pinned participant, room state -----------------------

/**
 * Host pins (or unpins, with userId=null) a single participant in a Conversation
 * room. Stored in `gridPinnedId` as a single id (conversation rooms are audio,
 * so they never collide with the video grid's multi-pin serialization).
 */
export async function setPinnedParticipant(input: {
  roomName: string
  userId: string | null
}): Promise<{ ok: boolean }> {
  const user = await requireUser()
  if ((await getHostId(input.roomName)) !== user.id) throw new Error("Only the host can pin a participant.")
  await db
    .update(liveStream)
    .set({ gridPinnedId: input.userId || null })
    .where(eq(liveStream.roomName, input.roomName))
  return { ok: true }
}

export type ConversationState = {
  pinnedId: string | null
  locked: boolean
  ended: boolean
  theme: string
  // Host-selected Conversation video layout, synced to every participant.
  gridLayout: GridLayout
}

/**
 * Lightweight poll for every client in a Conversation room: pinned participant,
 * lock state, the room theme, and whether the room has ended.
 */
export async function getConversationState(input: { roomName: string }): Promise<ConversationState> {
  const [r] = await db
    .select({
      gridPinnedId: liveStream.gridPinnedId,
      locked: liveStream.locked,
      status: liveStream.status,
      theme: liveStream.theme,
      gridLayout: liveStream.gridLayout,
    })
    .from(liveStream)
    .where(eq(liveStream.roomName, input.roomName))
    .limit(1)
  if (!r) return { pinnedId: null, locked: false, ended: true, theme: "default", gridLayout: "balanced" }
  return {
    pinnedId: r.gridPinnedId ?? null,
    locked: r.locked ?? false,
    ended: r.status !== "live",
    theme: r.theme ?? "default",
    gridLayout: ((r.gridLayout as GridLayout | undefined) ?? "balanced") as GridLayout,
  }
}
