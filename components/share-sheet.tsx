"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import useSWR from "swr"
import QRCode from "qrcode"
import {
  Bookmark,
  Check,
  Copy,
  Download,
  Loader2,
  Mail,
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

  // Opens the device's native share sheet (the OS panel listing other apps).
  // Falls back to copying only when the platform truly has no Web Share API.
  async function handleSystemShare() {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: target.title, text: target.subtitle ?? target.title, url: absoluteUrl })
      } catch {
        // user dismissed the OS sheet — ignore
      }
      return
    }
    // No native share support (e.g. a WebView without it configured): copy and tell the user.
    try {
      await navigator.clipboard.writeText(absoluteUrl)
      pushToast("Sharing unavailable here — link copied")
    } catch {
      pushToast("Could not share or copy link")
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

        {/* People grid — capped to ~two rows (frequently-contacted first); the
            rest scroll into view. */}
        <div
          data-scroll
          className="max-h-[13.25rem] min-h-[6.5rem] flex-1 overflow-y-auto overscroll-contain px-2 pb-1"
        >
          {listLoading && people.length === 0 ? (
            <div className="flex h-28 items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : people.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {debounced ? "No people found." : "Follow people to share with them here."}
            </p>
          ) : (
            <ul className="grid grid-cols-4 gap-0.5">
              {people.map((p) => {
                const isSel = selected.includes(p.id)
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => toggleSelect(p.id)}
                      className="tap-scale flex w-full flex-col items-center gap-1.5 rounded-2xl px-1 py-2 transition-colors hover:bg-secondary/50"
                      aria-pressed={isSel}
                    >
                      <span className="relative">
                        <Avatar
                          className={cn(
                            "size-[3.75rem] transition-all duration-200",
                            isSel ? "ring-2 ring-primary ring-offset-2 ring-offset-popover" : "",
                          )}
                        >
                          {p.image && <AvatarImage src={p.image || "/placeholder.svg"} alt={p.name} />}
                          <AvatarFallback className={cn("text-sm font-medium", p.color)}>
                            {p.initials}
                          </AvatarFallback>
                        </Avatar>
                        {isSel && (
                          <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-popover">
                            <Check className="size-3" strokeWidth={3} />
                          </span>
                        )}
                      </span>
                      <span className="w-full truncate text-center text-[11px] leading-tight text-foreground">
                        {p.name}
                      </span>
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
              <QuickAction
                icon={<Send className="size-5" />}
                label="Share"
                iconClassName="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleSystemShare}
              />
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
                    <Bookmark className="size-5" />
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
              <QuickAction icon={<MoreHorizontal className="size-5" />} label="More apps" onClick={handleSystemShare} />
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
  return (
    <div
      data-scroll
      className={cn("flex gap-2 overflow-x-auto px-3 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
    >
      {children}
    </div>
  )
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
    <button type="button" onClick={onClick} className="tap-scale flex w-[3.75rem] shrink-0 flex-col items-center gap-1.5">
      <span
        className={cn(
          "flex size-12 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/70",
          iconClassName,
        )}
      >
        {icon}
      </span>
      <span className="w-full truncate text-center text-[11px] text-muted-foreground">{label}</span>
    </button>
  )
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "frequency"
}

function WhatsAppLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  )
}

function TelegramLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  )
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
      icon: <WhatsAppLogo className="size-5" />,
    },
    {
      label: "Telegram",
      href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`,
      className: "bg-[#229ED9] text-white hover:bg-[#229ED9]/90",
      icon: <TelegramLogo className="size-5" />,
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
      icon: <Mail className="size-5" />,
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
