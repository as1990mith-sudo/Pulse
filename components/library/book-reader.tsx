"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, BookOpen, Download, ExternalLink, Loader2 } from "lucide-react"

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
  const [loaded, setLoaded] = useState(false)
  const pdf = isPdf(fileName, fileUrl)

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* Reader chrome */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border/60 bg-background/95 px-3 py-2.5 backdrop-blur-xl pt-[calc(0.625rem+env(safe-area-inset-top))]">
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
        ) : pdf ? (
          <>
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}
            <iframe
              src={`${fileUrl}#view=FitH`}
              title={`${title} reader`}
              className="size-full border-0"
              onLoad={() => setLoaded(true)}
            />
          </>
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
      <span className="mb-4 flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary">
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
