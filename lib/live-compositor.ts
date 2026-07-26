/**
 * LiveCompositor — builds a single MediaStream that mirrors what *viewers* saw
 * during a live video session: every participant's camera laid out in a grid,
 * plus every participant's audio (host mic, guest mics, background music) mixed
 * together. The host's session recorder records THIS stream, so the saved replay
 * shows everyone who was on the call — not just the host's own camera.
 *
 * It is deliberately framework-agnostic: the live-video hook supplies two
 * accessors — one for the current on-screen video tiles, one for the current
 * set of audio MediaStreamTracks — and the compositor re-reads them every frame
 * so late-joining guests, camera on/off toggles and dropped calls are all
 * reflected in the recording as they happen.
 */

import { broadcastStageRects } from "@/lib/broadcast-stage"

export type CompositorSource = {
  /** Stable id (participant identity) used to key placeholder colors. */
  id: string
  /** The live <video> element for this participant, or null if cam is off. */
  videoEl: HTMLVideoElement | null
  /** Display name, used to draw an initial when the camera is off. */
  label: string
}

type CompositorOptions = {
  /** Recording frame shape. Portrait mirrors broadcast streams; landscape the grid meetings. */
  aspect: "portrait" | "landscape"
  /** Returns the ordered tiles to draw this frame (host first). */
  getSources: () => CompositorSource[]
  /** Returns every audio track that should be mixed into the recording. */
  getAudioTracks: () => MediaStreamTrack[]
}

const GAP = 8

/** Deterministic pleasant color for a name (HSL hue from a simple hash). */
function colorFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return `hsl(${h}, 45%, 32%)`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

/**
 * Fraction of the portrait recording height the broadcast stage should fill,
 * mirroring the live viewer's flexbox split (stage flex 2.5, or 2.9 with 3+ on
 * stage, above a flex-1.5 chat). Keeping the same fraction reproduces the live
 * tile proportions in the replay instead of stretching tiles down the full
 * frame. A lone participant fills the whole frame.
 */
function liveStageHeightFraction(participants: number): number {
  if (participants <= 1) return 1
  if (participants === 2) return 2.5 / (2.5 + 1.5)
  return 2.9 / (2.9 + 1.5)
}

/** Grid columns/rows for n tiles, biased to the recording orientation. */
function gridDims(n: number, portrait: boolean): { cols: number; rows: number } {
  if (n <= 1) return { cols: 1, rows: 1 }
  const cols = portrait ? Math.max(1, Math.floor(Math.sqrt(n))) : Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  return { cols, rows }
}

export class LiveCompositor {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private raf = 0
  private opts: CompositorOptions

  private audioCtx: AudioContext | null = null
  private dest: MediaStreamAudioDestinationNode | null = null
  private connected = new Map<string, MediaStreamAudioSourceNode>()
  private audioTimer: ReturnType<typeof setInterval> | null = null

  constructor(opts: CompositorOptions) {
    this.opts = opts
    const canvas = document.createElement("canvas")
    // 720p-class canvas in the chosen orientation.
    if (opts.aspect === "portrait") {
      canvas.width = 720
      canvas.height = 1280
    } else {
      canvas.width = 1280
      canvas.height = 720
    }
    this.canvas = canvas
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("2d canvas context unavailable")
    this.ctx = ctx
  }

  /** Begin compositing + audio mixing and return the combined recording stream. */
  start(): MediaStream {
    const stream = (this.canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(
      30,
    )

    // --- Audio graph: mix every track into one destination node. ---
    try {
      const AC: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.audioCtx = new AC()
      this.dest = this.audioCtx.createMediaStreamDestination()
      this.reconcileAudio()
      // Re-scan periodically so guests who join/leave mid-stream are mixed in.
      this.audioTimer = setInterval(() => this.reconcileAudio(), 1000)
      const mixed = this.dest.stream.getAudioTracks()[0]
      if (mixed) stream.addTrack(mixed)
    } catch {
      /* No audio context — the replay will still capture the composite video. */
    }

    const draw = () => {
      this.drawFrame()
      this.raf = requestAnimationFrame(draw)
    }
    this.raf = requestAnimationFrame(draw)
    return stream
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    if (this.audioTimer) clearInterval(this.audioTimer)
    this.audioTimer = null
    this.connected.forEach((node) => {
      try {
        node.disconnect()
      } catch {
        /* already gone */
      }
    })
    this.connected.clear()
    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => {})
      this.audioCtx = null
    }
    this.dest = null
  }

  /** Connect any audio tracks not already wired into the mix. */
  private reconcileAudio() {
    if (!this.audioCtx || !this.dest) return
    const tracks = this.opts.getAudioTracks().filter((t) => t.readyState === "live")
    const seen = new Set<string>()
    for (const track of tracks) {
      seen.add(track.id)
      if (this.connected.has(track.id)) continue
      try {
        const src = this.audioCtx.createMediaStreamSource(new MediaStream([track]))
        src.connect(this.dest)
        this.connected.set(track.id, src)
      } catch {
        /* track not connectable (e.g. ended) — skip */
      }
    }
    // Drop sources whose track disappeared.
    for (const [id, node] of this.connected) {
      if (!seen.has(id)) {
        try {
          node.disconnect()
        } catch {
          /* ignore */
        }
        this.connected.delete(id)
      }
    }
  }

  private drawFrame() {
    const { ctx, canvas } = this
    const W = canvas.width
    const H = canvas.height
    const portrait = this.opts.aspect === "portrait"

    ctx.fillStyle = "#0a0a0a"
    ctx.fillRect(0, 0, W, H)

    const sources = this.opts.getSources()
    const n = Math.max(1, sources.length)

    // Portrait broadcasts must mirror the LIVE broadcast stage EXACTLY so the
    // saved replay looks like what viewers saw live: 2 tiles = side-by-side
    // columns, 3 = tall primary on top with two panels below, 4 = balanced 2×2.
    // We reuse the same `broadcastStageRects` geometry the live stage uses
    // (host/primary first, matching this compositor's source order).
    //
    // Crucially, we also reproduce the live stage's VERTICAL PROPORTIONS. Live,
    // the stage only fills the top of the room (flex 2.5 above a flex-1.5 chat,
    // or flex 2.9 with 3+ people on stage) — it never occupies the whole
    // portrait screen. Drawing the rects across the full 720×1280 canvas is what
    // made replays stretch every participant into an excessively tall/narrow
    // column. Instead we draw the composition into a band matching that same
    // live fraction, so a 2/3/4-person replay keeps the exact frame proportions
    // viewers saw live. The band is VERTICALLY CENTERED in the frame so the
    // tiles sit in the middle with balanced dark margins above and below,
    // rather than pinned to the top with a large empty gap underneath. A single
    // participant still fills the whole portrait frame.
    if (portrait && sources.length <= 4) {
      const rects = broadcastStageRects(sources.length)
      const half = GAP / 2
      const bandHeight = H * liveStageHeightFraction(sources.length)
      const bandTop = (H - bandHeight) / 2
      for (let i = 0; i < sources.length; i++) {
        const r = rects[i]!
        const x = (r.left / 100) * W + half
        const y = bandTop + (r.top / 100) * bandHeight + half
        const w = (r.width / 100) * W - GAP
        const h = (r.height / 100) * bandHeight - GAP
        this.drawTile(sources[i]!, x, y, w, h)
      }
      return
    }

    const { cols, rows } = gridDims(n, portrait)
    const cellW = (W - GAP * (cols + 1)) / cols
    const cellH = (H - GAP * (rows + 1)) / rows

    for (let i = 0; i < sources.length; i++) {
      const src = sources[i]!
      const col = i % cols
      const row = Math.floor(i / cols)
      // Center the last, possibly short, row.
      const itemsInRow = Math.min(cols, n - row * cols)
      const rowOffset = (cols - itemsInRow) * (cellW + GAP) * 0.5
      const x = GAP + col * (cellW + GAP) + (row === rows - 1 ? rowOffset : 0)
      const y = GAP + row * (cellH + GAP)
      this.drawTile(src, x, y, cellW, cellH)
    }
  }

  private drawTile(src: CompositorSource, x: number, y: number, w: number, h: number) {
    const { ctx } = this
    const radius = 16
    ctx.save()
    // Rounded-rect clip for the tile.
    roundRect(ctx, x, y, w, h, radius)
    ctx.clip()

    const v = src.videoEl
    const ready = v && v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0
    if (ready) {
      // object-cover: crop the source to the cell's aspect, centered.
      const targetRatio = w / h
      const srcRatio = v!.videoWidth / v!.videoHeight
      let sx: number, sy: number, sw: number, sh: number
      if (srcRatio > targetRatio) {
        sh = v!.videoHeight
        sw = sh * targetRatio
        sx = (v!.videoWidth - sw) / 2
        sy = 0
      } else {
        sw = v!.videoWidth
        sh = sw / targetRatio
        sx = 0
        sy = (v!.videoHeight - sh) / 2
      }
      try {
        ctx.drawImage(v!, sx, sy, sw, sh, x, y, w, h)
      } catch {
        this.drawPlaceholder(src, x, y, w, h)
      }
    } else {
      this.drawPlaceholder(src, x, y, w, h)
    }
    ctx.restore()
  }

  private drawPlaceholder(src: CompositorSource, x: number, y: number, w: number, h: number) {
    const { ctx } = this
    ctx.fillStyle = "#141414"
    ctx.fillRect(x, y, w, h)
    // Initials chip centered in the tile.
    const d = Math.min(w, h) * 0.34
    const cx = x + w / 2
    const cy = y + h / 2
    ctx.fillStyle = colorFor(src.id || src.label)
    ctx.beginPath()
    ctx.arc(cx, cy, d / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "rgba(255,255,255,0.92)"
    ctx.font = `600 ${Math.round(d * 0.4)}px system-ui, sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(initials(src.label), cx, cy)
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
