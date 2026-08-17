import { betterAuth } from "better-auth"
import { pool } from "@/lib/db"
import { sendPasswordResetEmail } from "@/lib/email"

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  // Google sign-in / sign-up. Only enabled when the OAuth credentials are
  // present so the app keeps working before they're configured. Better Auth
  // auto-creates an account on first Google sign-in, so the same flow handles
  // both new sign-ups and returning users.
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        socialProviders: {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        },
      }
    : {}),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    // Emails a secure reset link (valid 1 hour) when a user forgets their
    // password. `url` already points at our /reset-password page with the token.
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({ to: user.email, name: user.name, url })
    },
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
  },
  trustedOrigins: [
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
    // The app is also reachable directly on localhost in local dev and, in the
    // v0 preview runtime, through an ephemeral sandbox host such as
    // https://sb-xxxx.vercel.run (the browser/iframe origin differs from the
    // canonical V0_RUNTIME_URL above). NODE_ENV is not reliably "development"
    // in the preview sandbox, so trust these unconditionally — production
    // origins are the deployed Vercel URL(s) above, and *.vercel.run /
    // localhost are exclusively preview/dev infrastructure, so this is safe.
    "http://localhost:*",
    "https://localhost:*",
    "https://*.vercel.run",
    "https://*.v0.build",
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          // In dev (v0 preview iframe), force cross-site cookies so the
          // session cookie is stored by the browser.
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }
    : {}),
})
