"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { searchMentionCandidates } from "@/app/actions/mentions"
import type { ProfileSummary } from "@/lib/profile"
import { htmlMentionAnchor } from "@/lib/mentions"
import { MentionAutocompleteList } from "@/components/mention-autocomplete"

type MentionCandidate = ProfileSummary

/**
 * @mention autocomplete for a contentEditable region (the article editor).
 *
 * Unlike the textarea flow — which keeps plain `@Name` text and serializes to
 * tokens on submit — a rich editor inserts the mention as a real inline anchor
 * (`htmlMentionAnchor`) at the caret straight away. The sanitizer preserves
 * these anchors (class="mention" + data-mention-id), and the publish action
 * re-derives the mention list from the saved HTML, so nothing else is needed
 * at save time.
 */
export function useEditableMentionAutocomplete(editorRef: React.RefObject<HTMLDivElement | null>) {
  const [candidates, setCandidates] = useState<MentionCandidate[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  // The Range covering the "@query" text so we can replace exactly it on select.
  const queryRange = useRef<Range | null>(null)
  const seq = useRef(0)

  const close = useCallback(() => {
    setPos(null)
    setCandidates([])
    queryRange.current = null
  }, [])

  // Inspect the caret; if it sits just after an "@query" run, open the picker.
  const detect = useCallback(() => {
    const editor = editorRef.current
    const sel = window.getSelection()
    if (!editor || !sel || sel.rangeCount === 0 || !sel.isCollapsed) return close()

    const range = sel.getRangeAt(0)
    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE || !editor.contains(node)) return close()

    const text = node.textContent ?? ""
    const caret = range.startOffset
    // Walk left for an "@" that starts the query (string start or whitespace).
    let i = caret - 1
    let sawSpace = false
    let at = -1
    while (i >= 0) {
      const ch = text[i]
      if (ch === "@") {
        const before = text[i - 1]
        if (before === undefined || /\s/.test(before)) at = i
        break
      }
      if (ch === "\n") break
      if (/\s/.test(ch)) {
        if (sawSpace) break
        sawSpace = true
      }
      i--
    }
    if (at === -1) return close()

    const query = text.slice(at + 1, caret)
    // Build a range covering "@query" for later replacement.
    const r = document.createRange()
    r.setStart(node, at)
    r.setEnd(node, caret)
    queryRange.current = r

    // Position the dropdown just below the "@".
    const rect = r.getBoundingClientRect()
    const editorRect = editor.getBoundingClientRect()
    setPos({ top: rect.bottom - editorRect.top + 4, left: rect.left - editorRect.left })

    const id = ++seq.current
    setLoading(true)
    setActiveIndex(0)
    searchMentionCandidates(query).then((results) => {
      if (id !== seq.current) return
      setCandidates(results)
      setLoading(false)
    })
  }, [editorRef, close])

  const select = useCallback(
    (candidate: MentionCandidate) => {
      const editor = editorRef.current
      const r = queryRange.current
      if (!editor || !r) return
      const sel = window.getSelection()
      if (!sel) return
      // Select the "@query" text and replace it with the mention anchor plus a
      // trailing space, then drop the caret after the space.
      sel.removeAllRanges()
      sel.addRange(r)
      editor.focus()
      document.execCommand("insertHTML", false, `${htmlMentionAnchor(candidate.id, candidate.name)}&nbsp;`)
      close()
    },
    [editorRef, close],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!pos || candidates.length === 0) return false
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex((n) => (n + 1) % candidates.length)
        return true
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex((n) => (n - 1 + candidates.length) % candidates.length)
        return true
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        select(candidates[activeIndex])
        return true
      }
      if (e.key === "Escape") {
        e.preventDefault()
        close()
        return true
      }
      return false
    },
    [pos, candidates, activeIndex, select, close],
  )

  // Re-detect on selection changes so moving the caret updates/closes the menu.
  useEffect(() => {
    const handler = () => detect()
    document.addEventListener("selectionchange", handler)
    return () => document.removeEventListener("selectionchange", handler)
  }, [detect])

  const open = pos != null && (loading || candidates.length > 0)

  const overlay =
    open && pos ? (
      <div className="absolute z-30 w-64" style={{ top: pos.top, left: pos.left }}>
        {/* Nested relative wrapper so the list's default top-full anchoring
            resolves against this caret-positioned box. */}
        <div className="relative">
          <MentionAutocompleteList
            candidates={candidates}
            activeIndex={activeIndex}
            loading={loading}
            onSelect={select}
            positionClassName="absolute left-0 right-0 top-full"
          />
        </div>
      </div>
    ) : null

  return { onKeyDown, overlay, open }
}
