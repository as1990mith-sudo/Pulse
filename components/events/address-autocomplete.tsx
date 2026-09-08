"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, MapPin, Check } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { searchAddresses, type AddressSuggestion } from "@/app/actions/geocode"

/**
 * Address field with keyless (OpenStreetMap/Photon) autocomplete. The admin
 * types, picks a suggestion, and we hand the caller back the confirmed formatted
 * address plus its coordinates. Manual free text is still allowed (so an unusual
 * venue can always be entered), but only a picked suggestion carries coordinates
 * — which is what lets the public page point Directions at the exact spot.
 */
export function AddressAutocomplete({
  value,
  confirmed,
  onManualChange,
  onSelect,
  id,
}: {
  value: string
  // True once the current text came from a picked suggestion (has coordinates).
  confirmed: boolean
  // Fired on each keystroke; clears any previously confirmed coordinates.
  onManualChange: (text: string) => void
  // Fired when the admin picks a suggestion from the dropdown.
  onSelect: (s: AddressSuggestion) => void
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<AddressSuggestion[]>([])
  const boxRef = useRef<HTMLDivElement>(null)
  // Guards against a stale in-flight request overwriting a newer one.
  const reqIdRef = useRef(0)
  // Skip the lookup that would otherwise fire immediately after a pick.
  const justPickedRef = useRef(false)

  // Debounced lookup as the query changes.
  useEffect(() => {
    if (justPickedRef.current) {
      justPickedRef.current = false
      return
    }
    const q = value.trim()
    if (q.length < 3) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const myReq = ++reqIdRef.current
    const t = setTimeout(async () => {
      const found = await searchAddresses(q)
      if (myReq !== reqIdRef.current) return // superseded
      setResults(found)
      setLoading(false)
      setOpen(true)
    }, 350)
    return () => clearTimeout(t)
  }, [value])

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  function pick(s: AddressSuggestion) {
    justPickedRef.current = true
    setOpen(false)
    setResults([])
    onSelect(s)
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          value={value}
          autoComplete="off"
          placeholder="Start typing an address…"
          className={cn("pl-9", confirmed && "pr-9")}
          onChange={(e) => onManualChange(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setOpen(true)
          }}
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : confirmed ? (
          <Check className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-primary" />
        ) : null}
      </div>

      {open && results.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1 shadow-lg"
        >
          {results.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => pick(s)}
                className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{s.primary}</span>
                  {s.secondary && (
                    <span className="block truncate text-xs text-muted-foreground">{s.secondary}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
