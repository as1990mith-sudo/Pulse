"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"

/**
 * Keeps a piece of screen state (active tab, sub-tab, filter, search query, …) in
 * the URL so that:
 *
 *  - a reload stays on the exact same view — the requirement that refresh must
 *    not bounce the user back to a default tab;
 *  - Back returns to a screen showing what the user actually left behind,
 *    because the state travels with the history entry rather than living in a
 *    `useState` that resets to its initial value on remount;
 *  - the view is linkable and shareable.
 *
 * Updates use `history.replaceState`, NOT `pushState`. Tab switches are
 * deliberately not Back-able: they rewrite the current entry instead of adding
 * one, so Back leaves the screen rather than walking backwards through every tab
 * the user tried. Page navigations remain the only thing that creates history.
 *
 * `replaceState` also avoids the server round-trip that `router.replace` incurs,
 * which matters because these setters fire on every keystroke of a search box.
 */
export function useUrlState<T extends string>(
  key: string,
  fallback: T,
  options: { valid?: readonly T[]; alias?: Readonly<Record<string, T>> } = {},
): [T, (next: T) => void] {
  const searchParams = useSearchParams()
  const { valid, alias } = options

  // Reading through a validator means a hand-edited or stale URL (?tab=deleted)
  // degrades to the fallback instead of rendering an empty screen.
  const fromUrl = useCallback(
    (params: URLSearchParams | null): T => {
      const raw = params?.get(key)
      if (!raw) return fallback
      // Renamed values map old → new, so links shared before a tab was renamed
      // still land on the right place instead of silently falling back.
      const aliased = alias?.[raw]
      if (aliased) return aliased
      if (valid && !valid.includes(raw as T)) return fallback
      return raw as T
    },
    [key, fallback, valid, alias],
  )

  // Local state is the render source of truth so updates are instant, with the
  // URL kept as a mirror. Seeded from the URL, so server and client agree on the
  // first render and hydration stays clean.
  const [value, setValue] = useState<T>(() => fromUrl(searchParams))

  // Follow external URL changes — Back/Forward between entries that differ only
  // by query string, and deep links opened while this component stays mounted.
  const valueRef = useRef(value)
  valueRef.current = value
  useEffect(() => {
    const next = fromUrl(searchParams)
    if (next !== valueRef.current) setValue(next)
  }, [searchParams, fromUrl])

  const set = useCallback(
    (next: T) => {
      setValue(next)
      if (typeof window === "undefined") return
      const params = new URLSearchParams(window.location.search)
      // The default is omitted rather than written, keeping canonical URLs clean
      // (`/feed`, not `/feed?tab=forYou`).
      if (next === fallback) params.delete(key)
      else params.set(key, next)
      const qs = params.toString()
      const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`
      // Preserve Next.js router internals held in history.state.
      window.history.replaceState(window.history.state, "", url)
    },
    [key, fallback],
  )

  return [value, set]
}
