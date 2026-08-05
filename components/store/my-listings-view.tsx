"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, BookOpen, GraduationCap, Loader2, Plus, Store, Trash2, TriangleAlert } from "lucide-react"
import type { StoreProduct } from "@/lib/store-data"
import { formatPrice } from "@/lib/store-data"
import { deleteProduct } from "@/app/actions/store"
import { cn } from "@/lib/utils"

export function MyListingsView({ listings }: { listings: StoreProduct[] }) {
  const [items, setItems] = useState(listings)
  const [pending, setPending] = useState<StoreProduct | null>(null)

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <Link
        href="/store"
        className="tap-scale mb-4 flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Store
      </Link>

      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Store className="size-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Your listings</h1>
            <p className="text-sm text-muted-foreground">
              {items.length > 0
                ? `${items.length} item${items.length === 1 ? "" : "s"} you've published`
                : "Books & courses you publish appear here"}
            </p>
          </div>
        </div>
        <Link
          href="/store/publish"
          className="tap-scale flex shrink-0 items-center gap-1.5 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-elevated"
        >
          <Plus className="size-4" />
          Sell
        </Link>
      </header>

      {items.length === 0 ? (
        <EmptyListings />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <ListingRow key={item.id} item={item} onDelete={() => setPending(item)} />
          ))}
        </ul>
      )}

      {pending && (
        <ConfirmDelete
          item={pending}
          onClose={() => setPending(null)}
          onDeleted={(id) => {
            setItems((prev) => prev.filter((p) => p.id !== id))
            setPending(null)
          }}
        />
      )}
    </div>
  )
}

function ListingRow({ item, onDelete }: { item: StoreProduct; onDelete: () => void }) {
  const isCourse = item.type === "course"
  const cover = isCourse ? item.thumbnail : item.cover
  const meta = isCourse ? item.instructor : item.author
  const href = `/store/${item.type}/${item.id}`
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-soft">
      <Link href={href} className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover || "/placeholder.svg"} alt="" className="size-full object-cover" />
      </Link>
      <Link href={href} className="min-w-0 flex-1">
        <span
          className={cn(
            "mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            isCourse ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground",
          )}
        >
          {isCourse ? <GraduationCap className="size-3" /> : <BookOpen className="size-3" />}
          {isCourse ? "Course" : "Book"}
        </span>
        <h3 className="line-clamp-1 text-sm font-semibold text-foreground">{item.title}</h3>
        <p className="truncate text-xs text-muted-foreground">
          {formatPrice(item.price)} · {item.category} · {meta}
        </p>
      </Link>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${item.title}`}
        className="tap-scale flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-secondary/40 text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-5" />
      </button>
    </li>
  )
}

function ConfirmDelete({
  item,
  onClose,
  onDeleted,
}: {
  item: StoreProduct
  onClose: () => void
  onDeleted: (id: string) => void
}) {
  const router = useRouter()
  const [status, setStatus] = useState<"idle" | "deleting">("idle")

  async function confirm() {
    setStatus("deleting")
    try {
      await deleteProduct(item.id)
      onDeleted(item.id)
      router.refresh()
    } catch (err) {
      console.log("[v0] delete failed:", err instanceof Error ? err.message : err)
      alert(err instanceof Error ? err.message : "Could not delete this listing.")
      setStatus("idle")
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-background/60 p-4 backdrop-blur-md animate-in fade-in duration-200 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-border/60 bg-popover p-6 text-center shadow-floating animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <TriangleAlert className="size-7" />
        </span>
        <h2 className="text-lg font-semibold text-foreground">Delete this listing?</h2>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">
          {`"${item.title}" will be removed from the Store. Anyone who bought it will lose access. This can't be undone.`}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={status === "deleting"}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-destructive text-base font-semibold text-destructive-foreground transition-transform active:scale-[0.98] disabled:opacity-80"
          >
            {status === "deleting" ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 className="size-5" />
                Delete listing
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={status === "deleting"}
            className="flex h-12 items-center justify-center rounded-2xl border border-border/60 bg-secondary/40 text-base font-semibold text-foreground transition-transform active:scale-[0.98]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyListings() {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-secondary/20 px-6 py-20 text-center">
      <span className="mb-4 flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Store className="size-8" />
      </span>
      <h2 className="text-lg font-semibold text-foreground">No listings yet</h2>
      <p className="mt-1 max-w-xs text-pretty text-sm text-muted-foreground">
        Publish a book or course to start selling. Your published items will show up here to manage.
      </p>
      <Link
        href="/store/publish"
        className="mt-5 flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-elevated transition-transform active:scale-[0.98]"
      >
        <Plus className="size-4" />
        Publish something
      </Link>
    </div>
  )
}
