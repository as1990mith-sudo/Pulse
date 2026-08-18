"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Loader2 } from "lucide-react"
import { deleteMyAccount } from "@/app/actions/account"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const CONFIRM_WORD = "DELETE"

/**
 * Controlled confirmation dialog for permanent account deletion. The user must
 * type DELETE to enable the button, guarding an irreversible action against an
 * accidental tap. On success it signs the user out and returns them to the
 * onboarding screen.
 */
export function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [confirmText, setConfirmText] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canDelete = confirmText.trim().toUpperCase() === CONFIRM_WORD && !pending

  function handleOpenChange(next: boolean) {
    if (pending) return
    if (!next) {
      setConfirmText("")
      setError(null)
    }
    onOpenChange(next)
  }

  async function handleDelete() {
    if (!canDelete) return
    setPending(true)
    setError(null)
    try {
      await deleteMyAccount()
      await authClient.signOut()
      router.push("/")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </span>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription className="text-pretty">
            This permanently deletes your account and all of your content. Any Home you own will be deleted for its
            members too. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor="confirm-delete" className="text-sm text-muted-foreground">
            {"Type "}
            <span className="font-semibold text-foreground">{CONFIRM_WORD}</span>
            {" to confirm."}
          </label>
          <Input
            id="confirm-delete"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_WORD}
            autoComplete="off"
            autoCapitalize="characters"
            disabled={pending}
            aria-invalid={!!error}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={!canDelete}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Deleting…
              </>
            ) : (
              "Delete account"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
