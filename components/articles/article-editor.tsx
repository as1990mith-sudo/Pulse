"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Bold,
  Italic,
  Underline,
  Heading2,
  Heading3,
  Quote,
  List,
  ListOrdered,
  Link2,
  ImageIcon,
  BookOpen,
  Loader2,
  Eye,
  X,
} from "lucide-react"
import { ARTICLE_CATEGORIES } from "@/lib/article-types"
import { saveArticle, publishArticle } from "@/app/actions/articles"
import { uploadMedia } from "@/lib/upload-media"
import { cn } from "@/lib/utils"

type EditorSeed = {
  id?: string
  title: string
  category: string
  tags: string[]
  coverUrl: string | null
  bodyHtml: string
  status: "draft" | "published" | "archived"
}

export function ArticleEditor({ seed }: { seed?: EditorSeed }) {
  const router = useRouter()
  const editorRef = useRef<HTMLDivElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const bodyImageInputRef = useRef<HTMLInputElement>(null)

  const [articleId, setArticleId] = useState<string | undefined>(seed?.id)
  const [title, setTitle] = useState(seed?.title ?? "")
  const [category, setCategory] = useState(seed?.category ?? "General")
  const [tagsText, setTagsText] = useState((seed?.tags ?? []).join(", "))
  const [coverUrl, setCoverUrl] = useState<string | null>(seed?.coverUrl ?? null)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [preview, setPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState("")
  const [saving, startSaving] = useTransition()
  const [publishing, startPublishing] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)
  // Tracks unsaved edits so leaving the page can prompt to save or discard.
  const [dirty, setDirty] = useState(false)
  const [confirmBack, setConfirmBack] = useState(false)

  // Seed the contentEditable body once on mount.
  useEffect(() => {
    if (editorRef.current && seed?.bodyHtml) {
      editorRef.current.innerHTML = seed.bodyHtml
    }
  }, [seed?.bodyHtml])

  function exec(command: string, value?: string) {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
  }

  function formatBlock(tag: string) {
    exec("formatBlock", tag)
  }

  function insertVerse() {
    editorRef.current?.focus()
    const html =
      '<blockquote class="verse">"For God so loved the world…" — John 3:16</blockquote><p><br/></p>'
    document.execCommand("insertHTML", false, html)
    setDirty(true)
  }

  function addLink() {
    const url = window.prompt("Link URL")
    if (url) exec("createLink", url)
  }

  async function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCover(true)
    try {
      const { url } = await uploadMedia(file, "covers")
      setCoverUrl(url)
      setDirty(true)
    } catch {
      setError("Cover upload failed. Try again.")
    } finally {
      setUploadingCover(false)
      if (coverInputRef.current) coverInputRef.current.value = ""
    }
  }

  async function onBodyImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { url } = await uploadMedia(file, "covers")
      editorRef.current?.focus()
      document.execCommand(
        "insertHTML",
        false,
        `<img src="${url}" alt="" /><p><br/></p>`,
      )
      setDirty(true)
    } catch {
      setError("Image upload failed. Try again.")
    } finally {
      if (bodyImageInputRef.current) bodyImageInputRef.current.value = ""
    }
  }

  const tags = useMemo(
    () =>
      tagsText
        .split(",")
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean)
        .slice(0, 8),
    [tagsText],
  )

  function currentBody() {
    return editorRef.current?.innerHTML ?? seed?.bodyHtml ?? ""
  }

  async function persist(): Promise<string | null> {
    const bodyHtml = currentBody()
    if (!title.trim()) {
      setError("Give your article a title.")
      return null
    }
    setError(null)
    const res = await saveArticle({
      id: articleId,
      title: title.trim(),
      category,
      tags,
      coverUrl,
      bodyHtml,
    })
    setArticleId(res.id)
    return res.id
  }

  function handleSaveDraft() {
    startSaving(async () => {
      const id = await persist()
      if (id) {
        setDirty(false)
        setSavedNote("Draft saved")
        setTimeout(() => setSavedNote(null), 2000)
      }
    })
  }

  // Back navigation: if there are unsaved edits, ask to save or discard first.
  function handleBack() {
    if (dirty) {
      setConfirmBack(true)
    } else {
      router.back()
    }
  }

  function handleSaveAndExit() {
    startSaving(async () => {
      const id = await persist()
      if (id) {
        setDirty(false)
        setConfirmBack(false)
        router.back()
      }
      // If persist() returns null (e.g. missing title), the error banner shows
      // inside the dialog and we keep the user on the page to fix it.
    })
  }

  function handleDiscard() {
    setDirty(false)
    setConfirmBack(false)
    router.back()
  }

  function handlePublish() {
    startPublishing(async () => {
      const id = await persist()
      if (!id) return
      try {
        await publishArticle(id)
        router.push(`/articles/${id}`)
      } catch {
        setError("Could not publish. Please try again.")
      }
    })
  }

  function openPreview() {
    setPreviewHtml(currentBody())
    setPreview(true)
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-3">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={handleBack}
          className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground transition hover:bg-muted/70"
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex items-center gap-2">
          {savedNote && <span className="text-xs text-muted-foreground">{savedNote}</span>}
          <button
            onClick={openPreview}
            className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted/70"
          >
            <Eye className="size-4" /> Preview
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={saving || publishing}
            className="rounded-full bg-muted px-3.5 py-2 text-sm font-medium text-foreground transition hover:bg-muted/70 disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
          </button>
          <button
            onClick={handlePublish}
            disabled={saving || publishing}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {publishing ? <Loader2 className="size-4 animate-spin" /> : "Publish"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {/* Cover */}
      <div className="mt-5">
        {coverUrl ? (
          <div className="relative overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl || "/placeholder.svg"} alt="" className="max-h-64 w-full object-cover" />
            <button
              onClick={() => {
                setCoverUrl(null)
                setDirty(true)
              }}
              className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white"
              aria-label="Remove cover"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => coverInputRef.current?.click()}
            disabled={uploadingCover}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card py-8 text-sm font-medium text-muted-foreground transition hover:bg-muted"
          >
            {uploadingCover ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                <ImageIcon className="size-5" /> Add a cover image
              </>
            )}
          </button>
        )}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onCoverChange}
        />
      </div>

      {/* Title */}
      <textarea
        value={title}
        onChange={(e) => {
          setTitle(e.target.value)
          setDirty(true)
        }}
        rows={1}
        placeholder="Article title"
        className="mt-5 w-full resize-none bg-transparent font-display text-3xl font-bold leading-tight text-foreground outline-none placeholder:text-muted-foreground/50"
      />

      {/* Category + tags */}
      <div className="mt-3 flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-1.5">
          {ARTICLE_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => {
                setCategory(c)
                setDirty(true)
              }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition",
                category === c
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <input
          value={tagsText}
          onChange={(e) => {
            setTagsText(e.target.value)
            setDirty(true)
          }}
          placeholder="Add tags, comma separated"
          className="w-full rounded-xl bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* Toolbar */}
      <div className="sticky top-0 z-10 -mx-4 mt-5 flex items-center gap-0.5 overflow-x-auto border-y border-border bg-background/95 px-4 py-2 backdrop-blur">
        <ToolbarButton onClick={() => exec("bold")} label="Bold">
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("italic")} label="Italic">
          <Italic className="size-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("underline")} label="Underline">
          <Underline className="size-4" />
        </ToolbarButton>
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton onClick={() => formatBlock("h2")} label="Heading">
          <Heading2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => formatBlock("h3")} label="Subheading">
          <Heading3 className="size-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => formatBlock("blockquote")} label="Quote">
          <Quote className="size-4" />
        </ToolbarButton>
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton onClick={() => exec("insertUnorderedList")} label="Bullet list">
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("insertOrderedList")} label="Numbered list">
          <ListOrdered className="size-4" />
        </ToolbarButton>
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton onClick={addLink} label="Link">
          <Link2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => bodyImageInputRef.current?.click()} label="Image">
          <ImageIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton onClick={insertVerse} label="Bible verse">
          <BookOpen className="size-4" />
        </ToolbarButton>
        <input
          ref={bodyImageInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onBodyImageChange}
        />
      </div>

      {/* Body editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={() => setDirty(true)}
        data-placeholder="Tell your story…"
        className="article-editor article-prose mt-5 min-h-[40vh] outline-none"
      />

      {/* Preview overlay */}
      {preview && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
          <div className="mx-auto w-full max-w-2xl px-4 py-4">
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-semibold text-muted-foreground">Preview</span>
              <button
                onClick={() => setPreview(false)}
                className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground"
                aria-label="Close preview"
              >
                <X className="size-5" />
              </button>
            </div>
            {coverUrl && (
              <div className="mt-4 overflow-hidden rounded-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverUrl || "/placeholder.svg"} alt="" className="w-full object-cover" />
              </div>
            )}
            <span className="mt-5 block text-xs font-semibold uppercase tracking-wide text-primary">
              {category}
            </span>
            <h1 className="mt-2 text-balance font-display text-3xl font-bold leading-tight text-foreground">
              {title || "Untitled"}
            </h1>
            <div
              className="article-prose mt-6"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>
      )}

      {/* Unsaved-changes confirmation on back */}
      {confirmBack && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => setConfirmBack(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative z-10 m-3 w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-2xl">
            <h3 className="text-base font-bold text-foreground">Save your draft?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              You have unsaved changes. Save them as a draft or discard and leave.
            </p>
            {error && (
              <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={handleSaveAndExit}
                disabled={saving}
                className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : "Save draft & leave"}
              </button>
              <button
                onClick={handleDiscard}
                disabled={saving}
                className="rounded-full bg-destructive/10 px-4 py-2.5 text-sm font-semibold text-destructive transition hover:bg-destructive/20 disabled:opacity-50"
              >
                Discard changes
              </button>
              <button
                onClick={() => setConfirmBack(false)}
                disabled={saving}
                className="rounded-full px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ToolbarButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      // Prevent the button from stealing the editor selection.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  )
}
