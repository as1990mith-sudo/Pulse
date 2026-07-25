"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { searchMentionCandidates } from "@/app/actions/mentions"
import type { ProfileSummary } from "@/lib/profile"
import { getActiveMentionQuery, serializeMentions, type MentionRef } from "@/lib/mentions"

type MentionCandidate = ProfileSummary

/**
 * Shared @mention autocomplete for any plain-text field (post composer, future
 * comments/replies). The host owns the raw human-readable text (`@Name`); this
 * hook watches the caret, resolves candidates, and — on selection — inserts the
 * name and records the { name, userId } pick. At submit time the host calls
 * `serialize()` to turn recorded picks into canonical `@[Name](userId)` tokens.
 */
export function useMentionAutocomplete({
  value,
  onChange,
  textareaRef,
}: {
  value: string
  onChange: (next: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  // Recorded picks (name -> userId). Kept as a list to preserve duplicates of
  // the same name mapping to different users is not supported; last write wins.
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [query, setQuery] = useState<{ text: string; start: number; end: number } | null>(null)
  const [candidates, setCandidates] = useState<MentionCandidate[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)

  // Recompute the active query whenever the value changes or caret moves.
  const refresh = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    const caret = el.selectionStart ?? value.length
    const q = getActiveMentionQuery(value, caret)
    // Normalize to the { text, start, end } shape this hook works with; `end`
    // is the caret so replacement covers exactly the "@query" the user typed.
    setQuery(q ? { text: q.query, start: q.start, end: caret } : null)
    setActiveIndex(0)
  }, [value, textareaRef])

  useEffect(() => {
    if (!query) {
      setCandidates([])
      return
    }
    const id = ++seq.current
    setLoading(true)
    const t = setTimeout(async () => {
      const results = await searchMentionCandidates(query.text)
      // Ignore stale responses (out-of-order resolution).
      if (id !== seq.current) return
      setCandidates(results)
      setLoading(false)
    }, 120)
    return () => clearTimeout(t)
  }, [query])

  const open = query != null && (loading || candidates.length > 0)

  const select = useCallback(
    (candidate: MentionCandidate) => {
      if (!query) return
      const before = value.slice(0, query.start)
      const after = value.slice(query.end)
      // Insert "@Name " and drop the caret just past the trailing space.
      const insert = `@${candidate.name} `
      const next = before + insert + after
      setPicked((prev) => ({ ...prev, [candidate.name]: candidate.id }))
      onChange(next)
      setQuery(null)
      setCandidates([])
      // Restore focus + caret after React commits the new value.
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        const pos = before.length + insert.length
        el.focus()
        el.setSelectionRange(pos, pos)
      })
    },
    [query, value, onChange, textareaRef],
  )

  // Keyboard nav for the dropdown; returns true if the key was consumed.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!open || candidates.length === 0) return false
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % candidates.length)
        return true
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + candidates.length) % candidates.length)
        return true
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        select(candidates[activeIndex])
        return true
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setQuery(null)
        return true
      }
      return false
    },
    [open, candidates, activeIndex, select],
  )

  // Turn recorded picks into canonical token text for storage. Names the user
  // deleted from the text simply fail to match and drop out (serializeMentions
  // is tolerant of that). Returns the token text; the server extracts refs.
  const serialize = useCallback((): string => {
    const refs: MentionRef[] = Object.entries(picked).map(([name, userId]) => ({ name, userId }))
    return serializeMentions(value, refs)
  }, [value, picked])

  const reset = useCallback(() => setPicked({}), [])

  return {
    open,
    candidates,
    activeIndex,
    loading,
    onKeyDown,
    onSelect: select,
    onCaretChange: refresh,
    serialize,
    reset,
  }
}

/** Dropdown list of matching users, rendered below the composer. */
export function MentionAutocompleteList({
  candidates,
  activeIndex,
  loading,
  onSelect,
  // Positioning classes. Defaults to anchoring under a relatively-positioned
  // field (the composer). The rich editor passes its own absolute placement.
  positionClassName = "absolute left-0 right-0 top-full mt-1",
}: {
  candidates: MentionCandidate[]
  activeIndex: number
  loading: boolean
  onSelect: (c: MentionCandidate) => void
  positionClassName?: string
}) {
  const listRef = useRef<HTMLUListElement>(null)

  // Keep the highlighted row scrolled into view during keyboard nav.
  useEffect(() => {
    const li = listRef.current?.children[activeIndex] as HTMLElement | undefined
    li?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  const content = useMemo(() => {
    if (loading && candidates.length === 0) {
      return <li className="px-3 py-2.5 text-sm text-muted-foreground">Searching…</li>
    }
    return candidates.map((c, i) => (
      <li key={c.id}>
        <button
          type="button"
          // Use onMouseDown so the textarea doesn't blur before we insert.
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(c)
          }}
          className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
            i === activeIndex ? "bg-accent" : "hover:bg-accent/60"
          }`}
        >
          <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground">
            {c.image ? (
              <Image src={c.image || "/placeholder.svg"} alt="" fill sizes="36px" className="object-cover" />
            ) : (
              c.initials
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
            {c.handle && <span className="block truncate text-xs text-muted-foreground">@{c.handle}</span>}
          </span>
        </button>
      </li>
    ))
  }, [candidates, activeIndex, loading, onSelect])

  return (
    <ul
      ref={listRef}
      className={`z-30 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover py-1 shadow-lg ${positionClassName}`}
      role="listbox"
      aria-label="Mention suggestions"
    >
      {content}
    </ul>
  )
}
