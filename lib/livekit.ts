import "server-only"
import { AccessToken } from "livekit-server-sdk"

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
}): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret) {
    throw new Error("LiveKit is not configured.")
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: opts.identity,
    name: opts.name,
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
