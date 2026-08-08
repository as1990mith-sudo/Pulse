"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileText, Headphones, Mic, Play, Plus, Trash2, Video } from "lucide-react"
import type { OrganizationView } from "@/lib/org-types"
import {
  createCatalogueItem,
  deleteCatalogueItem,
  type CatalogueItemView,
  type CatalogueKind,
} from "@/app/actions/org-content"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const KIND_META: Record<CatalogueKind, { label: string; icon: React.ReactNode }> = {
  audio: { label: "Audio", icon: <Headphones className="size-4" /> },
  video: { label: "Video", icon: <Video className="size-4" /> },
  document: { label: "Document", icon: <FileText className="size-4" /> },
}

/**
 * The organisation Catalogue tab — a library of audio, video and document
 * resources. Owners can publish new items and remove existing ones.
 */
export function OrgCatalogueTab({ org, items }: { org: OrganizationView; items: CatalogueItemView[] }) {
  return (
    <div className="flex flex-col gap-5">
      {org.isOwner && (
        <div className="flex justify-end">
          <NewCatalogueDialog organizationId={org.id} />
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <Mic className="size-6" />
          </span>
          <p className="font-medium">No resources yet</p>
          <p className="max-w-sm text-pretty text-sm text-muted-foreground">
            {org.isOwner
              ? "Publish sermons, worship sets, teachings and documents. They'll appear in your catalogue."
              : `${org.name} hasn't published any resources yet.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <CatalogueCard key={item.id} item={item} orgId={org.id} isOwner={org.isOwner} />
          ))}
        </div>
      )}
    </div>
  )
}

function CatalogueCard({ item, orgId, isOwner }: { item: CatalogueItemView; orgId: string; isOwner: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const meta = KIND_META[item.kind]

  function remove() {
    startTransition(async () => {
      await deleteCatalogueItem({ id: item.id, organizationId: orgId })
      router.refresh()
    })
  }

  return (
    <article className="flex gap-3 rounded-2xl border border-border/60 bg-card p-3">
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative flex aspect-square w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground"
      >
        {item.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.cover || "/placeholder.svg"} alt="" className="size-full object-cover" />
        ) : (
          meta.icon
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity hover:opacity-100">
          <Play className="size-6 text-white" />
        </span>
      </a>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {meta.icon} {meta.label}
          {item.duration ? ` · ${item.duration}` : ""}
        </span>
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-1 truncate font-semibold hover:underline">
          {item.title}
        </a>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-pretty text-sm leading-snug text-muted-foreground">{item.description}</p>
        )}
        {isOwner && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="mt-1.5 inline-flex w-fit items-center gap-1.5 text-xs font-medium text-destructive transition hover:underline disabled:opacity-50"
          >
            <Trash2 className="size-3.5" /> {pending ? "Removing..." : "Delete"}
          </button>
        )}
      </div>
    </article>
  )
}

function NewCatalogueDialog({ organizationId }: { organizationId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [kind, setKind] = useState<CatalogueKind>("audio")
  const [url, setUrl] = useState("")
  const [cover, setCover] = useState("")
  const [duration, setDuration] = useState("")

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        await createCatalogueItem({
          organizationId,
          title,
          description: description || undefined,
          kind,
          url,
          cover: cover || undefined,
          duration: duration || undefined,
        })
        setOpen(false)
        setTitle("")
        setDescription("")
        setKind("audio")
        setUrl("")
        setCover("")
        setDuration("")
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't add the resource.")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="rounded-full" size="sm">
            <Plus className="size-4" /> Add resource
          </Button>
        }
      />
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add resource</DialogTitle>
          <DialogDescription>Publish a sermon, teaching, worship set or document to your catalogue.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <Field label="Type">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(KIND_META) as CatalogueKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border py-3 text-xs font-medium transition-colors",
                    kind === k
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground hover:bg-muted",
                  )}
                >
                  {KIND_META[k].icon}
                  {KIND_META[k].label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Message title" />
          </Field>
          <Field label="Link">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="youtube.com/… or a file URL" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cover image URL (optional)">
              <Input value={cover} onChange={(e) => setCover(e.target.value)} placeholder="https://…" />
            </Field>
            <Field label="Duration (optional)">
              <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="42 min" />
            </Field>
          </div>
          <Field label="Description (optional)">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What is this about?" />
          </Field>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button className="rounded-full" onClick={submit} disabled={pending}>
            {pending ? "Adding..." : "Add resource"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}
