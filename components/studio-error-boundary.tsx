"use client"

import { Component, type ReactNode } from "react"
import { AlertTriangle } from "lucide-react"

/**
 * Catches render/runtime errors inside the video studio so a thrown error can
 * never blank the whole screen in production. Instead of an unrecoverable black
 * page, the host sees what went wrong and a way back to the Live tab.
 *
 * The visible error text also doubles as a remote diagnostic: on a real device
 * (where camera/track behavior differs from the sandbox) the host can read the
 * exact message back to us.
 */
export class StudioErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    // Surface in logs for anyone watching the console / server logs.
    console.log("[v0] StudioErrorBoundary caught:", error?.message, error?.stack, info)
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-neutral-950 px-6 text-center text-white">
          <AlertTriangle className="size-10 text-destructive" />
          <h1 className="text-lg font-semibold text-balance">The video studio hit a problem</h1>
          <p className="max-w-sm text-sm text-white/70 text-pretty">
            Something went wrong while starting your live. Please try again.
          </p>
          {/* Visible error detail — helps diagnose device-specific failures. */}
          <pre className="max-h-32 max-w-sm overflow-auto rounded-lg bg-white/5 px-3 py-2 text-left text-[11px] leading-relaxed text-white/50 ring-1 ring-inset ring-white/10">
            {error.message || String(error)}
          </pre>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/20"
            >
              Try again
            </button>
            <a
              href="/live"
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Back to Live
            </a>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
