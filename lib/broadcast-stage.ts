// Shared geometry for the Broadcast (portrait video) stage.
//
// The Broadcast stage holds 1 host + up to 3 guests (4 tiles max) and must
// transition smoothly between four layouts as people join/leave the stage:
//
//   1 tile  (host only)      → one large frame
//   2 tiles (host + 1)       → stacked halves (the portrait "side-by-side")
//   3 tiles (host + 2)       → primary on top, two panels below
//   4 tiles (host + 3)       → balanced 2×2
//
// Positions are returned as percentage rects so both the host console and the
// viewer can position every tile with `position: absolute` + inline styles.
// Because each tile keeps a stable identity and only its top/left/width/height
// change, CSS transitions animate the resize/reflow with NO remount — critical
// for the host's local <video>, whose camera track detaches if the element is
// ever unmounted.

export type StageRect = { top: number; left: number; width: number; height: number }

const LAYOUTS: Record<number, StageRect[]> = {
  1: [{ top: 0, left: 0, width: 100, height: 100 }],
  2: [
    { top: 0, left: 0, width: 100, height: 50 },
    { top: 50, left: 0, width: 100, height: 50 },
  ],
  3: [
    { top: 0, left: 0, width: 100, height: 60 },
    { top: 60, left: 0, width: 50, height: 40 },
    { top: 60, left: 50, width: 50, height: 40 },
  ],
  4: [
    { top: 0, left: 0, width: 50, height: 50 },
    { top: 0, left: 50, width: 50, height: 50 },
    { top: 50, left: 0, width: 50, height: 50 },
    { top: 50, left: 50, width: 50, height: 50 },
  ],
}

/**
 * Rects for `total` stage tiles (1–4), ordered [primary, ...secondary].
 * The primary slot (index 0) is where the host — or a spotlighted guest — sits.
 */
export function broadcastStageRects(total: number): StageRect[] {
  const n = Math.max(1, Math.min(4, total))
  return LAYOUTS[n]
}

/** Inline style for a stage rect, with a small inset gap between tiles. */
export function stageRectStyle(rect: StageRect, gap = 4): React.CSSProperties {
  const half = gap / 2
  return {
    position: "absolute",
    top: `calc(${rect.top}% + ${half}px)`,
    left: `calc(${rect.left}% + ${half}px)`,
    width: `calc(${rect.width}% - ${gap}px)`,
    height: `calc(${rect.height}% - ${gap}px)`,
  }
}
