"use client"

import { useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { ArrowLeft, BookOpen, Download, ExternalLink, Loader2 } from "lucide-react"

// The PDF viewer pulls in pdf.js, which touches browser-only APIs — load it
// client-side only so it never runs during SSR.
const PdfViewer = dynamic(() => import("./pdf-viewer").then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  ),
})

function isPdf(name: string, url: string): boolean {
  const target = `${name} ${url}`.toLowerCase()
  return target.includes(".pdf")
}

export function BookReader({
  title,
  author,
  fileUrl,
  fileName,
}: {
  title: string
  author: string
  fileUrl: string
  fileName: string
}) {
  const [pdfError, setPdfError] = useState(false)
  // Immersive Reading Mode collapses the outer chrome so the page fills the
  // screen. PdfViewer owns the toggle and reports state back up here.
  const [immersive, setImmersive] = useState(false)
  const pdf = isPdf(fileName, fileUrl)

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* Reader chrome. In immersive mode it lifts out of flow and fades away
          (kept mounted so the transition in/out stays smooth). */}
      <header
        className={
          "flex shrink-0 items-center gap-3 border-b border-border/60 bg-background/95 px-3 py-2.5 backdrop-blur-xl pt-[calc(0.625rem+env(safe-area-inset-top))] transition-[transform,opacity] duration-500 ease-out " +
          (immersive
            ? "pointer-events-none absolute inset-x-0 top-0 z-10 -translate-y-full opacity-0"
            : "translate-y-0 opacity-100")
        }
      >
        <Link
          href="/library"
          aria-label="Back to library"
          className="tap-scale flex size-10 shrink-0 items-center justify-center rounded-xl text-foreground hover:bg-secondary/60"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-1 text-sm font-semibold text-foreground">{title}</h1>
          <p className="truncate text-xs text-muted-foreground">{author}</p>
        </div>
        {fileUrl && (
          <a
            href={fileUrl}
            download={fileName || undefined}
            aria-label="Download"
            className="tap-scale flex size-10 shrink-0 items-center justify-center rounded-xl text-foreground hover:bg-secondary/60"
          >
            <Download className="size-5" />
          </a>
        )}
      </header>

      {/* Reading surface */}
      <div className="relative flex-1 overflow-hidden bg-muted/40">
        {!fileUrl ? (
          <ReaderFallback title={title} fileUrl={fileUrl} fileName={fileName} reason="missing" />
        ) : pdf && !pdfError ? (
          <PdfViewer
            fileUrl={fileUrl}
            title={title}
            onError={() => setPdfError(true)}
            onImmersiveChange={setImmersive}
          />
        ) : (
          <ReaderFallback title={title} fileUrl={fileUrl} fileName={fileName} reason="format" />
        )}
      </div>
    </div>
  )
}

function ReaderFallback({
  title,
  fileUrl,
  fileName,
  reason,
}: {
  title: string
  fileUrl: string
  fileName: string
  reason: "format" | "missing"
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <BookOpen className="size-8" />
      </span>
      <h2 className="text-lg font-semibold text-foreground">
        {reason === "missing" ? "This copy isn't available" : "Open to read"}
      </h2>
      <p className="mt-1 max-w-xs text-pretty text-sm text-muted-foreground">
        {reason === "missing"
          ? "We couldn't find a readable file for this book."
          : `"${title}" is in a format your browser can't preview inline. Open it in a new tab to read.`}
      </p>
      {fileUrl && (
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-elevated transition-transform active:scale-[0.98]"
        >
          <ExternalLink className="size-4" />
          {fileName || "Open file"}
        </a>
      )}
    </div>
  )
}
