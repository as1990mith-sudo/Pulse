"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Check, Loader2, Pencil, X } from "lucide-react"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"
import { syncUserDisplayName, updateBio } from "@/app/actions/users"
import { updatePhone, type MyAccountInfo } from "@/app/actions/account"
import { AvatarUploadButton } from "@/components/profile/avatar-upload-button"
import { getHandle, getAvatarColor, getInitials } from "@/lib/identity"
import { cn } from "@/lib/utils"

const BIO_MAX_WORDS = 25

function wordCount(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

/**
 * Edits the member's personal identity: photo, name, phone, and bio. Username
 * is derived from the name (read-only) and email is managed in Security, so
 * neither is editable here — that keeps a single source of truth per field and
 * avoids duplicate editors across Account.
 */
export function ProfileEditor({ initial }: { initial: MyAccountInfo }) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [phone, setPhone] = useState(initial.phone ?? "")
  const [bio, setBio] = useState(initial.bio ?? "")

  async function saveName(next: string) {
    const trimmed = next.trim()
    if (!trimmed) return { ok: false as const, error: "Name can't be empty." }
    if (trimmed === name) return { ok: true as const }
    const result = await authClient.updateUser({ name: trimmed })
    if (result.error) return { ok: false as const, error: result.error.message || "Couldn't update your name." }
    await syncUserDisplayName()
    setName(trimmed)
    router.refresh()
    return { ok: true as const }
  }

  async function savePhone(next: string) {
    const res = await updatePhone(next)
    if (!res.ok) return { ok: false as const, error: res.error }
    setPhone(res.phone ?? "")
    return { ok: true as const }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 py-2">
        <AvatarUploadButton
          image={initial.image}
          initials={getInitials(name)}
          color={getAvatarColor(initial.id)}
          name={name}
          sizeClass="size-24 text-3xl"
        />
        <p className="text-sm text-muted-foreground">Tap to change your photo</p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
        <div className="flex flex-col divide-y divide-border/60">
          <InlineField label="Name" value={name} onSave={saveName} maxLength={50} autoCapitalize="words" />

          <ReadOnlyField label="Username" value={getHandle(name)} />

          <ReadOnlyField
            label="Email"
            value={initial.email}
            action={
              <Link href="/account/security" className="text-sm font-medium text-primary hover:underline">
                Change
              </Link>
            }
          />

          <InlineField
            label="Phone"
            value={phone}
            placeholder="Not set"
            onSave={savePhone}
            inputMode="tel"
            maxLength={32}
          />

          <BioField
            value={bio}
            onSave={async (next) => {
              const res = await updateBio(next)
              if (!res.ok) return { ok: false, error: res.error }
              setBio(res.bio)
              return { ok: true }
            }}
          />
        </div>
      </div>
    </div>
  )
}

type SaveResult = { ok: true } | { ok: false; error: string }

function RowShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <span className="w-20 shrink-0 text-sm font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function ReadOnlyField({ label, value, action }: { label: string; value: string; action?: React.ReactNode }) {
  return (
    <RowShell label={label}>
      <span className="min-w-0 flex-1 truncate text-[15px] text-foreground">{value}</span>
      {action}
    </RowShell>
  )
}

function InlineField({
  label,
  value,
  placeholder,
  onSave,
  maxLength,
  inputMode,
  autoCapitalize,
}: {
  label: string
  value: string
  placeholder?: string
  onSave: (next: string) => Promise<SaveResult>
  maxLength?: number
  inputMode?: "text" | "tel"
  autoCapitalize?: "none" | "words"
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  function begin() {
    setDraft(value)
    setEditing(true)
  }

  async function commit() {
    setSaving(true)
    const res = await onSave(draft)
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(`${label} updated`)
    setEditing(false)
  }

  if (editing) {
    return (
      <RowShell label={label}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          maxLength={maxLength}
          inputMode={inputMode}
          autoCapitalize={autoCapitalize}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) void commit()
            if (e.key === "Escape") setEditing(false)
          }}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-[15px] outline-none focus:border-primary"
          aria-label={label}
        />
        <button
          type="button"
          onClick={() => void commit()}
          disabled={saving}
          aria-label={`Save ${label}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label="Cancel"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground"
        >
          <X className="size-4" />
        </button>
      </RowShell>
    )
  }

  return (
    <RowShell label={label}>
      <button
        type="button"
        onClick={begin}
        className="group flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[15px]",
            value ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {value || placeholder}
        </span>
        <Pencil className="size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
      </button>
    </RowShell>
  )
}

function BioField({ value, onSave }: { value: string; onSave: (next: string) => Promise<SaveResult> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const words = wordCount(draft)
  const over = words > BIO_MAX_WORDS

  async function commit() {
    if (over) return
    setSaving(true)
    const res = await onSave(draft)
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("Bio updated")
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 px-4 py-3.5">
        <span className="text-sm font-medium text-muted-foreground">Bio</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[15px] leading-relaxed outline-none focus:border-primary"
          aria-label="Bio"
        />
        <div className="flex items-center justify-between">
          <span className={cn("text-xs", over ? "text-destructive" : "text-muted-foreground")}>
            {words}/{BIO_MAX_WORDS} words
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void commit()}
              disabled={saving || over}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-4 px-4 py-3.5">
      <span className="w-20 shrink-0 pt-0.5 text-sm font-medium text-muted-foreground">Bio</span>
      <button type="button" onClick={() => setEditing(true)} className="group flex min-w-0 flex-1 items-start gap-2 text-left">
        <span className={cn("min-w-0 flex-1 text-pretty text-[15px] leading-relaxed", value ? "text-foreground" : "text-muted-foreground")}>
          {value || "Add a short bio"}
        </span>
        <Pencil className="mt-0.5 size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
      </button>
    </div>
  )
}
