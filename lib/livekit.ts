import "server-only"
import { AccessToken, RoomServiceClient, TrackType } from "livekit-server-sdk"

/**
 * Real-time audio is powered by LiveKit (a WebRTC SFU). These three values come
 * from your LiveKit Cloud project (https://cloud.livekit.io) and are injected as
 * environment variables. NEXT_PUBLIC_LIVEKIT_URL is the only one exposed to the
 * browser; the key/secret stay server-only and are used to mint access tokens.
 */
export const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? process.env.LIVEKIT_URL ?? ""

export function isLiveKitConfigured(): boolean {
  return Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && LIVEKIT_URL)
}

/**
 * Mints a short-lived access token for a participant joining a room.
 * Hosts (canPublish) broadcast audio; listeners only subscribe.
 */
export async function createAccessToken(opts: {
  roomName: string
  identity: string
  name: string
  canPublish: boolean
  // Optional JSON carried on the participant (e.g. their profile image URL) so
  // other clients can render real avatars on the stage.
  metadata?: string
}): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret) {
    throw new Error("LiveKit is not configured.")
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: opts.identity,
    name: opts.name,
    metadata: opts.metadata,
    // Tokens live long enough for a full broadcast session.
    ttl: "6h",
  })

  at.addGrant({
    room: opts.roomName,
    roomJoin: true,
    canPublish: opts.canPublish,
    canPublishData: true, // allows reactions/metadata over the data channel
    canSubscribe: true,
  })

  return at.toJwt()
}

/**
 * Lists the participants currently connected to a room. Returns an empty array
 * when the room doesn't exist yet (no active call) — LiveKit throws for unknown
 * rooms, so we swallow that case. Used for group-call presence in chatrooms.
 */
export async function listRoomParticipants(
  roomName: string,
): Promise<{ identity: string; name: string }[]> {
  if (!isLiveKitConfigured()) return []
  try {
    const svc = roomService()
    const participants = await svc.listParticipants(roomName)
    return participants.map((p) => ({ identity: p.identity, name: p.name || p.identity }))
  } catch {
    // Room not found / not created yet → no one is on a call.
    return []
  }
}

/** Server-side admin client used to elevate/demote participants mid-session. */
function roomService(): RoomServiceClient {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret || !LIVEKIT_URL) {
    throw new Error("LiveKit is not configured.")
  }
  // RoomServiceClient needs the HTTP(S) host, not the wss:// signalling URL.
  const httpUrl = LIVEKIT_URL.replace(/^ws/, "http")
  return new RoomServiceClient(httpUrl, apiKey, apiSecret)
}

/**
 * Grants or revokes publish permission for a participant already in the room.
 * This is how a listener/guest is promoted to "live" (or sent back to the
 * audience) without rejoining — LiveKit pushes a permission update and the
 * client reacts to ParticipantPermissionsChanged.
 */
export async function setParticipantPublish(opts: {
  roomName: string
  identity: string
  canPublish: boolean
}): Promise<void> {
  const svc = roomService()
  await svc.updateParticipant(opts.roomName, opts.identity, {
    permission: {
      canPublish: opts.canPublish,
      canSubscribe: true,
      canPublishData: true,
    },
  })
}

/**
 * Forcibly removes a participant from a room (a hard kick). Used when a host
 * blocks someone: LiveKit disconnects their session immediately. Swallows the
 * "participant/room not found" case so blocking a listener who isn't currently
 * connected (or has already left) is a safe no-op.
 */
export async function removeParticipant(opts: {
  roomName: string
  identity: string
}): Promise<void> {
  if (!isLiveKitConfigured()) return
  try {
    const svc = roomService()
    await svc.removeParticipant(opts.roomName, opts.identity)
  } catch {
    // Not connected / room gone → nothing to disconnect.
  }
}

/**
 * Server-side force-mute of every audio track a participant is publishing. Used
 * by a host to silence someone in a grid meeting. There is intentionally no
 * server-side unmute: privacy rules mean a server can't silently open a mic, so
 * unmuting is done by asking the participant (via a data message) to re-enable.
 */
export async function muteParticipantAudio(opts: {
  roomName: string
  identity: string
}): Promise<void> {
  if (!isLiveKitConfigured()) return
  const svc = roomService()
  try {
    const participants = await svc.listParticipants(opts.roomName)
    const target = participants.find((p) => p.identity === opts.identity)
    if (!target) return
    await Promise.all(
      target.tracks
        .filter((t) => t.type === TrackType.AUDIO && !t.muted)
        .map((t) => svc.mutePublishedTrack(opts.roomName, opts.identity, t.sid, true)),
    )
  } catch {
    // Participant/track gone → nothing to mute.
  }
}
