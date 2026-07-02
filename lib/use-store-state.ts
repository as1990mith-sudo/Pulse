"use client"

import { useSyncExternalStore } from "react"

// Session-scoped client state for the Store's wishlist and cart. These are
// intentionally ephemeral browser state: the wishlist is a personal shortlist
// and the cart is a pre-checkout staging area. Ownership ("library") is NOT
// stored here — it is the source of truth in Neon (store_purchase) and is read
// per-request via server actions. Using an external store lets every card and
// the product page stay in sync without a provider spanning separate routes.

let version = 0
const wishlist = new Set<string>()
const cart = new Set<string>()
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

// ---- Cart -----------------------------------------------------------------
// The cart holds items the user intends to buy before checkout. Checkout is a
// real server action (purchaseMany) — on success the caller clears the cart.

export function addToCart(id: string) {
  cart.add(id)
  emit()
}

export function removeFromCart(id: string) {
  cart.delete(id)
  emit()
}

export function isInCart(id: string) {
  return cart.has(id)
}

export function cartIds() {
  return Array.from(cart)
}

export function cartCount() {
  return cart.size
}

/** Empty the cart (called after a successful checkout). */
export function clearCart() {
  cart.clear()
  emit()
}

/** Subscribe a component to wishlist/cart changes. */
export function useStoreState() {
  useSyncExternalStore(subscribe, getSnapshot, () => 0)
  return {
    isWishlisted,
    toggleWishlist,
    addToCart,
    removeFromCart,
    isInCart,
    cartIds,
    cartCount,
    clearCart,
  }
}
