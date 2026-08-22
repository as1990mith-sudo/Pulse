import { ParticipantGrid, type GridParticipant } from "@/components/conversation/participant-grid"
import { getAvatarColor } from "@/lib/identity"

// Temporary visual harness for the 4x4 conversation grid. Renders the real
// component inside the same stage box the room uses so the vertical framing can
// be checked without LiveKit or an auth session. Deleted after verification.
const NAMES = [
  "Amara Okafor", "Ben Carter", "Chidi Nwosu", "Dana Silva",
  "Eli Bennett", "Fatima Zahra", "Grace Lin", "Hassan Ali",
  "Iris Nakamura", "Jonas Weber", "Kemi Adeyemi", "Liam Murphy",
  "Maya Patel", "Noah Kim", "Olu Bankole", "Priya Raman",
]

export default function GridPreviewPage() {
  const participants: GridParticipant[] = NAMES.map((name, i) => ({
    identity: `u${i}`,
    name,
    image: null,
    color: getAvatarColor(`u${i}`),
    isSpeaking: i === 0,
    micOn: i % 3 !== 0,
    isLocal: i === 1,
    isHost: i === 0,
    pinned: false,
  }))

  return (
    <div className="flex h-dvh flex-col bg-neutral-950 text-white">
      {/* Stand-in for the room's compact header. */}
      <div className="flex h-14 shrink-0 items-center border-b border-white/10 px-4 text-sm font-semibold">
        Conversation · 16 people
      </div>
      {/* Chat-open case: half-height stage, perPage 8 (2 rows of 4). */}
      <div className="min-h-0 flex-1">
        <ParticipantGrid participants={participants} perPage={8} />
      </div>
      <div className="h-1/2 shrink-0 border-t border-white/10 p-3 text-xs text-white/40">chat panel</div>
      {/* Stand-in for the bottom control dock. */}
      <div className="flex h-20 shrink-0 items-center justify-center gap-3 border-t border-white/10 text-xs text-white/50">
        control dock
      </div>
    </div>
  )
}
