"use client"

import { useEffect } from "react"

/**
 * App-wide catch-all error boundary.
 *
 * `error.tsx` boundaries only catch errors thrown *below* a layout — they can
 * never catch an error thrown by the ROOT layout itself (e.g. its server-side
 * `getActiveHomeContext()` call failing when the database is briefly
 * unreachable). When that happened there was no boundary at all, so the browser
 * fell back to its native "This page couldn't load" crash screen.
 *
 * `global-error` replaces the whole document (it must render its own <html> and
 * <body>), so it is the only thing that can recover a root-layout failure. It is
 * deliberately self-contained — inline styles, no providers, no external UI — so
 * it renders even when the app shell is completely broken.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[v0] Global error boundary caught:", error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          padding: "0 24px",
          textAlign: "center",
          background: "#0c0c0f",
          color: "#fafafa",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "rgba(255,255,255,0.08)",
          }}
          aria-hidden
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>
            Something went wrong
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: 360,
              fontSize: 14,
              lineHeight: 1.6,
              color: "rgba(250,250,250,0.65)",
            }}
          >
            We hit a snag loading the app. This is usually temporary — please try again.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={reset}
            style={{
              height: 44,
              padding: "0 24px",
              borderRadius: 9999,
              border: "none",
              cursor: "pointer",
              background: "#f26522",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 44,
              padding: "0 24px",
              borderRadius: 9999,
              border: "1px solid rgba(255,255,255,0.16)",
              color: "#fafafa",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Go home
          </a>
        </div>
      </body>
    </html>
  )
}
