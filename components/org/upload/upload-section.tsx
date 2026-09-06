"use client"

import { useState, useEffect, useCallback } from "react"
import { ListPlus, Plus, Radio, Upload, Link2, LibraryBig, ListMusic } from "lucide-react"
import { toast } from "sonner"
import type { MaterialView } from "@/lib/materials"
import {
  type PlaylistView,
  type PlaylistDetail,
  getPlaylist,
  duplicatePlaylist,
  deletePlaylist,
  getOrganizationMaterials,
  getOrganizationPlaylists,
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
  materials: materialsProp,
  playlists: playlistsProp,
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
  // Renamed below to `materialsProp`/`playlistsProp`; the rendered lists come
  // from local state seeded off these so a create/import shows up instantly.
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
  const [segmentState, setSegmentState] = useState<Segment>("materials")
  // Controlled when the parent supplies `segment`, else internal state.
  const segment = segmentProp ?? segmentState
  const setSegment = (s: Segment) => {
    setSegmentState(s)
    onSegmentChange?.(s)
  }

  // The Materials + Playlists lists render from local state seeded off the
  // server props, so a create/import/add appears the instant its action
  // confirms — with no full-page refresh, the overlay keeps its scroll and
  // segment. Genuine navigations still arrive through these prop-sync effects.
  const [materials, setMaterials] = useState<MaterialView[]>(materialsProp)
  const [playlists, setPlaylists] = useState<PlaylistView[]>(playlistsProp)
  useEffect(() => setMaterials(materialsProp), [materialsProp])
  useEffect(() => setPlaylists(playlistsProp), [playlistsProp])

  // Sheet / overlay state.
  const [detail, setDetail] = useState<MaterialView | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<MaterialView | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingPlaylist, setEditingPlaylist] = useState<PlaylistView | null>(null)
  const [addToPlaylistFor, setAddToPlaylistFor] = useState<MaterialView | null>(null)
  const [openPlaylist, setOpenPlaylist] = useState<PlaylistDetail | null>(null)
  // The chain of open playlist ids (ancestors → current). Lets sub-playlists
  // drill in and step back one level at a time instead of closing outright.
  const [playlistPath, setPlaylistPath] = useState<number[]>([])
  // Create-sub-playlist sheet, parented to the currently open playlist.
  const [subCreateOpen, setSubCreateOpen] = useState(false)

  // Re-read both lists straight from the server after a mutation and swap the
  // results into local state. This is a targeted data sync, not a route
  // refresh, so the user stays exactly where they are in the Catalogue.
  const syncCatalogue = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([
        getOrganizationMaterials(organizationId),
        getOrganizationPlaylists(organizationId),
      ])
      setMaterials(m)
      setPlaylists(p)
    } catch {
      // Non-fatal: keep the current lists if the re-read fails.
    }
  }, [organizationId])

  function refresh() {
    void syncCatalogue()
  }

  async function loadPlaylistInto(id: number, path: number[]) {
    const d = await getPlaylist(organizationId, id)
    if (d) {
      setOpenPlaylist(d)
      setPlaylistPath(path)
    }
    return d
  }

  async function openPlaylistDetail(p: PlaylistView) {
    try {
      await loadPlaylistInto(p.id, [p.id])
    } catch {
      toast.error("Could not open playlist")
    }
  }

  async function drillIntoPlaylist(p: PlaylistView) {
    try {
      await loadPlaylistInto(p.id, [...playlistPath, p.id])
    } catch {
      toast.error("Could not open playlist")
    }
  }

  function backFromPlaylist() {
    if (playlistPath.length > 1) {
      const parentId = playlistPath[playlistPath.length - 2]
      void loadPlaylistInto(parentId, playlistPath.slice(0, -1))
    } else {
      setOpenPlaylist(null)
      setPlaylistPath([])
      refresh()
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

  // The header hosts the mobile + only for the empty Materials state, where
  // there's no search row to render it inline. Materials (with a list) and
  // Playlists both render the + inside their own search row.
  const headerMobileAdd = segment === "materials" && materials.length === 0

  // A playlist is open → show the editor full-bleed within the section.
  if (openPlaylist) {
    return (
      <>
        <PlaylistEditor
          // Key by playlist id so drilling into a sub-playlist remounts the
          // editor with fresh state. Without this, the internal `items` (track
          // list) state kept its first value and a drilled-in child showed the
          // parent's materials — so an opened sub-playlist looked empty/"vanished".
          key={openPlaylist.playlist.id}
          detail={openPlaylist}
          isAdmin={isOwner}
          organizationId={organizationId}
          allMaterials={materials}
          backLabel={playlistPath.length > 1 ? "Back" : "Upload"}
          onBack={backFromPlaylist}
          onOpenMaterial={(m) => setDetail(m)}
          onEdit={() => setEditingPlaylist(openPlaylist.playlist)}
          onShare={() => share(`/org/${orgHandle}?playlist=${openPlaylist.playlist.id}`, openPlaylist.playlist.name)}
          onChanged={() => reopenPlaylist(openPlaylist.playlist.id)}
          onOpenPlaylist={drillIntoPlaylist}
          onCreateSubPlaylist={() => setSubCreateOpen(true)}
          onEditPlaylist={(p) => setEditingPlaylist(p)}
          onSharePlaylist={(p) => share(`/org/${orgHandle}?playlist=${p.id}`, p.name)}
          onDuplicatePlaylist={async (p) => {
            try {
              await duplicatePlaylist({ id: p.id, organizationId })
              toast.success("Playlist duplicated")
              reopenPlaylist(openPlaylist.playlist.id)
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not duplicate")
            }
          }}
          onDeletePlaylist={async (p) => {
            try {
              await deletePlaylist({ id: p.id, organizationId })
              toast.success("Playlist deleted")
              reopenPlaylist(openPlaylist.playlist.id)
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not delete")
            }
          }}
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
            <CreatePlaylistSheet
              open={subCreateOpen}
              onOpenChange={setSubCreateOpen}
              organizationId={organizationId}
              materials={materials}
              parentId={openPlaylist.playlist.id}
              parentName={openPlaylist.playlist.name}
              onCreated={() => {
                setSubCreateOpen(false)
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
          leadingAction={isOwner ? mobileAddMenu : undefined}
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
            onSaved={refresh}
          />
          <ImportLinksSheet
            organizationId={organizationId}
            open={importOpen}
            onOpenChange={setImportOpen}
            onImported={refresh}
          />
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
