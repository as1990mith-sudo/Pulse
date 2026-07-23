"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/TextLayer.css"
import "react-pdf/dist/Page/AnnotationLayer.css"
import {
  Bookmark,
  Copy,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  Plus,
  Share2,
  SlidersHorizontal,
  Sun,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Bundle the pdf.js worker as an asset URL. `new URL(..., import.meta.url)` is
// understood by both Turbopack and webpack, so this works without any custom
// next.config changes. pdfjs-dist is pinned to react-pdf's version.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString()

const MIN_SCALE = 0.6
const MAX_SCALE = 2.6
const SCALE_STEP = 0.2
// Fallback aspect ratio (height / width) used for a page's placeholder before
// it has rendered once — keeps scroll position stable while pages lazy-load.
const DEFAULT_RATIO = 1.3
// Rough reading pace for the "time remaining" estimate (minutes per page).
const MINUTES_PER_PAGE = 1.6
// Idle delay before the immersive controls fade out.
const AUTO_HIDE_MS = 3200

type Theme = "light" | "dark" | "sepia"
type Margin = "narrow" | "normal" | "wide"

const MARGIN_WIDTHS: Record<Margin, number> = { narrow: 620, normal: 820, wide: 1000 }

type Prefs = { theme: Theme; scale: number; margin: Margin; brightness: number }
const DEFAULT_PREFS: Prefs = { theme: "light", scale: 1, margin: "normal", brightness: 100 }

type Chapter = { title: string; page: number }

// Namespaced localStorage helpers so preferences + reading position survive
// closing the app. Position is keyed per file; preferences are global.
const PREFS_KEY = "reader:prefs"
const posKey = (url: string) => `reader:pos:${url}`

function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

function pageFilter(theme: Theme, brightness: number): string | undefined {
  const b = brightness / 100
  if (theme === "dark") return `invert(1) hue-rotate(180deg) brightness(${b})`
  if (theme === "sepia") return `sepia(0.45) brightness(${b}) contrast(0.96)`
  return b === 1 ? undefined : `brightness(${b})`
}

function formatRemaining(mins: number): string {
  if (mins <= 0) return "Finished"
  if (mins < 1) return "< 1 min left"
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h > 0) return `~${h}h ${m}m left`
  return `~${m} min left`
}

export function PdfViewer({
  fileUrl,
  title,
  onError,
  onImmersiveChange,
}: {
  fileUrl: string
  title?: string
  onError: () => void
  onImmersiveChange?: (immersive: boolean) => void
}) {
  const [numPages, setNumPages] = useState(0)
  const [pageWidth, setPageWidth] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)

  // Reading preferences (persisted). `scale` doubles as the font-size control.
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const { theme, scale, margin, brightness } = prefs
  const dark = theme === "dark"

  const [immersive, setImmersive] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [bookmarks, setBookmarks] = useState<number[]>([])
  const [flash, setFlash] = useState<string | null>(null)
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null)

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoredRef = useRef(false)
  const saveRaf = useRef<number | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Aspect ratios are stored per page (scale-independent) so placeholders keep
  // the right height even after a page unmounts when scrolled far away.
  const ratios = useRef<Map<number, number>>(new Map())

  // Load persisted prefs once on mount (client only).
  useEffect(() => setPrefs(loadPrefs()), [])
  // Persist prefs whenever they change.
  useEffect(() => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      /* ignore quota errors */
    }
  }, [prefs])

  const setPref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }))
  }, [])

  // Notify the parent chrome so it can collapse/expand around the reader.
  useEffect(() => onImmersiveChange?.(immersive), [immersive, onImmersiveChange])

  const flashMessage = useCallback((msg: string) => {
    setFlash(msg)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 1600)
  }, [])

  // Fit-to-width: measure the scroll container and derive the page width using
  // the chosen margin preset, then apply the zoom multiplier.
  useEffect(() => {
    if (!rootEl) return
    const measure = () => {
      const available = rootEl.clientWidth - 24 // horizontal padding
      const base = Math.min(available, MARGIN_WIDTHS[margin])
      setPageWidth(Math.max(240, base) * scale)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(rootEl)
    return () => ro.disconnect()
  }, [rootEl, scale, margin])

  const options = useMemo(
    () => ({
      cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
      standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
      // Open fast: stream the file and fetch only the byte ranges needed for the
      // pages in view instead of downloading the whole PDF up front. On
      // range-capable storage (Vercel Blob) the first page paints as soon as its
      // bytes arrive; on servers without range support pdf.js safely falls back
      // to a full download. `disableAutoFetch` stops the eager background
      // prefetch of the entire document that otherwise stalls large books.
      disableStream: false,
      disableAutoFetch: true,
    }),
    [],
  )

  const zoomOut = () => setPref("scale", Math.max(MIN_SCALE, Math.round((scale - SCALE_STEP) * 10) / 10))
  const zoomIn = () => setPref("scale", Math.min(MAX_SCALE, Math.round((scale + SCALE_STEP) * 10) / 10))

  const handleMeasure = useCallback((page: number, ratio: number) => {
    ratios.current.set(page, ratio)
  }, [])

  // --- Reading-position persistence ------------------------------------------
  // Restore the saved scroll offset once the document + layout are ready.
  useEffect(() => {
    if (restoredRef.current || !rootEl || !numPages || pageWidth <= 0) return
    try {
      const raw = window.localStorage.getItem(posKey(fileUrl))
      if (raw) {
        const { scrollTop } = JSON.parse(raw)
        if (typeof scrollTop === "number") rootEl.scrollTop = scrollTop
      }
    } catch {
      /* ignore */
    }
    restoredRef.current = true
  }, [rootEl, numPages, pageWidth, fileUrl])

  // Load bookmarks for this file.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`reader:bm:${fileUrl}`)
      setBookmarks(raw ? JSON.parse(raw) : [])
    } catch {
      setBookmarks([])
    }
  }, [fileUrl])

  const toggleBookmark = useCallback(() => {
    setBookmarks((prev) => {
      const next = prev.includes(currentPage) ? prev.filter((p) => p !== currentPage) : [...prev, currentPage].sort((a, b) => a - b)
      try {
        window.localStorage.setItem(`reader:bm:${fileUrl}`, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      flashMessage(prev.includes(currentPage) ? "Bookmark removed" : `Bookmarked page ${currentPage}`)
      return next
    })
  }, [currentPage, fileUrl, flashMessage])

  // --- Auto-hiding immersive controls ----------------------------------------
  const revealControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    if (immersive && !prefsOpen) {
      hideTimer.current = setTimeout(() => setControlsVisible(false), AUTO_HIDE_MS)
    }
  }, [immersive, prefsOpen])

  // When entering immersive mode, start the idle countdown; when leaving, pin
  // the controls back on.
  useEffect(() => {
    if (immersive) revealControls()
    else {
      setControlsVisible(true)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [immersive, revealControls])

  // Escape exits immersive mode; a bare tap toggles the controls.
  useEffect(() => {
    if (!immersive) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImmersive(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [immersive])

  // --- Scroll handling: track position, persist, hide selection --------------
  const onScroll = useCallback(() => {
    if (selection) setSelection(null)
    if (saveRaf.current) return
    saveRaf.current = requestAnimationFrame(() => {
      saveRaf.current = null
      if (!rootEl) return
      try {
        window.localStorage.setItem(posKey(fileUrl), JSON.stringify({ scrollTop: rootEl.scrollTop, page: currentPage }))
      } catch {
        /* ignore */
      }
    })
  }, [rootEl, fileUrl, currentPage, selection])

  // --- Text selection toolbar ------------------------------------------------
  const handleSelectionEnd = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim() || !rootEl) {
      setSelection(null)
      return
    }
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const rootRect = rootEl.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return
    setSelection({
      text: sel.toString(),
      x: rect.left - rootRect.left + rect.width / 2,
      y: rect.top - rootRect.top,
    })
  }, [rootEl])

  const copySelection = useCallback(async () => {
    if (!selection) return
    try {
      await navigator.clipboard.writeText(selection.text)
      flashMessage("Copied")
    } catch {
      flashMessage("Couldn't copy")
    }
    setSelection(null)
  }, [selection, flashMessage])

  const shareSelection = useCallback(async () => {
    if (!selection) return
    try {
      if (navigator.share) await navigator.share({ text: selection.text, title })
      else {
        await navigator.clipboard.writeText(selection.text)
        flashMessage("Copied to share")
      }
    } catch {
      /* user dismissed */
    }
    setSelection(null)
  }, [selection, title, flashMessage])

  const saveHighlight = useCallback(() => {
    if (!selection) return
    try {
      const raw = window.localStorage.getItem(`reader:hl:${fileUrl}`)
      const list = raw ? JSON.parse(raw) : []
      list.push({ text: selection.text, page: currentPage, at: Date.now() })
      window.localStorage.setItem(`reader:hl:${fileUrl}`, JSON.stringify(list))
      flashMessage("Highlight saved")
    } catch {
      flashMessage("Couldn't save")
    }
    setSelection(null)
  }, [selection, fileUrl, currentPage, flashMessage])

  // --- Progress + chapter ----------------------------------------------------
  const progress = numPages ? Math.round((currentPage / numPages) * 100) : 0
  const remaining = formatRemaining((numPages - currentPage) * MINUTES_PER_PAGE)
  const currentChapter = useMemo(() => {
    let found: string | null = null
    for (const c of chapters) {
      if (c.page <= currentPage) found = c.title
      else break
    }
    return found
  }, [chapters, currentPage])

  const isBookmarked = bookmarks.includes(currentPage)

  const containerBg = dark ? "bg-zinc-900" : theme === "sepia" ? "bg-[#efe4cd]" : "bg-muted/40"
  const overlayText = dark ? "text-zinc-100" : "text-foreground"

  return (
    <div className={cn("relative flex h-full flex-col transition-colors duration-500", containerBg)}>
      {/* Static toolbar — only in normal (non-immersive) mode. */}
      {!immersive && (
        <div
          className={cn(
            "flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2 backdrop-blur-xl",
            dark ? "border-white/10 bg-zinc-900/95 text-zinc-100" : "border-border/60 bg-background/95 text-foreground",
          )}
        >
          <span className="min-w-14 text-xs font-medium tabular-nums opacity-80">
            {numPages ? `${currentPage} / ${numPages}` : "—"}
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={zoomOut}
              disabled={scale <= MIN_SCALE}
              aria-label="Decrease font size"
              className="tap-scale flex size-9 items-center justify-center rounded-xl hover:bg-foreground/10 disabled:opacity-40"
            >
              <Minus className="size-4" />
            </button>
            <span className="w-11 text-center text-xs font-semibold tabular-nums">{Math.round(scale * 100)}%</span>
            <button
              type="button"
              onClick={zoomIn}
              disabled={scale >= MAX_SCALE}
              aria-label="Increase font size"
              className="tap-scale flex size-9 items-center justify-center rounded-xl hover:bg-foreground/10 disabled:opacity-40"
            >
              <Plus className="size-4" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            {/* Immersive Reading Mode — sits to the left of the theme toggle. */}
            <button
              type="button"
              onClick={() => setImmersive(true)}
              aria-label="Enter immersive reading mode"
              className="tap-scale flex size-9 items-center justify-center rounded-xl hover:bg-foreground/10"
            >
              <Maximize2 className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setPrefsOpen(true)}
              aria-label="Reading preferences"
              className="tap-scale flex size-9 items-center justify-center rounded-xl hover:bg-foreground/10"
            >
              <SlidersHorizontal className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setPref("theme", dark ? "light" : "dark")}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              className="tap-scale flex size-9 items-center justify-center rounded-xl hover:bg-foreground/10"
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Scroll surface. Smooth momentum scrolling; a bare tap in immersive mode
          toggles the floating controls. */}
      <div
        ref={setRootEl}
        tabIndex={0}
        onScroll={onScroll}
        onMouseUp={handleSelectionEnd}
        onTouchEnd={handleSelectionEnd}
        onClick={() => {
          if (immersive) {
            if (controlsVisible) setControlsVisible(false)
            else revealControls()
          }
        }}
        className="reader-scroll relative flex-1 overflow-y-auto overscroll-contain scroll-smooth outline-none [-webkit-overflow-scrolling:touch]"
        style={{ scrollbarWidth: "none" }}
        aria-label="Reading area"
      >
        <Document
          file={fileUrl}
          options={options}
          onLoadSuccess={async (pdf) => {
            setNumPages(pdf.numPages)
            // Best-effort chapter map from the PDF outline (fixed-layout PDFs
            // have no reflowable chapters, so this is only shown when present).
            try {
              const outline = await pdf.getOutline()
              if (outline?.length) {
                const resolved: Chapter[] = []
                for (const item of outline) {
                  try {
                    let dest = item.dest
                    if (typeof dest === "string") dest = await pdf.getDestination(dest)
                    const ref = Array.isArray(dest) ? dest[0] : null
                    if (ref) {
                      const idx = await pdf.getPageIndex(ref as Parameters<typeof pdf.getPageIndex>[0])
                      if (item.title) resolved.push({ title: item.title, page: idx + 1 })
                    }
                  } catch {
                    /* skip unresolved entries */
                  }
                }
                resolved.sort((a, b) => a.page - b.page)
                setChapters(resolved)
              }
            } catch {
              /* outline unavailable */
            }
          }}
          onLoadError={onError}
          loading={
            <div className="flex h-[60vh] items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          }
          error={<span className="sr-only">Failed to load</span>}
          className={cn("flex flex-col items-center gap-3 transition-[padding] duration-500", immersive ? "py-10" : "py-4")}
        >
          {pageWidth > 0 &&
            Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
              <LazyPage
                key={n}
                pageNumber={n}
                width={pageWidth}
                root={rootEl}
                theme={theme}
                brightness={brightness}
                ratio={ratios.current.get(n)}
                onMeasure={handleMeasure}
                onVisible={setCurrentPage}
              />
            ))}
        </Document>

        {/* Text-selection toolbar — appears only when a passage is selected. */}
        {selection && (
          <div
            className="absolute z-30 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-full border border-border/60 bg-popover/95 p-1 text-popover-foreground shadow-elevated backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
            style={{ left: selection.x, top: selection.y - 8 }}
            role="toolbar"
            aria-label="Text actions"
          >
            <SelBtn label="Highlight" onClick={saveHighlight}>
              <span className="size-4 rounded-sm bg-amber-400" />
            </SelBtn>
            <SelBtn label="Copy" onClick={copySelection}>
              <Copy className="size-4" />
            </SelBtn>
            <SelBtn label="Share" onClick={shareSelection}>
              <Share2 className="size-4" />
            </SelBtn>
          </div>
        )}
      </div>

      {/* ---------- Immersive overlay chrome (fades on idle) ---------- */}
      {immersive && (
        <>
          {/* Top floating bar */}
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-3 transition-all duration-500 ease-out",
              dark
                ? "bg-gradient-to-b from-zinc-900/90 to-transparent"
                : theme === "sepia"
                  ? "bg-gradient-to-b from-[#efe4cd]/95 to-transparent"
                  : "bg-gradient-to-b from-background/90 to-transparent",
              controlsVisible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
            )}
          >
            <div className={cn("pointer-events-auto flex items-center gap-1", overlayText)}>
              <button
                type="button"
                onClick={() => setImmersive(false)}
                aria-label="Exit immersive reading mode"
                className="tap-scale flex size-9 items-center justify-center rounded-full bg-foreground/10 backdrop-blur hover:bg-foreground/20"
              >
                <Minimize2 className="size-4" />
              </button>
              {title && <span className="line-clamp-1 max-w-40 text-sm font-semibold">{title}</span>}
            </div>
            <div className={cn("pointer-events-auto flex items-center gap-1", overlayText)}>
              <button
                type="button"
                onClick={toggleBookmark}
                aria-label={isBookmarked ? "Remove bookmark" : "Bookmark this page"}
                className="tap-scale flex size-9 items-center justify-center rounded-full bg-foreground/10 backdrop-blur hover:bg-foreground/20"
              >
                <Bookmark className={cn("size-4", isBookmarked && "fill-current")} />
              </button>
              <button
                type="button"
                onClick={() => setPrefsOpen(true)}
                aria-label="Reading preferences"
                className="tap-scale flex size-9 items-center justify-center rounded-full bg-foreground/10 backdrop-blur hover:bg-foreground/20"
              >
                <SlidersHorizontal className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setPref("theme", dark ? "light" : "dark")}
                aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
                className="tap-scale flex size-9 items-center justify-center rounded-full bg-foreground/10 backdrop-blur hover:bg-foreground/20"
              >
                {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
            </div>
          </div>

          {/* Bottom progress indicator */}
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-6 transition-all duration-500 ease-out",
              dark
                ? "bg-gradient-to-t from-zinc-900/90 to-transparent"
                : theme === "sepia"
                  ? "bg-gradient-to-t from-[#efe4cd]/95 to-transparent"
                  : "bg-gradient-to-t from-background/90 to-transparent",
              controlsVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
              overlayText,
            )}
          >
            <div className="mb-1.5 flex items-end justify-between gap-3 text-xs">
              <span className="line-clamp-1 font-medium opacity-90">{currentChapter ?? (numPages ? `Page ${currentPage}` : "")}</span>
              <span className="shrink-0 tabular-nums opacity-70">{remaining}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-foreground/15">
              <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-1 text-center text-[11px] tabular-nums opacity-60">
              {progress}% · {currentPage} / {numPages || "—"}
            </div>
          </div>
        </>
      )}

      {/* Transient confirmation toast (copy / bookmark / highlight). */}
      {flash && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-40 flex justify-center">
          <span className="rounded-full bg-foreground/90 px-4 py-2 text-xs font-semibold text-background shadow-elevated animate-in fade-in zoom-in-95 duration-150">
            {flash}
          </span>
        </div>
      )}

      {/* ---------- Reading preferences sheet ---------- */}
      {prefsOpen && (
        <div className="absolute inset-0 z-50 flex items-end justify-center">
          <button
            type="button"
            aria-label="Close preferences"
            onClick={() => {
              setPrefsOpen(false)
              if (immersive) revealControls()
            }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
          />
          <div
            className={cn(
              "relative w-full max-w-md rounded-t-3xl border-t p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-elevated animate-in slide-in-from-bottom duration-300",
              dark ? "border-white/10 bg-zinc-900 text-zinc-100" : theme === "sepia" ? "border-black/10 bg-[#f6efdd] text-[#4a3f2a]" : "border-border bg-background text-foreground",
            )}
            role="dialog"
            aria-label="Reading preferences"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold">Reading preferences</h2>
              <button
                type="button"
                onClick={() => {
                  setPrefsOpen(false)
                  if (immersive) revealControls()
                }}
                aria-label="Close"
                className="tap-scale flex size-8 items-center justify-center rounded-full hover:bg-foreground/10"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Theme */}
            <PrefRow label="Theme">
              <Segmented
                options={[
                  { value: "light", label: "Light" },
                  { value: "sepia", label: "Sepia" },
                  { value: "dark", label: "Dark" },
                ]}
                value={theme}
                onChange={(v) => setPref("theme", v as Theme)}
              />
            </PrefRow>

            {/* Font size (zoom) */}
            <PrefRow label="Font size">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={zoomOut}
                  disabled={scale <= MIN_SCALE}
                  aria-label="Decrease font size"
                  className="tap-scale flex size-9 items-center justify-center rounded-xl bg-foreground/10 disabled:opacity-40"
                >
                  <Minus className="size-4" />
                </button>
                <span className="w-12 text-center text-sm font-semibold tabular-nums">{Math.round(scale * 100)}%</span>
                <button
                  type="button"
                  onClick={zoomIn}
                  disabled={scale >= MAX_SCALE}
                  aria-label="Increase font size"
                  className="tap-scale flex size-9 items-center justify-center rounded-xl bg-foreground/10 disabled:opacity-40"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </PrefRow>

            {/* Margins */}
            <PrefRow label="Margins">
              <Segmented
                options={[
                  { value: "narrow", label: "Narrow" },
                  { value: "normal", label: "Normal" },
                  { value: "wide", label: "Wide" },
                ]}
                value={margin}
                onChange={(v) => setPref("margin", v as Margin)}
              />
            </PrefRow>

            {/* Brightness */}
            <PrefRow label="Brightness">
              <input
                type="range"
                min={60}
                max={110}
                step={5}
                value={brightness}
                onChange={(e) => setPref("brightness", Number(e.target.value))}
                aria-label="Brightness"
                className="h-1.5 w-40 cursor-pointer appearance-none rounded-full bg-foreground/20 accent-primary"
              />
            </PrefRow>

            <p className="mt-2 text-pretty text-[11px] leading-relaxed opacity-60">
              Font family, line spacing and paragraph spacing apply to reflowable books; this title has a fixed PDF
              layout, so those are unavailable here.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function SelBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="tap-scale flex size-9 items-center justify-center rounded-full hover:bg-foreground/10"
    >
      {children}
    </button>
  )
}

function PrefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  )
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-foreground/10 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "tap-scale rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
            value === o.value ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/70 hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function LazyPage({
  pageNumber,
  width,
  root,
  theme,
  brightness,
  ratio,
  onMeasure,
  onVisible,
}: {
  pageNumber: number
  width: number
  root: HTMLElement | null
  theme: Theme
  brightness: number
  ratio?: number
  onMeasure: (page: number, ratio: number) => void
  onVisible: (page: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [render, setRender] = useState(false)

  // Only mount the (relatively heavy) <Page> when it nears the viewport, and
  // unmount it once far away — this keeps large books fast and light. A tall
  // rootMargin pre-renders just ahead of the scroll for a seamless read.
  useEffect(() => {
    const el = ref.current
    if (!el || !root) return
    const io = new IntersectionObserver(
      ([entry]) => {
        setRender(entry.isIntersecting)
        // Track the page closest to the top of the viewport for the indicator.
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) onVisible(pageNumber)
      },
      { root, rootMargin: "1200px 0px", threshold: [0, 0.5, 1] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [root, pageNumber, onVisible])

  const placeholderHeight = width * (ratio ?? DEFAULT_RATIO)
  const filter = pageFilter(theme, brightness)

  return (
    <div
      ref={ref}
      style={{ minHeight: render ? undefined : placeholderHeight, width }}
      className="flex justify-center"
    >
      {render ? (
        <div className="overflow-hidden rounded-sm shadow-elevated transition-[filter] duration-300" style={filter ? { filter } : undefined}>
          <Page
            pageNumber={pageNumber}
            width={width}
            renderTextLayer
            renderAnnotationLayer={false}
            onLoadSuccess={(page) => onMeasure(pageNumber, page.height / page.width)}
            loading={<div style={{ height: placeholderHeight, width }} />}
          />
        </div>
      ) : null}
    </div>
  )
}
