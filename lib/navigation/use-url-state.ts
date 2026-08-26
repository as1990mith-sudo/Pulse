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

  // `valid` and `alias` are read through a ref rather than closed over, so that
  // callers can pass inline literals (`alias: { anonymous: "thread" }`) without
  // breaking this hook.
  //
  // This is load-bearing, not tidying. `fromUrl` feeds the URL-sync effect
  // below, and listing these objects as deps made `fromUrl` — and therefore the
  // effect — fire on EVERY render for any caller that didn't hoist them to a
  // module constant. `set` updates the URL via `replaceState`, which reaches
  // `useSearchParams` a beat later, so that extra run read a STALE `searchParams`
  // and immediately overwrote the value the user had just chosen. The tab
  // snapped back and the whole bar looked unresponsive, while the URL showed the
  // new tab. Depending only on primitives keeps the effect tied to real URL
  // changes (Back/Forward, deep links), which is all it was ever for.
  const optionsRef = useRef(options)
  optionsRef.current = options

  // Reading through a validator means a hand-edited or stale URL (?tab=deleted)
  // degrades to the fallback instead of rendering an empty screen.
  const fromUrl = useCallback(
    (params: URLSearchParams | null): T => {
      const raw = params?.get(key)
      if (!raw) return fallback
      const { valid, alias } = optionsRef.current
      // Renamed values map old → new, so links shared before a tab was renamed
      // still land on the right place instead of silently falling back.
      const aliased = alias?.[raw]
      if (aliased) return aliased
      if (valid && !valid.includes(raw as T)) return fallback
      return raw as T
    },
    [key, fallback],
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
