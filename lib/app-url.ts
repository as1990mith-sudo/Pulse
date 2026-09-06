import "server-only"

/**
 * Absolute base URL of the app, for building links that live OUTSIDE the browser
 * (emails, etc.) where a relative path is meaningless. Mirrors the derivation
 * Better Auth uses for its own links so every channel agrees on the origin.
 */
export function getAppUrl(): string {
  const url =
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL) ??
    "http://localhost:3000"
  return url.replace(/\/$/, "")
}

/** Absolute URL of a guest's tokenised appointment manage page. */
export function appointmentManageUrl(token: string): string {
  return `${getAppUrl()}/appointment/${encodeURIComponent(token)}`
}
