"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/TextLayer.css"
import "react-pdf/dist/Page/AnnotationLayer.css"
import { Loader2, Minus, Plus, Moon, Sun } from "lucide-react"

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

export function PdfViewer({ fileUrl, onError }: { fileUrl: string; onError: () => void }) {
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1)
  const [dark, setDark] = useState(false)
  const [pageWidth, setPageWidth] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)

  // Aspect ratios are stored per page (scale-independent) so placeholders keep
  // the right height even after a page unmounts when scrolled far away.
  const ratios = useRef<Map<number, number>>(new Map())

  // Fit-to-width: measure the scroll container and derive the page width, then
  // apply the zoom multiplier. Capped so it stays comfortable on wide screens.
  useEffect(() => {
    if (!rootEl) return
    const measure = () => {
      const available = rootEl.clientWidth - 24 // horizontal padding
      const base = Math.min(available, 820)
      setPageWidth(Math.max(240, base) * scale)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(rootEl)
    return () => ro.disconnect()
  }, [rootEl, scale])

  const options = useMemo(
    () => ({
      cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
      standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
    }),
    [],
  )

  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, Math.round((s - SCALE_STEP) * 10) / 10))
  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, Math.round((s + SCALE_STEP) * 10) / 10))

  const handleMeasure = useCallback((page: number, ratio: number) => {
    ratios.current.set(page, ratio)
  }, [])

  return (
    <div className={dark ? "flex h-full flex-col bg-zinc-900" : "flex h-full flex-col bg-muted/40"}>
      {/* Reading controls: page indicator, font (zoom) −/+, and theme toggle. */}
      <div
        className={
          dark
            ? "flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/95 px-3 py-2 text-zinc-100 backdrop-blur-xl"
            : "flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background/95 px-3 py-2 text-foreground backdrop-blur-xl"
        }
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

        <button
          type="button"
          onClick={() => setDark((d) => !d)}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          className="tap-scale flex size-9 items-center justify-center rounded-xl hover:bg-foreground/10"
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>

      {/* Scroll surface. In dark mode the rendered canvases are inverted so the
          page background becomes dark while text stays readable. */}
      <div ref={setRootEl} className="relative flex-1 overflow-y-auto overscroll-contain">
        <Document
          file={fileUrl}
          options={options}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={onError}
          loading={
            <div className="flex h-[60vh] items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          }
          error={<span className="sr-only">Failed to load</span>}
          className="flex flex-col items-center gap-3 py-4"
        >
          {pageWidth > 0 &&
            Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
              <LazyPage
                key={n}
                pageNumber={n}
                width={pageWidth}
                root={rootEl}
                dark={dark}
                ratio={ratios.current.get(n)}
                onMeasure={handleMeasure}
                onVisible={setCurrentPage}
              />
            ))}
        </Document>
      </div>
    </div>
  )
}

function LazyPage({
  pageNumber,
  width,
  root,
  dark,
  ratio,
  onMeasure,
  onVisible,
}: {
  pageNumber: number
  width: number
  root: HTMLElement | null
  dark: boolean
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

  return (
    <div
      ref={ref}
      style={{ minHeight: render ? undefined : placeholderHeight, width }}
      className="flex justify-center"
    >
      {render ? (
        <div
          className="shadow-elevated"
          style={dark ? { filter: "invert(1) hue-rotate(180deg)" } : undefined}
        >
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
