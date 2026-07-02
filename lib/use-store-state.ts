"use client"

import { useSyncExternalStore } from "react"

// Lightweight, session-scoped client state for the Store's wishlist and the
// user's owned/purchased library. This is intentionally in-memory for now — it
// resets on reload and will be replaced by real persistence (Neon) in a later
// pass. Using an external store lets every card + the product page stay in sync
// without threading a provider through separate routes.

let version = 0
const wishlist = new Set<string>()
const library = new Set<string>()
const listeners = new Set<() => void>()

function emit() {
  version++
  for (const l of listeners) l()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getSnapshot() {
  return version
}

export function toggleWishlist(id: string) {
  if (wishlist.has(id)) wishlist.delete(id)
  else wishlist.add(id)
  emit()
}

export function isWishlisted(id: string) {
  return wishlist.has(id)
}

export function addToLibrary(id: string) {
  library.add(id)
  emit()
}

export function isInLibrary(id: string) {
  return library.has(id)
}

export function libraryIds() {
  return Array.from(library)
}

/** Subscribe a component to wishlist/library changes. */
export function useStoreState() {
  useSyncExternalStore(subscribe, getSnapshot, () => 0)
  return { isWishlisted, isInLibrary, toggleWishlist, addToLibrary, libraryIds }
}
