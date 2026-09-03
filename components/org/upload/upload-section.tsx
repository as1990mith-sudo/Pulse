"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ListPlus, Plus, Radio, Upload, Link2, LibraryBig, ListMusic } from "lucide-react"
import { toast } from "sonner"
import type { MaterialView } from "@/lib/materials"
import {
  type PlaylistView,
  type PlaylistDetail,
  getPlaylist,
  duplicatePlaylist,
  deletePlaylist,
} from "@/app/actions/materials"
import { OrgEpisodeCatalog } from "@/components/org/org-catalogue-tab"
import type { CatalogueItemView } from "@/app/actions/org-content"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MaterialsView } from "./materials-view"
import { PlaylistsView } from "./playlists-view"
import { PlaylistEditor } from "./playlist-editor"
import { MaterialDetailSheet } from "./material-detail-sheet"
import { UploadMaterialSheet } from "./upload-material-sheet"
import { ImportLinksSheet } from "./import-links-sheet"
import { CreatePlaylistSheet } from "./create-playlist-sheet"
import { AddToPlaylistSheet } from "./add-to-playlist-sheet"
import { cn } from "@/lib/utils"

type Segment = "materials" | "playlists" | "live"

/**
 * The redesigned Catalogue overlay body. Owns the Materials · Playlists · Live
 * segmented nav, the owner action cluster, and every material/playlist sheet.
 * Live delegates to the untouched `OrgEpisodeCatalog` (in `liveOnly` mode) so
 * episode replays render exactly as before.
 */
export function UploadSection({
  organizationId,
  isOwner,
  materials,
  playlists,
  liveItems,
  orgName,
  orgLogo,
  orgHandle,
  segment: segmentProp,
  onSegmentChange,
  liveTab = "video",
  onLiveTabChange,
}: {
  organizationId: string
  isOwner: boolean
  materials: MaterialView[]
  playlists: PlaylistView[]
  liveItems: CatalogueItemView[]
  orgName: string
  orgLogo: string | null
  orgHandle: string
  // Optional controlled segment + Live sub-tab. When provided (by the org
  // profile, which URL-backs them), a live replay can return to the exact spot.
  // Omitting them keeps the old fully-internal behaviour.
  segment?: Segment
  onSegmentChange?: (s: Segment) => void
  liveTab?: "video" | "audio"
  onLiveTabChange?: (t: "video" | "audio") => void
}) {
  const router = useRouter()
  const [segmentState, setSegmentState] = useState<Segment>("materials")
  // Controlled when the parent supplies `segment`, else internal state.
  const segment = segmentProp ?? segmentState
  const setSegment = (s: Segment) => {
    setSegmentState(s)
    onSegmentChange?.(s)
  }
  const [, startTransition] = useTransition()

  // Sheet / overlay state.
  const [detail, setDetail] = useState<MaterialView | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<MaterialView | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingPlaylist, setEditingPlaylist] = useState<PlaylistView | null>(null)
  const [addToPlaylistFor, setAddToPlaylistFor] = useState<MaterialView | null>(null)
  const [openPlaylist, setOpenPlaylist] = useState<PlaylistDetail | null>(null)

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function openPlaylistDetail(p: PlaylistView) {
    try {
      const d = await getPlaylist(organizationId, p.id)
      if (d) setOpenPlaylist(d)
    } catch {
      toast.error("Could not open playlist")
    }
  }

  async function reopenPlaylist(id: number) {
    const d = await getPlaylist(organizationId, id)
    if (d) setOpenPlaylist(d)
    refresh()
  }

  function share(path: string, label: string) {
    const url = `${window.location.origin}${path}`
    if (navigator.share) {
      void navigator.share({ title: label, url }).catch(() => {})
    } else {
      void navigator.clipboard.writeText(url)
      toast.success("Link copied")
    }
  }

  const SEGMENTS: { key: Segment; label: string; icon: typeof LibraryBig; count?: number }[] = [
    { key: "materials", label: "Materials", icon: LibraryBig, count: materials.length },
    { key: "playlists", label: "Playlists", icon: ListMusic, count: playlists.length },
    { key: "live", label: "Live", icon: Radio },
  ]

  // Mobile owner add-menu. A single + opens a context menu of the three actions.
  // It lives inline in the Materials search row (passed as MaterialsView's
  // leadingAction) so search + sort + add share one line; on the Playlists
  // segment and the empty Materials state — where there's no search row — it
  // falls back to the header instead. Sized to match the search/sort controls.
  const mobileAddMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Add"
        className="inline-flex size-[42px] shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all hover:brightness-110 active:scale-95"
      >
        <Plus className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem
          onClick={() => {
            setEditingMaterial(null)
            setUploadOpen(true)
          }}
        >
          <Upload className="size-4" />
          Upload Material
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setImportOpen(true)}>
          <Link2 className="size-4" />
          Import Links
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setCreateOpen(true)}>
          <ListPlus className="size-4" />
          Create Playlist
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  // The header hosts the mobile + only when the Materials list (and its search
  // row) isn't the thing rendering it inline.
  const headerMobileAdd = segment === "playlists" || (segment === "materials" && materials.length === 0)

  // A playlist is open → show the editor full-bleed within the section.
  if (openPlaylist) {
    return (
      <>
        <PlaylistEditor
          detail={openPlaylist}
          isAdmin={isOwner}
          organizationId={organizationId}
          allMaterials={materials}
          onBack={() => {
            setOpenPlaylist(null)
            refresh()
          }}
          onOpenMaterial={(m) => setDetail(m)}
          onEdit={() => setEditingPlaylist(openPlaylist.playlist)}
          onShare={() => share(`/org/${orgHandle}?playlist=${openPlaylist.playlist.id}`, openPlaylist.playlist.name)}
          onChanged={() => reopenPlaylist(openPlaylist.playlist.id)}
        />

        <MaterialDetailSheet
          material={detail}
          isOwner={isOwner}
          onOpenChange={(o) => !o && setDetail(null)}
          onAddToPlaylist={(m) => {
            setDetail(null)
            setAddToPlaylistFor(m)
          }}
        />
        {isOwner && (
          <>
            <CreatePlaylistSheet
              open={Boolean(editingPlaylist)}
              onOpenChange={(o) => !o && setEditingPlaylist(null)}
              organizationId={organizationId}
              materials={materials}
              editing={editingPlaylist}
              onCreated={() => {
                setEditingPlaylist(null)
                reopenPlaylist(openPlaylist.playlist.id)
              }}
            />
            <AddToPlaylistSheet
              material={addToPlaylistFor}
              organizationId={organizationId}
              playlists={playlists}
              onOpenChange={(o) => !o && setAddToPlaylistFor(null)}
              onDone={() => {
                setAddToPlaylistFor(null)
                reopenPlaylist(openPlaylist.playlist.id)
              }}
            />
          </>
        )}
      </>
    )
  }

  return (
    <div className="space-y-5">
      {/* Segmented nav + owner actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Catalogue sections"
          // Full-width on mobile so the three segments stretch to fill the row
          // evenly (no dead space in front of "Live"); natural inline width on
          // desktop where it sits beside the owner action buttons.
          className="flex w-full items-center gap-1 rounded-full border border-border bg-secondary/40 p-1 sm:inline-flex sm:w-auto"
        >
          {SEGMENTS.map((s) => {
            const active = segment === s.key
            const Icon = s.icon
            return (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSegment(s.key)}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-medium transition-all duration-200",
                  // Each segment shares the row equally on mobile (flex-1) so the
                  // pills are perfectly even and no space is wasted; on desktop
                  // they size to content, with "Live" (no count badge) getting a
                  // touch more padding to stay visually even.
                  "flex-1 sm:flex-none",
                  s.key === "live" ? "px-3.5 sm:px-5" : "px-3.5",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {s.label}
                {typeof s.count === "number" && s.count > 0 && (
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      active ? "text-primary-foreground/80" : "text-muted-foreground/60",
                    )}
                  >
                    {s.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {isOwner && segment !== "live" && (
          <div className="flex items-center gap-2">
            {/* Desktop: explicit buttons */}
            <div className="hidden items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm font-medium transition-colors hover:bg-secondary"
              >
                <Link2 className="size-4" />
                Import Links
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm font-medium transition-colors hover:bg-secondary"
              >
                <ListPlus className="size-4" />
                Create Playlist
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingMaterial(null)
                  setUploadOpen(true)
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98]"
              >
                <Upload className="size-4" />
                Upload Material
              </button>
            </div>
            {/* Mobile: the single + lives here only when no search row hosts it */}
            {headerMobileAdd && <div className="sm:hidden">{mobileAddMenu}</div>}
          </div>
        )}
      </div>

      {/* Active segment */}
      {segment === "materials" && (
        <MaterialsView
          materials={materials}
          isOwner={isOwner}
          leadingAction={isOwner ? mobileAddMenu : undefined}
          onOpen={(m) => setDetail(m)}
          onEdit={(m) => {
            setEditingMaterial(m)
            setUploadOpen(true)
          }}
          onAddToPlaylist={(m) => setAddToPlaylistFor(m)}
          onUpload={() => {
            setEditingMaterial(null)
            setUploadOpen(true)
          }}
        />
      )}

      {segment === "playlists" && (
        <PlaylistsView
          playlists={playlists}
          isAdmin={isOwner}
          onOpen={openPlaylistDetail}
          onCreate={() => setCreateOpen(true)}
          onEdit={(p) => setEditingPlaylist(p)}
          onShare={(p) => share(`/org/${orgHandle}?playlist=${p.id}`, p.name)}
          onDuplicate={async (p) => {
            try {
              await duplicatePlaylist({ id: p.id, organizationId })
              toast.success("Playlist duplicated")
              refresh()
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not duplicate")
            }
          }}
          onDelete={async (p) => {
            try {
              await deletePlaylist({ id: p.id, organizationId })
              toast.success("Playlist deleted")
              refresh()
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not delete")
            }
          }}
        />
      )}

      {segment === "live" && (
        <OrgEpisodeCatalog
          items={liveItems}
          isOwner={isOwner}
          orgId={organizationId}
          orgName={orgName}
          orgLogo={orgLogo}
          orgHandle={orgHandle}
          tab="video"
          onTabChange={() => {}}
          liveOnly
          // Controlled Live Video/Audio sub-tab so returning from a replay
          // reopens on the same sub-tab the user was browsing.
          liveKind={liveTab}
          onLiveKindChange={onLiveTabChange}
        />
      )}

      {/* Material detail viewer */}
      <MaterialDetailSheet
        material={detail}
        isOwner={isOwner}
        onOpenChange={(o) => !o && setDetail(null)}
        onAddToPlaylist={(m) => {
          setDetail(null)
          setAddToPlaylistFor(m)
        }}
      />

      {/* Owner-only sheets */}
      {isOwner && (
        <>
          <UploadMaterialSheet
            organizationId={organizationId}
            open={uploadOpen}
            onOpenChange={(o) => {
              setUploadOpen(o)
              if (!o) setEditingMaterial(null)
            }}
            editing={editingMaterial}
          />
          <ImportLinksSheet organizationId={organizationId} open={importOpen} onOpenChange={setImportOpen} />
          <CreatePlaylistSheet
            open={createOpen || Boolean(editingPlaylist)}
            onOpenChange={(o) => {
              if (!o) {
                setCreateOpen(false)
                setEditingPlaylist(null)
              }
            }}
            organizationId={organizationId}
            materials={materials}
            editing={editingPlaylist}
            onCreated={() => {
              setCreateOpen(false)
              setEditingPlaylist(null)
              refresh()
            }}
          />
          <AddToPlaylistSheet
            material={addToPlaylistFor}
            organizationId={organizationId}
            playlists={playlists}
            onOpenChange={(o) => !o && setAddToPlaylistFor(null)}
            onDone={() => {
              setAddToPlaylistFor(null)
              refresh()
            }}
          />
        </>
      )}
    </div>
  )
}
