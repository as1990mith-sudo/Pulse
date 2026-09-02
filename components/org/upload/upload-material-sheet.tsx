"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, FileText, ImagePlus, Link2, Loader2, Sparkles, Wand2 } from "lucide-react"
import {
  type MaterialContentType,
  type MaterialSource,
  CONTENT_TYPE_LABELS,
  detectSource,
  normalizeTags,
} from "@/lib/materials"
import { createMaterial, recognizeResource, updateMaterial } from "@/app/actions/materials"
import { compressImage, uploadMedia } from "@/lib/upload-media"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Field, SourceBadge, Thumbnail, UploadSheet } from "./upload-primitives"

type Draft = {
  url: string
  title: string
  creator: string
  description: string
  contentType: MaterialContentType
  category: string
  duration: string
  tags: string
  cover: string | null
  source: MaterialSource
  resourceDate: string // yyyy-mm-dd
}

function emptyDraft(): Draft {
  return {
    url: "",
    title: "",
    creator: "",
    description: "",
    contentType: "video",
    category: "",
    duration: "",
    tags: "",
    cover: null,
    source: "other",
    resourceDate: new Date().toISOString().slice(0, 10),
  }
}

/** Upload a new material, or edit an existing one when `editing` is provided. */
export function UploadMaterialSheet({
  organizationId,
  open,
  onOpenChange,
  editing,
}: {
  organizationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  editing?: {
    id: number
    url: string
    title: string
    creator: string | null
    description: string | null
    contentType: MaterialContentType
    category: string | null
    duration: string | null
    tags: string[]
    cover: string | null
    source: MaterialSource
    resourceDateMs: number | null
  } | null
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [recognizing, setRecognizing] = useState(false)
  const [recognized, setRecognized] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  // Separate flag + input for the optional cover-image upload, so it can't be
  // confused with the PDF uploader above.
  const [uploadingThumb, setUploadingThumb] = useState(false)
  const lastRecognizedUrl = useRef<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const thumbInputRef = useRef<HTMLInputElement>(null)

  // Seed / reset whenever the sheet opens.
  useEffect(() => {
    if (!open) return
    if (editing) {
      setDraft({
        url: editing.url,
        title: editing.title,
        creator: editing.creator ?? "",
        description: editing.description ?? "",
        contentType: editing.contentType,
        category: editing.category ?? "",
        duration: editing.duration ?? "",
        tags: editing.tags.join(", "),
        cover: editing.cover,
        source: editing.source,
        resourceDate: editing.resourceDateMs
          ? new Date(editing.resourceDateMs).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      })
      setRecognized(true)
      lastRecognizedUrl.current = editing.url
    } else {
      setDraft(emptyDraft())
      setRecognized(false)
      lastRecognizedUrl.current = ""
    }
    setError(null)
    setUploadedFileName(null)
  }, [open, editing])

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function recognize(url: string) {
    const trimmed = url.trim()
    if (!trimmed || trimmed === lastRecognizedUrl.current) return
    lastRecognizedUrl.current = trimmed
    setRecognizing(true)
    setError(null)
    try {
      const r = await recognizeResource(trimmed)
      setDraft((d) => ({
        ...d,
        // Never overwrite text the admin already edited by hand.
        title: d.title || r.title,
        creator: d.creator || r.creator,
        description: d.description || r.description,
        duration: d.duration || r.duration,
        cover: d.cover || (r.thumbnail || null),
        source: r.source,
        contentType: d.contentType === "video" ? r.contentType : d.contentType,
      }))
      setRecognized(true)
    } catch {
      setDraft((d) => ({ ...d, source: detectSource(trimmed) }))
      setRecognized(true)
    } finally {
      setRecognizing(false)
    }
  }

  // Upload a PDF straight from the uploader's device. Frequency stores no media
  // itself, but a locally-hosted PDF has no external home to link to, so it's
  // the one resource we push to Blob (under the `catalogue/` prefix) and then
  // treat exactly like any other material — its Blob URL becomes the link.
  async function onPickFile(file: File) {
    setError(null)
    if (file.type !== "application/pdf") {
      setError("Please choose a PDF file.")
      return
    }
    // 25 MB ceiling keeps documents reasonable for in-app viewing.
    if (file.size > 25 * 1024 * 1024) {
      setError("That PDF is over 25MB. Please upload a smaller file.")
      return
    }
    setUploadingFile(true)
    try {
      const { url } = await uploadMedia(file, "catalogue")
      const niceName = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim()
      lastRecognizedUrl.current = url // suppress link-recognition for this url
      setDraft((d) => ({
        ...d,
        url,
        source: "other",
        contentType: "article",
        title: d.title || niceName,
      }))
      setUploadedFileName(file.name)
      setRecognized(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload that PDF.")
    } finally {
      setUploadingFile(false)
    }
  }

  // Optional manual cover. Auto-recognition fills `draft.cover` for most links,
  // but plain articles / Drive files / bare PDFs often have no thumbnail — this
  // lets the uploader supply one from their device. The image is compressed and
  // pushed to Blob (same `catalogue/` prefix as PDFs), and its URL becomes the
  // material's cover, flowing through the existing save payload unchanged.
  async function onPickThumbnail(file: File) {
    setError(null)
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file for the thumbnail.")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("That image is over 10MB. Please choose a smaller one.")
      return
    }
    setUploadingThumb(true)
    try {
      const compressed = await compressImage(file)
      const { url } = await uploadMedia(compressed, "catalogue")
      setDraft((d) => ({ ...d, cover: url }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload that thumbnail.")
    } finally {
      setUploadingThumb(false)
    }
  }

  async function save() {
    setError(null)
    if (!draft.url.trim()) {
      setError("Please paste a link to the resource.")
      return
    }
    if (!draft.title.trim()) {
      setError("Please give the material a title.")
      return
    }
    setSaving(true)
    try {
      const payload = {
        organizationId,
        url: draft.url,
        title: draft.title,
        creator: draft.creator || null,
        description: draft.description || null,
        contentType: draft.contentType,
        category: draft.category || null,
        duration: draft.duration || null,
        tags: normalizeTags(draft.tags),
        cover: draft.cover,
        source: draft.source,
        resourceDate: draft.resourceDate || null,
      }
      if (editing) {
        await updateMaterial({ ...payload, id: editing.id })
      } else {
        await createMaterial(payload)
      }
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the material.")
    } finally {
      setSaving(false)
    }
  }

  const showForm = recognized || Boolean(editing) || draft.title.length > 0

  return (
    <UploadSheet
      open={open}
      onOpenChange={saving || uploadingFile ? () => {} : onOpenChange}
      title={editing ? "Edit material" : "Upload material"}
      description={
        editing
          ? "Update the details for this resource."
          : "Paste a link and we'll pull in the details automatically — or upload a PDF from your device."
      }
      footer={
        <>
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button className="rounded-full" onClick={save} disabled={saving || recognizing}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : editing ? "Save changes" : "Add material"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Link field with an explicit Recognise action */}
        <Field label="Resource link" hint="YouTube, Spotify, Vimeo, Drive…">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={draft.url}
                inputMode="url"
                autoFocus={!editing}
                onChange={(e) => set("url", e.target.value)}
                onBlur={(e) => !editing && recognize(e.target.value)}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData("text")
                  if (pasted) setTimeout(() => recognize(pasted), 0)
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return
                  e.preventDefault()
                  recognize(draft.url)
                }}
                placeholder="https://…"
                className="pl-9"
                aria-label="Resource link"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="rounded-xl"
              onClick={() => recognize(draft.url)}
              disabled={recognizing || !draft.url.trim()}
            >
              {recognizing ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              <span className="hidden sm:inline">Recognise</span>
            </Button>
          </div>
        </Field>

        {/* Or upload a PDF straight from the device (creation only) */}
        {!editing && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">or</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onPickFile(file)
                e.target.value = "" // allow re-picking the same file
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center gap-2 rounded-xl border-dashed"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
            >
              {uploadingFile ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              {uploadingFile ? "Uploading…" : uploadedFileName ? "Replace PDF" : "Upload a PDF from your device"}
            </Button>
            {uploadedFileName && !uploadingFile && (
              <p className="flex items-center gap-1.5 text-xs text-primary">
                <Check className="size-3.5" /> {uploadedFileName}
              </p>
            )}
          </div>
        )}

        {/* Preview */}
        {(draft.cover || recognized) && (
          <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-3">
            <Thumbnail
              cover={draft.cover}
              title={draft.title}
              contentType={draft.contentType}
              className="aspect-video w-28 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <SourceBadge source={draft.source} contentType={draft.contentType} className="bg-secondary" />
              <p className="mt-1.5 line-clamp-2 text-sm font-medium text-foreground">
                {draft.title || "Untitled resource"}
              </p>
              {recognized && !recognizing && draft.cover && (
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-primary">
                  <Sparkles className="size-3" /> Details detected
                </p>
              )}
              {/* Manual cover: offered when recognition found no thumbnail, and
                  as a "Change" affordance when one exists. */}
              <input
                ref={thumbInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onPickThumbnail(file)
                  e.target.value = ""
                }}
              />
              <button
                type="button"
                onClick={() => thumbInputRef.current?.click()}
                disabled={uploadingThumb}
                className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
              >
                {uploadingThumb ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <ImagePlus className="size-3" />
                )}
                {uploadingThumb ? "Uploading…" : draft.cover ? "Change thumbnail" : "Upload a thumbnail"}
              </button>
            </div>
          </div>
        )}

        {showForm && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-1 duration-300">
            <Field label="Title">
              <Input value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Walking in Faith" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <Select value={draft.contentType} onValueChange={(v) => set("contentType", v as MaterialContentType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CONTENT_TYPE_LABELS) as MaterialContentType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {CONTENT_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Duration" hint="optional">
                <Input value={draft.duration} onChange={(e) => set("duration", e.target.value)} placeholder="48:21" />
              </Field>
            </div>

            <Field label="Speaker / author" hint="optional">
              <Input value={draft.creator} onChange={(e) => set("creator", e.target.value)} placeholder="e.g. Pastor John Smith" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Category" hint="optional">
                <Input value={draft.category} onChange={(e) => set("category", e.target.value)} placeholder="Sunday Messages" />
              </Field>
              <Field label="Date">
                <Input type="date" value={draft.resourceDate} onChange={(e) => set("resourceDate", e.target.value)} />
              </Field>
            </div>

            <Field label="Tags" hint="comma separated">
              <Input value={draft.tags} onChange={(e) => set("tags", e.target.value)} placeholder="faith, prayer, worship" />
            </Field>

            <Field label="Description" hint="optional">
              <Textarea
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
                rows={3}
                placeholder="What is this about?"
              />
            </Field>
          </div>
        )}

        {error && (
          <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {recognized && !error && !editing && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="size-3.5 text-primary" /> Review the details, then add to your catalogue.
          </p>
        )}
      </div>
    </UploadSheet>
  )
}
