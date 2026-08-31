"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import { Check, Search } from "lucide-react"
import type { MaterialView } from "@/lib/materials"
import { UploadSheet } from "./upload-primitives"
import { cn } from "@/lib/utils"

/**
 * Admin picker for adding existing materials to a playlist. Receives the set of
 * candidate materials (already filtered to exclude those in the playlist) and
 * returns the selected ids — it never creates or duplicates materials.
 */
export function AddMaterialsSheet({
  open,
  onOpenChange,
  materials,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  materials: MaterialView[]
  onAdd: (ids: number[]) => void
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState("")

  function handleOpenChange(next: boolean) {
    if (!next) {
      setSelected(new Set())
      setQuery("")
    }
    onOpenChange(next)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return materials
    return materials.filter(
      (m) => m.title.toLowerCase().includes(q) || (m.creator ?? "").toLowerCase().includes(q),
    )
  }, [materials, query])

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function confirm() {
    onAdd(Array.from(selected))
    handleOpenChange(false)
  }

  return (
    <UploadSheet
      open={open}
      onOpenChange={handleOpenChange}
      title="Add Materials"
      description="Curate existing materials into this playlist."
      footer={
        <button
          type="button"
          onClick={confirm}
          disabled={selected.size === 0}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
        >
          Add {selected.size > 0 ? selected.size : ""} {selected.size === 1 ? "material" : "materials"}
        </button>
      }
    >
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search materials..."
          className="h-11 w-full rounded-lg border border-border bg-secondary/40 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
        />
      </div>

      {materials.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-10 text-center text-sm text-muted-foreground">
          Every material is already in this playlist.
        </p>
      ) : (
        <div className="space-y-1">
          {filtered.map((m) => {
            const isOn = selected.has(m.id)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors",
                  isOn ? "bg-primary/10" : "hover:bg-secondary",
                )}
              >
                <div className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-md bg-secondary">
                  {m.cover && <Image src={m.cover || "/placeholder.svg"} alt="" fill sizes="80px" className="object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.title}</p>
                  {m.creator && <p className="truncate text-xs text-muted-foreground">{m.creator}</p>}
                </div>
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
                    isOn ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {isOn && <Check className="size-3" />}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </UploadSheet>
  )
}
