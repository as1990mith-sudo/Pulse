"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import useSWR from "swr"
import QRCode from "qrcode"
import {
  Check,
  Copy,
  Download,
  Link2,
  Loader2,
  MoreHorizontal,
  PlusCircle,
  QrCode,
  Search,
  Send,
  X,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import type { ShareSuggestion, ShareTarget } from "@/lib/share-types"
import {
  addTargetToStatus,
  getShareSuggestions,
  isItemSaved,
  searchShareUsers,
  shareToUsers,
  toggleSaveItem,
} from "@/app/actions/share"

type Toast = { id: number; message: string; spinner?: boolean }

export function ShareSheet({
  target,
  open,
  onClose,
}: {
  target: ShareTarget
  open: boolean
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  useEffect(() => setMounted(true), [])

  // Drive the slide-up / fade transition.
  useEffect(() => {
    if (open) {
      setVisible(true)
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  // Reset transient state whenever the sheet is opened for a target.
  useEffect(() => {
    if (!open) return
    setQuery("")
    setDebounced("")
    setSelected([])
    setQrOpen(false)
    void isItemSaved(target.type, target.key).then(setSaved)
  }, [open, target.type, target.key])

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 220)
    return () => clearTimeout(t)
  }, [query])

  const absoluteUrl = useMemo(() => {
    if (typeof window === "undefined") return target.url
    if (/^https?:\/\//i.test(target.url)) return target.url
    return `${window.location.origin}${target.url.startsWith("/") ? "" : "/"}${target.url}`
  }, [target.url])

  // Lazy-loaded suggestions (only fetched while the sheet is open).
  const { data: suggestions = [], isLoading: loadingSuggestions } = useSWR(
    open ? "share-suggestions" : null,
    () => getShareSuggestions(),
    { revalidateOnFocus: false },
  )
  const { data: searchResults = [], isLoading: searching } = useSWR(
    open && debounced.length > 0 ? ["share-search", debounced] : null,
    () => searchShareUsers(debounced),
    { revalidateOnFocus: false, keepPreviousData: true },
  )

  const people: ShareSuggestion[] = debounced.length > 0 ? searchResults : suggestions
  const listLoading = debounced.length > 0 ? searching : loadingSuggestions

  function pushToast(message: string, spinner = false) {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, message, spinner }])
    if (!spinner) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2200)
    return id
  }
  function replaceToast(id: number, message: string) {
    setToasts((t) => t.map((x) => (x.id === id ? { id, message, spinner: false } : x)))
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2200)
  }

  function toggleSelect(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  async function handleSend() {
    if (selected.length === 0 || sending) return
    setSending(true)
    try {
      await shareToUsers({ recipientIds: selected, target })
      pushToast(`Sent to ${selected.length} ${selected.length === 1 ? "person" : "people"}`)
      setSelected([])
      onClose()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Could not send")
    } finally {
      setSending(false)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(absoluteUrl)
      pushToast("Link copied")
    } catch {
      pushToast("Could not copy link")
    }
  }

  async function handleSave() {
    try {
      const res = await toggleSaveItem(target)
      setSaved(res.saved)
      pushToast(res.saved ? "Saved" : "Removed from saved")
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Could not save")
    }
  }

  async function handleAddToStatus() {
    try {
      await addTargetToStatus(target)
      pushToast("Added to your status")
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Could not add to status")
    }
  }

  async function handleDownload() {
    if (!target.downloadUrl || downloading) return
    setDownloading(true)
    const id = pushToast("Downloading…", true)
    try {
      const res = await fetch(target.downloadUrl, { mode: "cors" })
      if (!res.ok) throw new Error("fetch failed")
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const ext =
        target.downloadKind === "video" ? "mp4" : target.downloadKind === "audio" ? "mp3" : "jpg"
      const a = document.createElement("a")
      a.href = objectUrl
      a.download = `${slugify(target.title)}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
      replaceToast(id, "Download complete")
    } catch {
      // Fall back to opening the media in a new tab.
      window.open(target.downloadUrl, "_blank", "noopener,noreferrer")
      replaceToast(id, "Opened in new tab")
    } finally {
      setDownloading(false)
    }
  }

  async function handleQr() {
    try {
      const dataUrl = await QRCode.toDataURL(absoluteUrl, { width: 480, margin: 2 })
      setQrDataUrl(dataUrl)
      setQrOpen(true)
    } catch {
      pushToast("Could not generate QR code")
    }
  }

  async function handleMoreApps() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: target.title, text: target.subtitle ?? target.title, url: absoluteUrl })
      } catch {
        // user dismissed — ignore
      }
    } else {
      void handleCopy()
    }
  }

  const externalTargets = useMemo(() => buildExternalTargets(target, absoluteUrl), [target, absoluteUrl])

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      {/* Blurred backdrop */}
      <button
        type="button"
        aria-label="Close share sheet"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Sheet */}
      <div
        className={cn(
          "relative flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-popover text-popover-foreground shadow-2xl transition-transform duration-300 ease-out sm:rounded-3xl",
          visible ? "translate-y-0" : "translate-y-full",
        )}
      >
        {/* Grabber + header */}
        <div className="shrink-0 px-4 pt-2.5">
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Share</h2>
            <button
              type="button"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="shrink-0 px-4 pb-2 pt-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people..."
              aria-label="Search people"
              className="h-11 w-full rounded-full border border-border/60 bg-secondary/60 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
        </div>

        {/* People grid */}
        <div className="min-h-[8rem] flex-1 overflow-y-auto px-2 pb-2">
          {listLoading && people.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : people.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {debounced ? "No people found." : "Follow people to share with them here."}
            </p>
          ) : (
            <ul className="grid grid-cols-4 gap-1">
              {people.map((p) => {
                const isSel = selected.includes(p.id)
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => toggleSelect(p.id)}
                      className="flex w-full flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 transition-colors hover:bg-secondary/50"
                      aria-pressed={isSel}
                    >
                      <span className="relative">
                        <Avatar
                          className={cn(
                            "size-16 transition-all",
                            isSel ? "ring-2 ring-primary ring-offset-2 ring-offset-popover" : "",
                          )}
                        >
                          {p.image && <AvatarImage src={p.image || "/placeholder.svg"} alt={p.name} />}
                          <AvatarFallback className={cn("text-sm", p.color)}>{p.initials}</AvatarFallback>
                        </Avatar>
                        {isSel && (
                          <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-popover">
                            <Check className="size-3" strokeWidth={3} />
                          </span>
                        )}
                      </span>
                      <span className="w-full truncate text-center text-xs text-foreground">{p.name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Quick actions + external targets (hidden once people are selected to
            make room for the Send button, Instagram-style). */}
        {selected.length === 0 ? (
          <div className="shrink-0 border-t border-border/60">
            <Row>
              <QuickAction icon={<Copy className="size-5" />} label="Copy link" onClick={handleCopy} />
              {target.downloadUrl ? (
                <QuickAction
                  icon={downloading ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />}
                  label="Download"
                  onClick={handleDownload}
                />
              ) : null}
              <QuickAction
                icon={<PlusCircle className="size-5" />}
                label="Add to status"
                onClick={handleAddToStatus}
              />
              <QuickAction icon={<QrCode className="size-5" />} label="QR code" onClick={handleQr} />
              <QuickAction
                icon={
                  saved ? (
                    <Check className="size-5 text-primary" />
                  ) : (
                    <BookmarkIcon className="size-5" />
                  )
                }
                label={saved ? "Saved" : "Save"}
                onClick={handleSave}
              />
            </Row>

            <Row className="border-t border-border/60">
              {externalTargets.map((t) => (
                <QuickAction
                  key={t.label}
                  icon={t.icon}
                  label={t.label}
                  iconClassName={t.className}
                  onClick={() => window.open(t.href, "_blank", "noopener,noreferrer")}
                />
              ))}
              <QuickAction icon={<MoreHorizontal className="size-5" />} label="More apps" onClick={handleMoreApps} />
            </Row>
          </div>
        ) : (
          <div className="shrink-0 border-t border-border/60 p-3">
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {sending ? "Sending…" : `Send${selected.length > 1 ? ` separately (${selected.length})` : ""}`}
            </button>
          </div>
        )}
      </div>

      {/* QR overlay */}
      {qrOpen && qrDataUrl && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6" onClick={() => setQrOpen(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative flex flex-col items-center gap-4 rounded-3xl bg-popover p-6 text-popover-foreground shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl || "/placeholder.svg"} alt="QR code linking to this content" className="size-56 rounded-xl" />
            <p className="max-w-56 truncate text-center text-xs text-muted-foreground">{absoluteUrl}</p>
            <button
              type="button"
              onClick={() => setQrOpen(false)}
              className="rounded-full bg-secondary px-5 py-2 text-sm font-medium"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-20 flex flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg"
          >
            {t.spinner && <Loader2 className="size-4 animate-spin" />}
            {t.message}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  )
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex gap-1 overflow-x-auto px-3 py-3", className)}>{children}</div>
}

function QuickAction({
  icon,
  label,
  onClick,
  iconClassName,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  iconClassName?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-16 shrink-0 flex-col items-center gap-1.5"
    >
      <span
        className={cn(
          "flex size-14 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/70",
          iconClassName,
        )}
      >
        {icon}
      </span>
      <span className="w-full truncate text-center text-[11px] text-muted-foreground">{label}</span>
    </button>
  )
}

function BookmarkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "frequency"
}

/** Curated external share targets with brand-tinted circles. */
function buildExternalTargets(target: ShareTarget, url: string) {
  const text = target.title
  const enc = encodeURIComponent
  return [
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${enc(`${text} ${url}`)}`,
      className: "bg-[#25D366] text-white hover:bg-[#25D366]/90",
      icon: <Link2 className="size-5" />,
    },
    {
      label: "Telegram",
      href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`,
      className: "bg-[#229ED9] text-white hover:bg-[#229ED9]/90",
      icon: <Send className="size-5" />,
    },
    {
      label: "X",
      href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`,
      className: "bg-foreground text-background hover:opacity-90",
      icon: <XLogo className="size-4" />,
    },
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
      className: "bg-[#1877F2] text-white hover:bg-[#1877F2]/90",
      icon: <FacebookLogo className="size-5" />,
    },
    {
      label: "Email",
      href: `mailto:?subject=${enc(text)}&body=${enc(url)}`,
      className: "bg-secondary text-foreground",
      icon: <Copy className="size-5" />,
    },
  ]
}

function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function FacebookLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}
