import "server-only"
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"

/**
 * Lightweight, signed guest identity for PUBLIC live sessions.
 *
 * This is deliberately NOT a Better Auth login: it only carries a display name
 * and a random id, and it exists solely so someone who opens a public Live link
 * from outside the app can join with a name — without creating an account,
 * becoming a member, or joining the organisation. `getCurrentUser()` never reads
 * this cookie, so org surfaces (Home, Notice Board, member directory,
 * appointments) stay fully protected: a guest simply has no Better Auth session.
 */

const COOKIE = "pulse_live_guest"
// ~12h: long enough for a service/broadcast, short enough to not linger.
const MAX_AGE_SECONDS = 12 * 60 * 60

export type GuestSession = {
  /** Stable random id. The LiveKit / live-table identity is `guest:<id>`. */
  id: string
  /** Display name the guest typed on the join gate. */
  name: string
}

function secret(): string {
  const s = process.env.BETTER_AUTH_SECRET
  if (!s) throw new Error("BETTER_AUTH_SECRET is required to sign guest sessions.")
  return s
}

/** Trim + clamp a user-supplied display name to a safe 1–40 char single line. */
export function sanitizeGuestName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 40)
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url")
}

function encode(session: GuestSession): string {
  const payload = Buffer.from(
    JSON.stringify({ gid: session.id, name: session.name, iat: Date.now() }),
    "utf8",
  ).toString("base64url")
  return `${payload}.${sign(payload)}`
}

function decode(token: string | undefined): GuestSession | null {
  if (!token) return null
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  const mac = token.slice(dot + 1)
  const expected = sign(payload)
  // Constant-time compare; bail if lengths differ (timingSafeEqual throws then).
  const macBuf = Buffer.from(mac)
  const expBuf = Buffer.from(expected)
  if (macBuf.length !== expBuf.length || !timingSafeEqual(macBuf, expBuf)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      gid?: string
      name?: string
      iat?: number
    }
    if (!data.gid || !data.name) return null
    if (typeof data.iat === "number" && Date.now() - data.iat > MAX_AGE_SECONDS * 1000) return null
    return { id: data.gid, name: data.name }
  } catch {
    return null
  }
}

/** Reads the current signed guest session from the cookie, or null. */
export async function getGuestSession(): Promise<GuestSession | null> {
  const store = await cookies()
  return decode(store.get(COOKIE)?.value)
}

/**
 * Creates (or replaces) the guest session cookie for a display name and returns
 * it. Rejects an empty name so the caller can surface a validation message.
 */
export async function createGuestSession(rawName: string): Promise<GuestSession> {
  const name = sanitizeGuestName(rawName)
  if (!name) throw new Error("Please enter a display name.")
  const session: GuestSession = { id: randomUUID(), name }
  const store = await cookies()
  store.set(COOKIE, encode(session), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  })
  return session
}

/** Clears the guest session cookie (e.g. when a guest leaves). */
export async function clearGuestSession(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE)
}
