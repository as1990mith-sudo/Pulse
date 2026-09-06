"use client"

import { useState } from "react"
import { Download, Loader2, Trash2, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { exportMyData } from "@/app/actions/account"
import { DeleteAccountDialog } from "@/components/profile/delete-account-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export function DataControls({ ownedHomes }: { ownedHomes: { id: string; name: string }[] }) {
  const [exporting, setExporting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  async function download() {
    setExporting(true)
    try {
      const res = await exportMyData()
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const blob = new Blob([res.json], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `frequency-data-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success("Your data download has started")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-start gap-3 p-5">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
          <Download className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold leading-tight">Download my data</h2>
          <p className="mt-0.5 text-pretty text-sm leading-relaxed text-muted-foreground">
            A copy of your profile and the content you&apos;ve created.
          </p>
          <div className="mt-3">
            <Button size="sm" variant="secondary" disabled={exporting} onClick={download}>
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Download
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Trash2 className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold leading-tight">Delete my account</h2>
            <p className="mt-0.5 text-pretty text-sm leading-relaxed text-muted-foreground">
              Permanently deletes your individual account and your personal content, and ends your membership
              in every Home. Content belonging to Homes you don&apos;t own is not affected.
            </p>
          </div>
        </div>

        {ownedHomes.length > 0 && (
          <div className="mt-4 rounded-xl bg-destructive/5 p-4 ring-1 ring-destructive/20">
            <p className="flex items-center gap-2 text-sm font-medium text-destructive">
              <TriangleAlert className="size-4 shrink-0" />
              You own {ownedHomes.length === 1 ? "a Home" : `${ownedHomes.length} Homes`}
            </p>
            <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
              Deleting your account also permanently deletes {ownedHomes.length === 1 ? "this Home" : "these Homes"}{" "}
              for all members: {ownedHomes.map((h) => h.name).join(", ")}. Transfer ownership first if you want{" "}
              {ownedHomes.length === 1 ? "it" : "them"} to continue.
            </p>
          </div>
        )}

        <div className="mt-4">
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" />
            Delete my account
          </Button>
        </div>
      </Card>

      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  )
}
