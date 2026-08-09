"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Pencil, Plus, X } from "lucide-react"
import { updateBio } from "@/app/actions/users"
import { cn } from "@/lib/utils"

/** Max number of words allowed in a profile bio (mirrors the server action). */
const BIO_MAX_WORDS = 25

/**
 * Profile bio block. Shows the user's short bio (up to 25 words). On the
 * owner's own profile it becomes an inline editor with a live word counter;
 * other people see read-only text (or nothing when empty).
 */
export function ProfileBio({ bio, editable }: { bio: string | null; editable: boolean }) {
  const router = useRouter()
  const [value, setValue] = useState(bio ?? "")
  const [current, setCurrent] = useState(bio ?? "")
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const words = value.trim().length === 0 ? 0 : value.trim().split(/\s+/).length
  const overLimit = words > BIO_MAX_WORDS

  async function save() {
    if (overLimit) return
    setSaving(true)
    setError(null)
    const res = await updateBio(value)
    setSaving(false)
    if (res.ok) {
      setCurrent(res.bio)
      setValue(res.bio)
      setEditing(false)
      router.refresh()
    } else {
      setError(res.error)
    }
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <div className="relative">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            rows={3}
            placeholder="Write a short bio (up to 25 words)…"
            className="w-full resize-none rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm leading-relaxed outline-none transition-colors focus:border-primary"
            aria-label="Profile bio"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className={cn("text-xs font-medium", overLimit ? "text-destructive" : "text-muted-foreground")}>
            {words}/{BIO_MAX_WORDS} words
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setValue(current)
                setEditing(false)
                setError(null)
              }}
              className="flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" /> Cancel
            </button>
            <button
              onClick={() => void save()}
              disabled={saving || overLimit}
              className="flex h-8 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  // Empty bio: owner gets an "add bio" affordance; visitors see nothing.
  if (!current) {
    if (!editable) return null
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
      >
        <Plus className="size-4" /> Add a bio
      </button>
    )
  }

  return (
    <div className="group/bio flex items-start gap-2">
      <p className="max-w-prose text-pretty text-sm leading-relaxed text-muted-foreground">{current}</p>
      {editable && (
        <button
          onClick={() => setEditing(true)}
          aria-label="Edit bio"
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
      )}
    </div>
  )
}
