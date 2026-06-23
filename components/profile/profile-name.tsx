"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Check, X, Loader2 } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { syncUserDisplayName } from "@/app/actions/users"

/**
 * Renders the profile display name. On the user's own profile a pencil button
 * reveals an inline editor that persists the new name via Better Auth.
 */
export function ProfileName({
  name,
  editable,
}: {
  name: string
  editable: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const next = value.trim()
    if (!next) {
      setError("Name can't be empty.")
      return
    }
    if (next === name) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await authClient.updateUser({ name: next })
      if (result.error) throw new Error(result.error.message || "Could not update your name.")
      // Propagate the new name to all past posts, comments, messages, etc.
      await syncUserDisplayName()
      setEditing(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.")
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            maxLength={50}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save()
              if (e.key === "Escape") {
                setValue(name)
                setEditing(false)
              }
            }}
            className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-1.5 text-2xl font-bold tracking-tight outline-none focus:border-primary sm:text-3xl"
            aria-label="Display name"
          />
          <button
            onClick={() => void save()}
            disabled={saving}
            aria-label="Save name"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          </button>
          <button
            onClick={() => {
              setValue(name)
              setEditing(false)
              setError(null)
            }}
            aria-label="Cancel"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/70"
          >
            <X className="size-4" />
          </button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{name}</h1>
        {editable && (
          <button
            onClick={() => setEditing(true)}
            aria-label="Edit display name"
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}
