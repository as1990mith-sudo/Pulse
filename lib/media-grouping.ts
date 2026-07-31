// WhatsApp-style consecutive media grouping.
//
// This is a pure DISPLAY-layer helper: it never mutates, reorders, or drops any
// message. Given the already-ordered message list a chat view renders, it walks
// the list once and collapses runs of consecutive photo/video messages from the
// same sender (sent within a rolling 3-minute window) into a single "group" run
// so the view can render them as one combined media collage. Everything else —
// text, audio, documents, captioned media, replies, etc. — passes through
// untouched as "single" runs, preserving all existing behaviour.

/** Consecutive media stays in one group only while gaps stay under 3 minutes. */
export const MEDIA_GROUP_WINDOW_MS = 3 * 60 * 1000

export type MediaGroupInfo = {
  /** Stable per-sender identity so a group never spans two authors. */
  senderKey: string
  /** Epoch ms the message was created — drives the rolling 3-minute window. */
  createdAtMs: number
  /**
   * True only for a *pure* image/video message that is eligible for grouping.
   * Captioned media, replies/status-quotes, deleted, audio and documents are
   * intentionally excluded so their existing single-bubble rendering is kept.
   */
  groupable: boolean
}

export type MessageRun<T> =
  | { type: "single"; item: T }
  | { type: "group"; key: string; items: T[] }

/**
 * Collapse consecutive groupable media (same sender, within the rolling window)
 * into `group` runs; every other message becomes its own `single` run. A group
 * needs at least two items — a lone media message stays a normal single bubble.
 */
export function groupConsecutiveMedia<T>(
  items: T[],
  describe: (item: T) => MediaGroupInfo,
  keyOf: (item: T) => string | number,
): MessageRun<T>[] {
  const runs: MessageRun<T>[] = []
  let i = 0

  while (i < items.length) {
    const info = describe(items[i])

    if (!info.groupable) {
      runs.push({ type: "single", item: items[i] })
      i += 1
      continue
    }

    // Start a media run and keep extending it while the next message is also
    // groupable media from the same sender and within 3 minutes of the PREVIOUS
    // media item (a rolling window, so a steady stream keeps grouping).
    const groupItems: T[] = [items[i]]
    const sender = info.senderKey
    let prevMs = info.createdAtMs
    let j = i + 1

    while (j < items.length) {
      const next = describe(items[j])
      if (!next.groupable) break
      if (next.senderKey !== sender) break
      if (next.createdAtMs - prevMs > MEDIA_GROUP_WINDOW_MS) break
      groupItems.push(items[j])
      prevMs = next.createdAtMs
      j += 1
    }

    if (groupItems.length >= 2) {
      runs.push({ type: "group", key: `mediagroup-${keyOf(groupItems[0])}`, items: groupItems })
    } else {
      runs.push({ type: "single", item: groupItems[0] })
    }
    i = j
  }

  return runs
}
