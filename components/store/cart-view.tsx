"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Check, Loader2, ShoppingBag, ShoppingCart, Trash2 } from "lucide-react"
import { getBook, getCourse, formatPrice, type Book, type Course } from "@/lib/store-data"
import { useStoreState } from "@/lib/use-store-state"
import { cn } from "@/lib/utils"

type CartEntry = Book | Course

export function CartView() {
  const { cartIds, removeFromCart, checkoutCart } = useStoreState()
  const [status, setStatus] = useState<"idle" | "processing">("idle")
  const [done, setDone] = useState(false)

  const ids = cartIds()
  const items = useMemo(
    () =>
      ids
        .map((id) => getBook(id) ?? getCourse(id))
        .filter((p): p is CartEntry => !!p),
    [ids],
  )

  const total = items.reduce((sum, p) => sum + p.price, 0)

  function checkout() {
    if (status === "processing" || items.length === 0) return
    setStatus("processing")
    // Simulated checkout — real payment is wired in a later pass.
    setTimeout(() => {
      checkoutCart()
      setStatus("idle")
      setDone(true)
    }, 1200)
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6 sm:px-6">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <ShoppingCart className="size-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Your Cart</h1>
          <p className="text-sm text-muted-foreground">
            {items.length > 0
              ? `${items.length} item${items.length === 1 ? "" : "s"} ready for checkout`
              : "Items you add to cart live here"}
          </p>
        </div>
      </header>

      {done ? (
        <CheckoutSuccess />
      ) : items.length === 0 ? (
        <EmptyCart />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {items.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3"
              >
                <Link
                  href={`/store/${p.type === "course" ? "course" : "book"}/${p.id}`}
                  className="relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={(p.type === "course" ? p.thumbnail : p.cover) || "/placeholder.svg"}
                    alt=""
                    className="size-full object-cover"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/store/${p.type === "course" ? "course" : "book"}/${p.id}`}
                    className="block truncate text-sm font-semibold text-foreground"
                  >
                    {p.title}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.type === "course" ? p.instructor : p.author}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{formatPrice(p.price)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFromCart(p.id)}
                  aria-label={`Remove ${p.title} from cart`}
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>

          {/* Sticky checkout summary */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 pb-safe-2 pt-3 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold text-foreground">{formatPrice(total)}</p>
              </div>
              <button
                type="button"
                onClick={checkout}
                disabled={status === "processing"}
                className={cn(
                  "flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-elevated transition-transform active:scale-[0.98] disabled:opacity-80",
                )}
              >
                {status === "processing" ? (
                  <>
                    <Loader2 className="size-5 animate-spin" />
                    Processing…
                  </>
                ) : (
                  <>
                    <Check className="size-5" />
                    {total === 0 ? "Get all for free" : `Checkout · ${formatPrice(total)}`}
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function EmptyCart() {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-secondary/20 px-6 py-20 text-center">
      <span className="mb-4 flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary">
        <ShoppingCart className="size-8" />
      </span>
      <h2 className="text-lg font-semibold text-foreground">Your cart is empty</h2>
      <p className="mt-1 max-w-xs text-pretty text-sm text-muted-foreground">
        Add books and courses from the Store and they will wait here until you&apos;re ready to check out.
      </p>
      <Link
        href="/store"
        className="mt-5 flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-elevated transition-transform active:scale-[0.98]"
      >
        <ShoppingBag className="size-4" />
        Browse the Store
      </Link>
    </div>
  )
}

function CheckoutSuccess() {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-border/60 bg-secondary/20 px-6 py-20 text-center">
      <span className="mb-4 flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary motion-pop">
        <Check className="size-8" />
      </span>
      <h2 className="text-lg font-semibold text-foreground">Purchase complete</h2>
      <p className="mt-1 max-w-xs text-pretty text-sm text-muted-foreground">
        Everything in your cart is now in your library, ready to read and learn.
      </p>
      <Link
        href="/library"
        className="mt-5 flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-elevated transition-transform active:scale-[0.98]"
      >
        Go to Library
      </Link>
    </div>
  )
}
