import { headers } from "next/headers"

/**
 * Resolves the app's own origin (scheme + host) from the incoming request, so
 * shared links and Open Graph URLs always use the real configured domain rather
 * than a hard-coded one. Falls back to a Vercel URL env var, then localhost.
 */
export async function getSiteOrigin(): Promise<string> {
  try {
    const h = await headers()
    const host = h.get("x-forwarded-host") ?? h.get("host")
    const proto = h.get("x-forwarded-proto") ?? "https"
    if (host) return `${proto}://${host}`
  } catch {
    // headers() unavailable (e.g. during static analysis) — fall through.
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3000"
}

/** Turns an app-relative path (or already-absolute URL) into an absolute URL. */
export async function absoluteShareUrl(pathOrUrl: string): Promise<string> {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const origin = await getSiteOrigin()
  return `${origin}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`
}
