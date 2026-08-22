"use client"

import { ParticipantGrid } from "@/components/conversation/participant-grid"

const NAMES = [
  "Amara Okafor",
  "Ben Carter",
  "Chidi Nwosu",
  "Dana Silva",
  "Eli Bennett",
  "Fatima Zahra",
  "Grace Lin",
  "Hassan Ali",
  "Ines Duarte",
  "Jonas Weber",
  "Keiko Tanaka",
  "Liam Murphy",
  "Maya Iyer",
  "Noah Brooks",
  "Omar Haddad",
  "Priya Nair",
]

const COLORS = ["#ef8354", "#4f9d69", "#3d7ea6", "#b5651d", "#7a6ff0", "#c9484b", "#2f9c95", "#d1a13a"]

const participants = NAMES.map((name, i) => ({
  identity: `u${i}`,
  name,
  image: null,
  color: COLORS[i % COLORS.length],
  isSpeaking: i === 0,
  micOn: i % 3 !== 0,
  isLocal: i === 1,
  isHost: i === 0,
  pinned: false,
}))

export default function GridPreviewPage() {
  return (
    <div className="flex h-dvh flex-col bg-zinc-950">
      <div className="shrink-0 p-3 text-sm font-semibold text-white">Conversation · 16 people</div>
      {/* Chat-open stage: 2 rows of 4 in half the height. */}
      <div className="min-h-0 flex-1 border-y border-white/10">
        <ParticipantGrid participants={participants} perPage={8} />
      </div>
      <div className="h-1/2 shrink-0 p-3 text-xs text-white/40">chat panel</div>
    </div>
  )
}
