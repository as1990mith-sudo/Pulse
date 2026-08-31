"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, Check, Loader2, Wand2 } from "lucide-react"
import { type ImportedLink, createMaterialsBulk, recognizeMany } from "@/app/actions/materials"
import { type SaveMaterialInput } from "@/app/actions/materials"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { Field, SourceBadge, Thumbnail, UploadSheet } from "./upload-primitives"

type Row = ImportedLink & { selected: boolean; title: string }

export function ImportLinksSheet({
  organizationId,
  open,
  onOpenChange,
}: {
  organizationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [raw, setRaw] = useState("")
  const [rows, setRows] = useState<Row[]>([])
  const [recognizing, setRecognizing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) return
    // Reset when closed.
    setRaw("")
    setRows([])
    setError(null)
    setSaving(false)
  }, [open])

  const urls = raw
    .split(/[\n,\s]+/)
    .map((u) => u.trim())
    .filter(Boolean)

  async function recognize() {
    if (urls.length === 0) return
    setRecognizing(true)
    setError(null)
    try {
      const results = await recognizeMany(urls)
      setRows(
        results.map((r) => ({
          ...r,
          selected: r.status === "ready",
          title: r.recognized?.title || r.url.replace(/^https?:\/\//, "").slice(0, 60),
        })),
      )
    } catch {
      setError("Couldn't read those links. Please check them and try again.")
    } finally {
      setRecognizing(false)
    }
  }

  async function importSelected() {
    const chosen = rows.filter((r) => r.selected)
    if (chosen.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const inputs: SaveMaterialInput[] = chosen.map((r) => ({
        organizationId,
        url: r.url,
        title: r.title.trim() || "Untitled resource",
        creator: r.recognized?.creator || null,
        description: r.recognized?.description || null,
        contentType: r.recognized?.contentType ?? "video",
        cover: r.recognized?.thumbnail || null,
        duration: r.recognized?.duration || null,
        source: r.recognized?.source,
      }))
      await createMaterialsBulk(inputs)
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't import those links.")
    } finally {
      setSaving(false)
    }
  }

  const selectedCount = rows.filter((r) => r.selected).length
  const hasResults = rows.length > 0

  return (
    <UploadSheet
      open={open}
      onOpenChange={saving ? () => {} : onOpenChange}
      title="Import links"
      description="Paste multiple links at once — one per line. We'll recognise each and let you choose which to add."
      footer={
        hasResults ? (
          <>
            <Button variant="outline" className="rounded-full" onClick={() => setRows([])} disabled={saving}>
              Back
            </Button>
            <Button className="rounded-full" onClick={importSelected} disabled={saving || selectedCount === 0}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : `Import ${selectedCount || ""}`.trim()}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={recognize} disabled={recognizing || urls.length === 0}>
              {recognizing ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              Recognise {urls.length || ""}
            </Button>
          </>
        )
      }
    >
      {!hasResults ? (
        <Field label="Links" hint={`${urls.length} detected`}>
          <Textarea
            value={raw}
            autoFocus
            onChange={(e) => setRaw(e.target.value)}
            rows={8}
            placeholder={"https://youtube.com/watch?v=…\nhttps://open.spotify.com/episode/…\nhttps://vimeo.com/…"}
            className="font-mono text-xs"
          />
        </Field>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, i) => (
            <li
              key={row.url}
              className={cn(
                "flex items-center gap-3 rounded-2xl border p-2.5 transition-colors",
                row.selected ? "border-primary/50 bg-primary/5" : "border-border/60 bg-card/40",
                row.status === "unsupported" && "opacity-70",
              )}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={row.selected}
                aria-label={`Include ${row.title}`}
                onClick={() =>
                  setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, selected: !r.selected } : r)))
                }
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                  row.selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {row.selected && <Check className="size-3.5" />}
              </button>
              <Thumbnail
                cover={row.recognized?.thumbnail || null}
                title={row.title}
                contentType={row.recognized?.contentType ?? "resource"}
                className="aspect-video w-16 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <input
                  value={row.title}
                  onChange={(e) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, title: e.target.value } : r)))}
                  aria-label="Title"
                  className="w-full truncate bg-transparent text-sm font-medium text-foreground outline-none"
                />
                {row.recognized && (
                  <SourceBadge
                    source={row.recognized.source}
                    contentType={row.recognized.contentType}
                    className="mt-0.5 bg-transparent px-0"
                  />
                )}
                {row.status === "unsupported" && (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <AlertCircle className="size-3" /> Couldn&apos;t detect details — it&apos;ll still be added as a link.
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </UploadSheet>
  )
}
