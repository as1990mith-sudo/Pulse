import { pgTable, text, timestamp, boolean, serial, integer, jsonb, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core"

// --- Better Auth required tables -------------------------------------------
// Column names are camelCase to match Better Auth's defaults. Do not rename.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  // Short user-written profile bio (max 25 words, enforced in the action).
  bio: text("bio"),
  // Who may @mention this user: "everyone" | "followers" | "none". Enforced
  // server-side; blocked mentions render as plain text and send no notification.
  mentionPrivacy: text("mentionPrivacy").notNull().default("everyone"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
})

// --- App tables ------------------------------------------------------------
// Public social content. Reads are global (everyone sees the feed); writes
// stamp the authoring user's id + display identity so authorship is real.

export const feedPost = pgTable("feed_post", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  authorName: text("authorName").notNull(),
  authorHandle: text("authorHandle").notNull(),
  text: text("text").notNull(),
  // Legacy single-media columns, kept for backward compatibility. New posts use
  // the `media` array below; `image`/`video` mirror the first item so old
  // readers still work.
  image: text("image"),
  video: text("video"),
  // Ordered carousel of media for Instagram-style multi-media posts. Each item
  // is { type: "image" | "video", url: string }. Null/empty for text posts.
  media: jsonb("media").$type<{ type: "image" | "video"; url: string }[]>(),
  // Scopes a post to a community room instead of the main social feed. Null =
  // the normal feed. "itestify" = an iTestify testimony. "qotd:<questionId>" =
  // a response under that Question of the Day's discussion thread. The main feed
  // query filters to channel IS NULL so room posts never leak into it.
  channel: text("channel"),
  // Resolved @mentions in `text`, in the order they appear. Each item is
  // { userId, name } for a user who passed the privacy check at save time.
  // Drives clickable mention links + notifications. Null/empty for none.
  mentions: jsonb("mentions").$type<{ userId: string; name: string }[]>(),
  likes: integer("likes").notNull().default(0),
  reposts: integer("reposts").notNull().default(0),
  // Set the first time the author edits the post; drives the "· edited" label.
  editedAt: timestamp("editedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Reposts: one row per (user, post) the user has reposted. Drives the profile
// "Reposts" tab and keeps feed_post.reposts (a denormalized counter) in sync.
// Unique index on (userId, postId) enforced in the DB.
export const repost = pgTable("repost", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  postId: integer("postId").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Follower / following relationships. followerId follows followingId.
export const follow = pgTable("follow", {
  id: serial("id").primaryKey(),
  followerId: text("followerId").notNull(),
  followingId: text("followingId").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const feedComment = pgTable(
  "feed_comment",
  {
    id: serial("id").primaryKey(),
    postId: integer("postId").notNull(),
    // When set, this comment is a reply to another comment (threaded replies).
    parentId: integer("parentId"),
    userId: text("userId").notNull(),
    authorName: text("authorName").notNull(),
    authorHandle: text("authorHandle").notNull(),
    text: text("text").notNull(),
    likes: integer("likes").notNull().default(0),
    editedAt: timestamp("editedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  // The feed loads comments scoped to the posts on screen
  // (WHERE postId IN (...)); this index keeps that lookup off a full-table scan.
  (t) => ({
    postIdx: index("feed_comment_post_idx").on(t.postId),
  }),
)

export const devotionalComment = pgTable("devotional_comment", {
  id: serial("id").primaryKey(),
  devotionalDate: text("devotionalDate").notNull(),
  parentId: integer("parentId"),
  userId: text("userId").notNull(),
  authorName: text("authorName").notNull(),
  text: text("text").notNull(),
  likes: integer("likes").notNull().default(0),
  editedAt: timestamp("editedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// --- Admin-managed content -------------------------------------------------
// Devotional readings and catalogue episodes published from the /admin
// dashboard. The most recent devotional (by createdAt) shows on the homepage.

export const devotional = pgTable("devotional", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  verseRef: text("verseRef").notNull(),
  verse: text("verse").notNull(),
  // Body paragraphs are stored as a single string, separated by blank lines.
  body: text("body").notNull(),
  prayer: text("prayer").notNull(),
  cover: text("cover"),
  readingMinutes: integer("readingMinutes").notNull().default(3),
  publishDate: text("publishDate").notNull(),
  // Lifecycle: "draft" | "scheduled" | "published" | "archived". Existing rows
  // default to "published" so nothing already live changes. Only published rows
  // (and scheduled rows whose time has passed) are shown to the public.
  status: text("status").notNull().default("published"),
  // When status is "scheduled", the time it should go live.
  scheduledFor: timestamp("scheduledFor"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  // Bumped whenever the devotional is (re)posted. The homepage shows the row
  // with the most recent lastPostedAt, so any devotional can be reused without
  // losing the others.
  lastPostedAt: timestamp("lastPostedAt").notNull().defaultNow(),
})

export const episode = pgTable("episode", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  tagline: text("tagline").notNull(),
  category: text("category").notNull(),
  hostName: text("hostName").notNull(),
  duration: text("duration"),
  cover: text("cover"),
  description: text("description").notNull(),
  // Recorded audio of the session (mic + background music), uploaded to Blob
  // when the host publishes. Null for episodes added without a recording.
  audioUrl: text("audioUrl"),
  // Recorded/uploaded video for video episodes, uploaded to Blob. When set, the
  // episode is treated as a video episode in the catalogue; otherwise audio.
  videoUrl: text("videoUrl"),
  // Optional named playlist a video episode belongs to (e.g. "Sunday Sermons").
  // Null means the video is ungrouped. Used to organize the Video catalogue.
  playlist: text("playlist"),
  // How the episode entered the catalogue: "upload" for a manually uploaded
  // file, "live" for a recording auto-published from a finished live session.
  // Drives the catalogue's separate "Live" tab so live recordings never mix
  // with manual uploads.
  source: text("source").notNull().default("upload"),
  // Set when a host publishes their own streamed session. Null for episodes
  // added by an admin from the content dashboard.
  hostUserId: text("hostUserId"),
  hostHandle: text("hostHandle"),
  likes: integer("likes").notNull().default(0),
  // When true the episode is hidden from everyone except its host (the owner).
  // Hosts toggle this from the episode menu on their own catalogue.
  isPrivate: boolean("isPrivate").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Comments left on a published, on-demand episode.
export const episodeComment = pgTable("episode_comment", {
  id: serial("id").primaryKey(),
  episodeId: integer("episodeId").notNull(),
  parentId: integer("parentId"),
  userId: text("userId").notNull(),
  authorName: text("authorName").notNull(),
  authorHandle: text("authorHandle").notNull(),
  text: text("text").notNull(),
  likes: integer("likes").notNull().default(0),
  editedAt: timestamp("editedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// --- Chatrooms -------------------------------------------------------------
// WhatsApp-style group chats. The creator becomes the admin/owner and can
// invite others via an invite code. Rooms are private — only members see them
// and their messages — but anyone can search rooms by name and request to join.

export const chatroom = pgTable("chatroom", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  image: text("image"),
  ownerId: text("ownerId").notNull(),
  ownerName: text("ownerName").notNull(),
  // "public" rooms are listed under Discover by default; "private" rooms are
  // hidden from the default list and only appear when searched by name.
  visibility: text("visibility").notNull().default("public"),
  inviteCode: text("inviteCode").notNull().unique(),
  // Shared chat wallpaper id (see lib/chat-backgrounds). Applies for all members.
  background: text("background"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const chatroomMember = pgTable("chatroom_member", {
  id: serial("id").primaryKey(),
  chatroomId: integer("chatroomId").notNull(),
  userId: text("userId").notNull(),
  userName: text("userName").notNull(),
  role: text("role").notNull().default("member"), // "admin" | "member"
  joinedAt: timestamp("joinedAt").notNull().defaultNow(),
})

export const chatroomMessage = pgTable("chatroom_message", {
  id: serial("id").primaryKey(),
  chatroomId: integer("chatroomId").notNull(),
  userId: text("userId").notNull(),
  userName: text("userName").notNull(),
  // "user" for normal chat, "system" for auto notices like "X joined the room".
  kind: text("kind").notNull().default("user"),
  body: text("body"), // nullable — a message can be attachment-only
  attachmentUrl: text("attachmentUrl"),
  attachmentType: text("attachmentType"), // "image" | "video" | "audio" | "document"
  attachmentName: text("attachmentName"),
  // Admin moderation: pinned messages surface at the top; deleted messages are
  // soft-deleted (kept for ordering) and shown as "message removed".
  pinned: boolean("pinned").notNull().default(false),
  deleted: boolean("deleted").notNull().default(false),
  // Set when the author edits the message (allowed within 15 minutes).
  editedAt: timestamp("editedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const chatroomJoinRequest = pgTable("chatroom_join_request", {
  id: serial("id").primaryKey(),
  chatroomId: integer("chatroomId").notNull(),
  userId: text("userId").notNull(),
  userName: text("userName").notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected"
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// --- Announcements ---------------------------------------------------------
// Paid promotional event banners shown at the top of the feed (tweet) tab.
// A creator pays ($5 per 12h, up to 72h) and submits a flyer + event details.
// Requests are auto-approved first-come-first-served per date; if the slot is
// already taken they are declined. Approved ads publish for the paid duration
// then auto-expire. Any user can add an active event to their calendar.
export const announcement = pgTable("announcement", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  creatorName: text("creatorName").notNull(),
  // What is being advertised. Events require date/time/venue; products require
  // a price. This is chosen (mandatorily) by the creator at creation time.
  adType: text("adType").notNull().default("event"), // "event" | "product"
  title: text("title").notNull(),
  description: text("description"),
  flyer: text("flyer"),
  location: text("location"), // venue (events) — required for events
  eventDate: text("eventDate"), // YYYY-MM-DD (events only)
  eventTime: text("eventTime"), // HH:MM (24h) (events only)
  price: text("price"), // raw amount string, shown with a $ prefix (products only)
  durationHours: integer("durationHours").notNull().default(12), // 12..72
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "declined"
  declineReason: text("declineReason"),
  publishedAt: timestamp("publishedAt"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Per-user interaction + visibility state for an advert. A viewer who taps
// "Want to know more" or "Not interested" gets a row (action set) and the ad is
// hidden for them; they can then toggle `hidden` to peek/re-hide it. The
// creator can also get a row (action null) purely to hide/show their own ad
// from their interface. Rows are scoped to one advert + one user.
export const announcementInteraction = pgTable("announcement_interaction", {
  id: serial("id").primaryKey(),
  announcementId: integer("announcementId").notNull(),
  userId: text("userId").notNull(),
  action: text("action"), // "interested" | "not_interested" | null (creator-only hide)
  hidden: boolean("hidden").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// --- Status updates --------------------------------------------------------
// WhatsApp-style ephemeral statuses. A user posts a photo or short video that
// stays visible to everyone for 24 hours (expiresAt). Viewers see the statuses
// of people they're connected to (follow or are followed by) first.
export const statusUpdate = pgTable("status_update", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  authorName: text("authorName").notNull(),
  mediaUrl: text("mediaUrl"), // null for text-only statuses
  mediaType: text("mediaType").notNull(), // "image" | "video" | "text"
  caption: text("caption"),
  backgroundColor: text("backgroundColor"), // gradient/solid key for text statuses
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  expiresAt: timestamp("expiresAt").notNull(),
})

// Tracks who has viewed each status (drives seen rings + the owner's viewers
// list) and an optional emoji reaction left by the viewer.
export const statusView = pgTable("status_view", {
  id: serial("id").primaryKey(),
  statusId: integer("statusId").notNull(),
  viewerId: text("viewerId").notNull(),
  viewerName: text("viewerName").notNull(),
  reaction: text("reaction"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// --- Live streams ----------------------------------------------------------
// A real, in-progress audio broadcast. A row is created when a host opens the
// studio and goes live (status "live"), and is marked "ended" when they stop.
// The roomName is the LiveKit room used for the WebRTC audio session.
export const liveStream = pgTable("live_stream", {
  id: serial("id").primaryKey(),
  roomName: text("roomName").notNull().unique(),
  hostId: text("hostId").notNull(),
  hostName: text("hostName").notNull(),
  hostHandle: text("hostHandle").notNull(),
  title: text("title").notNull(),
  category: text("category"),
  cover: text("cover"),
  mode: text("mode").notNull().default("audio"), // "audio" | "video"
  // Audio-Live layout. "podcast" is the original one-host broadcast studio;
  // "conversation" is the community-gathering room where everyone can speak.
  // Only meaningful when mode === "audio".
  layout: text("layout").notNull().default("podcast"), // "podcast" | "conversation"
  // Conversation-only: the "Today's Discussion" topic line under the title.
  topic: text("topic"),
  // Conversation-only: when non-null, Prayer Mode is active. Drives the shared
  // prayer overlay for everyone and disables music ducking while set.
  prayerStartedAt: timestamp("prayerStartedAt"),
  // For video streams, the layout the host chose to broadcast in:
  // "portrait" (full-bleed vertical, overlaid controls) or "landscape"
  // (Facebook-style: letterboxed 16:9 video on top, scrolling comment feed below).
  orientation: text("orientation").notNull().default("portrait"), // "portrait" | "landscape"
  status: text("status").notNull().default("live"), // "live" | "ended"
  // "public" streams appear in the live discovery list; "private" streams are
  // unlisted and reachable only by direct link (host-controlled before going live).
  visibility: text("visibility").notNull().default("public"), // "public" | "private"
  locked: boolean("locked").notNull().default(false), // host locked the stage (no new requests)
  // Host toggle for the guest call-in section. When true (default) the two
  // call-in slots are shown and viewers can request to join; when false the
  // slots are hidden and that space is split between the host video and chat.
  guestsEnabled: boolean("guestsEnabled").notNull().default(true),
  pinnedChatId: integer("pinnedChatId"), // a host-pinned chat message id
  chatBgUrl: text("chatBgUrl"), // host-uploaded chat background image
  chatBgEffect: text("chatBgEffect").notNull().default("none"), // "none" | "blur" | "dim"
  // Host-chosen immersive studio theme (id from lib/live-themes). Applied live
  // to both the host console and every listener's room.
  theme: text("theme").notNull().default("default"),
  startedAt: timestamp("startedAt").notNull().defaultNow(),
  // Host heartbeat. While live, the host pings this every ~20s. A stream whose
  // lastSeenAt has gone stale is treated as ended and auto-cleaned, so an
  // abandoned tab / dropped host never leaves a stream stuck "live" forever.
  lastSeenAt: timestamp("lastSeenAt").notNull().defaultNow(),
  endedAt: timestamp("endedAt"),
  // A co-host (with the End Session permission) can ask the host to end the
  // live. The host has 30s to approve/decline; if unanswered, getCallState
  // auto-ends the stream. These hold the in-flight request and are cleared when
  // the host resolves it or the request is approved/auto-ended.
  endRequestAt: timestamp("endRequestAt"),
  endRequestById: text("endRequestById"),
  endRequestByName: text("endRequestByName"),
  // ── Grid meeting (video + "landscape") coordination ──────────────────────
  // A single co-host, promoted by the host, who mirrors every host power
  // (mute, pin, promote, add track, end). Null when there is no co-host.
  gridCohostId: text("gridCohostId"),
  // The participant currently spotlighted on page 1. Defaults to the host when
  // null. Only one person is pinned at a time (pinning replaces the previous).
  gridPinnedId: text("gridPinnedId"),
  // An in-flight "request to pin" a participant. The target must accept before
  // they become gridPinnedId; cleared once resolved.
  gridPinRequestId: text("gridPinRequestId"),
  gridPinRequestName: text("gridPinRequestName"),
  // Host-selected Conversation video layout, synced to every participant so the
  // whole room shares the same tiling: "compact" (3×3, 9), "balanced" (2×3, 6),
  // or "focus" (2×2, 4). Only meaningful for "landscape" (Conversation) video.
  gridLayout: text("gridLayout").notNull().default("balanced"), // "compact" | "balanced" | "focus"
})

// Call-in requests (listener -> host) and invites (host -> listener) for a live
// room. kind = "request" | "invite"; status = "pending" | "accepted" |
// "declined" | "ended". Drives the guest call-in flow on top of LiveKit.
export const liveCallRequest = pgTable("live_call_request", {
  id: serial("id").primaryKey(),
  roomName: text("roomName").notNull(),
  userId: text("userId").notNull(),
  userName: text("userName").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("pending"),
  // Co-host system: an accepted speaker can be promoted by the main host to
  // "cohost", which unlocks a host-like console gated by the permissions below.
  role: text("role").notNull().default("guest"),
  // Co-host permissions (tickable by the main host only).
  canAcceptRequests: boolean("canAcceptRequests").notNull().default(false),
  canControlTracks: boolean("canControlTracks").notNull().default(false),
  canEndSession: boolean("canEndSession").notNull().default(false),
  // Music approval flow: the first time a co-host with Control Tracks tries to
  // upload, the host must approve. Once approved they keep control until the
  // Control Tracks permission is revoked.
  musicApproved: boolean("musicApproved").notNull().default(false),
  musicRequestPending: boolean("musicRequestPending").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// Real-time chat messages for a live stream room. Listeners poll for new
// messages while a broadcast is running.
export const liveChatMessage = pgTable("live_chat_message", {
  id: serial("id").primaryKey(),
  roomName: text("roomName").notNull(),
  userId: text("userId").notNull(),
  userName: text("userName").notNull(),
  // Author's avatar URL so the chat shows real profile pictures, not initials.
  userImage: text("userImage"),
  isHost: boolean("isHost").notNull().default(false),
  // "message" = a real chat line; "system" = a room event such as
  // "<name> entered the room" (rendered as a centered notice, no bubble).
  kind: text("kind").notNull().default("message"),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Tracks who is currently present in a live room. Every participant (host +
// listeners) upserts their row via a heartbeat every few seconds; rows whose
// lastSeenAt has gone stale are treated as "left". Drives the live audience
// count + names list, and the first insert posts an "entered the room" notice.
export const livePresence = pgTable("live_presence", {
  id: serial("id").primaryKey(),
  roomName: text("roomName").notNull(),
  userId: text("userId").notNull(),
  userName: text("userName").notNull(),
  userImage: text("userImage"),
  isHost: boolean("isHost").notNull().default(false),
  lastSeenAt: timestamp("lastSeenAt").notNull().defaultNow(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Ephemeral reactions + virtual gifts sent during a live broadcast. Every
// participant polls for new rows and floats the emoji up over the stage so the
// whole room sees the same reaction in near real time. kind = "reaction" |
// "gift"; label names the gift (e.g. "Rose", "Applause").
export const liveReaction = pgTable("live_reaction", {
  id: serial("id").primaryKey(),
  roomName: text("roomName").notNull(),
  userId: text("userId").notNull(),
  userName: text("userName").notNull(),
  kind: text("kind").notNull().default("reaction"), // "reaction" | "gift"
  emoji: text("emoji").notNull(),
  label: text("label"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Participants a host has blocked from a live room. A blocked user is kicked
// from the LiveKit room and prevented from rejoining for the life of the
// broadcast. Rows are scoped to one room + one user; unblocking deletes the row.
export const liveBlocked = pgTable("live_blocked", {
  id: serial("id").primaryKey(),
  roomName: text("roomName").notNull(),
  userId: text("userId").notNull(),
  userName: text("userName").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// --- Bible reading fellowship ----------------------------------------------
// Tracks who is currently reading the Bible and where. One row per user (a
// person reads a single place at a time), upserted via a heartbeat every few
// seconds; rows whose lastSeenAt has gone stale are treated as "left". Drives
// the live reader-presence indicator, the readers bottom sheet, and the global
// "N believers reading" fallback count.
export const biblePresence = pgTable(
  "bible_presence",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    userName: text("userName").notNull(),
    userImage: text("userImage"),
    // Which book/chapter they're in, and what they're doing right now.
    book: text("book").notNull(),
    chapter: integer("chapter").notNull().default(1),
    // "reading" | "listening" | "highlighting" | "notes" — shown on reader cards.
    activity: text("activity").notNull().default("reading"),
    lastSeenAt: timestamp("lastSeenAt").notNull().defaultNow(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    // One presence row per user — heartbeat upserts against this.
    userUnique: uniqueIndex("bible_presence_user_unique").on(t.userId),
  }),
)

// One row per user per calendar day they opened the Bible. Consecutive days
// power the reading-streak shown on reader cards.
export const bibleReadingDay = pgTable(
  "bible_reading_day",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    // Local calendar day as YYYY-MM-DD (computed client-side, sent on heartbeat).
    day: text("day").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    userDayUnique: uniqueIndex("bible_reading_day_user_day_unique").on(t.userId, t.day),
  }),
)

// Per-user verse highlights. verseId is "bookIndex:chapter:verse" (e.g. "42:3:16").
// One highlight per verse per user (unique index), so re-highlighting updates the
// colour in place. Replaces the old localStorage-only highlight store so colours
// survive across sessions and devices.
export const bibleHighlight = pgTable(
  "bible_highlight",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    verseId: text("verseId").notNull(),
    color: text("color").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    userVerseUnique: uniqueIndex("bible_highlight_user_verse_idx").on(t.userId, t.verseId),
  }),
)

// Per-user notes attached to a verse. verseId matches bibleHighlight's format.
// One note per verse per user; saving again overwrites the body (edit in place).
export const bibleNote = pgTable(
  "bible_note",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    verseId: text("verseId").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    userVerseUnique: uniqueIndex("bible_note_user_verse_idx").on(t.userId, t.verseId),
  }),
)

// One row per chat bubble a reader currently has open on their Bible page, kept
// alive by a heartbeat (like bible_presence). Powers the "max 4 concurrent
// chats" rule: when a reader already holds this many fresh slots, a new sender
// is told the reader can't receive more messages until they're free again.
export const bibleChatSlot = pgTable(
  "bible_chat_slot",
  {
    id: serial("id").primaryKey(),
    // The reader who has the chat bubble open (the potential recipient).
    userId: text("userId").notNull(),
    conversationId: integer("conversationId").notNull(),
    // The other participant in that chat (for clarity/debugging).
    partnerId: text("partnerId").notNull(),
    lastSeenAt: timestamp("lastSeenAt").notNull().defaultNow(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    // One slot per (reader, conversation) — heartbeat upserts against this.
    userConvUnique: uniqueIndex("bible_chat_slot_user_conv_unique").on(t.userId, t.conversationId),
  }),
)

// --- Direct messages -------------------------------------------------------
// 1:1 private conversations between two users (WhatsApp-style). A conversation
// row is created the first time either user messages the other. The pair is
// stored with the lexicographically-smaller id as userAId so each pair is
// unique regardless of who started it. lastMessageAt powers inbox ordering and
// the per-user lastReadAt columns drive unread badges.
export const dmConversation = pgTable("dm_conversation", {
  id: serial("id").primaryKey(),
  userAId: text("userAId").notNull(),
  userBId: text("userBId").notNull(),
  lastMessageAt: timestamp("lastMessageAt").notNull().defaultNow(),
  userALastReadAt: timestamp("userALastReadAt").notNull().defaultNow(),
  userBLastReadAt: timestamp("userBLastReadAt").notNull().defaultNow(),
  // Official "Frequency Team" messages are flagged priority: they stay pinned
  // to the top of the recipient's inbox until the recipient opens the thread.
  priority: boolean("priority").notNull().default(false),
  // "Respond later" (WhatsApp-style archive) is per-user: each side can move the
  // thread out of their main inbox into their own Respond later list.
  userAArchived: boolean("userAArchived").notNull().default(false),
  userBArchived: boolean("userBArchived").notNull().default(false),
  // Per-user "delete chat": clears the thread from that user's inbox up to this
  // moment. Messages that arrive afterwards bring the conversation back.
  userADeletedAt: timestamp("userADeletedAt"),
  userBDeletedAt: timestamp("userBDeletedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  })

export const dmMessage = pgTable("dm_message", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversationId").notNull(),
  senderId: text("senderId").notNull(),
  body: text("body"), // nullable — a message can be attachment-only
  attachmentUrl: text("attachmentUrl"),
  attachmentType: text("attachmentType"), // "image" | "video" | "audio" | "document"
  attachmentName: text("attachmentName"),
  // When set, this message is a reply/reaction to the given status update. The
  // inbox links to the status while it's still live (see app/status/[id]).
  statusId: integer("statusId"),
  // Pinned messages stay highlighted in the thread; deleted ones are soft-
  // deleted (content cleared) so message ordering is preserved.
  pinned: boolean("pinned").notNull().default(false),
  deleted: boolean("deleted").notNull().default(false),
  // Set when the sender edits the message (allowed within 15 minutes).
  editedAt: timestamp("editedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// 1:1 audio/video call signaling between two DM users. The pair share a
// LiveKit room (room name derived from the call id). mode = "audio" | "video";
// status = "ringing" | "active" | "declined" | "ended" | "missed".
export const dmCall = pgTable("dm_call", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversationId").notNull(),
  callerId: text("callerId").notNull(),
  callerName: text("callerName").notNull(),
  calleeId: text("calleeId").notNull(),
  mode: text("mode").notNull().default("audio"),
  status: text("status").notNull().default("ringing"),
  // Flipped to true once the callee's device has registered the incoming call
  // (i.e. they're online). Lets the caller show "Ringing" vs "Calling".
  calleeAck: boolean("calleeAck").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// Per-user notifications. A row is created for each follower when someone they
// follow posts a tweet or starts a live stream.
export const notification = pgTable("notification", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  actorId: text("actorId").notNull(),
  actorName: text("actorName").notNull(),
  type: text("type").notNull(), // "post" | "live"
  message: text("message").notNull(),
  link: text("link").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Items a user has saved via the share sheet ("Save Post" quick action). One
// row per (user, itemType, itemKey) — see the unique index in the DB.
export const savedItem = pgTable("saved_item", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  itemType: text("itemType").notNull(), // "post" | "episode" | "devotional" | "status" | "live"
  itemKey: text("itemKey").notNull(), // stable identifier within the type
  title: text("title"),
  subtitle: text("subtitle"),
  url: text("url").notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// --- Community Help (Jodel-style Q&A room) ---------------------------------
// A single global room every user can post to. Each post carries an `anonymous`
// flag chosen by the author at post time: when true the author id is kept only
// for moderation and is never exposed to other clients; when false the author's
// name + avatar are shown to everyone (an identifiable post).
export const communityPost = pgTable("community_post", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(), // author — exposed to others only when anonymous=false
  body: text("body").notNull(),
  imageUrl: text("imageUrl"), // optional attached image (Vercel Blob URL)
  videoUrl: text("videoUrl"), // optional attached video (Vercel Blob URL)
  // Author's choice at post time. Defaults to true so legacy posts stay anonymous.
  anonymous: boolean("anonymous").notNull().default(true),
  likes: integer("likes").notNull().default(0),
  deleted: boolean("deleted").notNull().default(false),
  editedAt: timestamp("editedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  })

// Replies to a community post. Unlike posts, comments are NOT anonymous — the
// commenter's name/profile is shown and links to their profile.
export const communityComment = pgTable("community_comment", {
  id: serial("id").primaryKey(),
  postId: integer("postId").notNull(),
  parentId: integer("parentId"),
  userId: text("userId").notNull(),
  userName: text("userName").notNull(),
  body: text("body").notNull(),
  likes: integer("likes").notNull().default(0),
  deleted: boolean("deleted").notNull().default(false),
  editedAt: timestamp("editedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// --- Dream Interpretation (anonymous dreams, admin-only replies) -----------
// A dream shared by a user. Like community posts, dreams are ANONYMOUS to other
// members — but the author's id + name ARE kept so the admin (and only the
// admin) can see who sent each dream and reply to it privately-as-publicly.
export const dream = pgTable("dream", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(), // hidden author — exposed ONLY to the admin
  userName: text("userName").notNull(), // shown only to the admin in their inbox
  body: text("body").notNull(),
  deleted: boolean("deleted").notNull().default(false),
  editedAt: timestamp("editedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// The admin's interpretation of a dream. Surfaces to every member as a comment
// under the dream. Members can only like or copy it — never reply or edit.
export const dreamReply = pgTable("dream_reply", {
  id: serial("id").primaryKey(),
  dreamId: integer("dreamId").notNull(),
  adminId: text("adminId").notNull(),
  adminName: text("adminName").notNull(),
  body: text("body").notNull(),
  likes: integer("likes").notNull().default(0),
  deleted: boolean("deleted").notNull().default(false),
  editedAt: timestamp("editedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// --- Likes (per-user, per-content) -----------------------------------------
// One row per (user, targetType, targetId). Backs the denormalized `likes`
// counters on posts/comments/etc. so a member can like something exactly once
// and that liked state survives refreshes. The unique index enforces idempotency
// and lets inserts use onConflictDoNothing.
export const like = pgTable(
  "like",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    // "post" | "feed_comment" | "episode" | "episode_comment" |
    // "devotional_comment" | "community_comment" | "dream_reply"
    targetType: text("targetType").notNull(),
    targetId: integer("targetId").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("like_user_target_unique").on(t.userId, t.targetType, t.targetId),
  }),
)

// --- Content views (episode plays) -----------------------------------------
// One row per qualifying episode play: a play/open that reached at least 5% of
// the episode's length. Views are the total number of rows (every play counts,
// including repeats by the same person). `userId` is null for signed-out plays.
export const contentView = pgTable("content_view", {
  id: serial("id").primaryKey(),
  userId: text("userId"),
  episodeId: integer("episodeId").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// --- Shares -----------------------------------------------------------------
// One row per deliberate share action (send to a chat, copy link, native share,
// add to status, external app). Backs the denormalized share counts shown on
// posts and episodes. `userId` is null for signed-out shares (e.g. copy link).
export const share = pgTable("share", {
  id: serial("id").primaryKey(),
  userId: text("userId"),
  targetType: text("targetType").notNull(), // "post" | "episode"
  targetKey: text("targetKey").notNull(), // post id or episode id, as a string
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// --- Store (creator marketplace) -------------------------------------------
// A product any signed-in user can publish and sell: a book or a course. Prices
// are stored in integer cents to avoid floating-point money bugs. The creator
// is the seller; `creatorId` scopes "my listings" queries. Book-only and
// course-only columns are nullable and validated in the action by `kind`.
export const storeProduct = pgTable("store_product", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // "book" | "course"
  creatorId: text("creatorId").notNull(),
  creatorName: text("creatorName").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  description: text("description").notNull().default(""),
  category: text("category").notNull(),
  language: text("language").notNull().default("English"),
  coverUrl: text("coverUrl").notNull(),
  priceCents: integer("priceCents").notNull().default(0),
  // Book: the deliverable file (PDF/EPUB) + page count.
  bookFileUrl: text("bookFileUrl"),
  bookFileName: text("bookFileName"),
  pages: integer("pages"),
  // Course: difficulty label + human-readable total duration.
  difficulty: text("difficulty"), // "Beginner" | "Intermediate" | "Advanced"
  totalDuration: text("totalDuration"),
  published: boolean("published").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Ordered lessons that make up a course. Each lesson carries a playable media
// URL (video or audio) delivered to buyers who own the parent product.
export const storeLesson = pgTable("store_lesson", {
  id: serial("id").primaryKey(),
  productId: integer("productId").notNull(),
  position: integer("position").notNull().default(0),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("video"), // "video" | "audio"
  duration: text("duration").notNull().default(""),
  mediaUrl: text("mediaUrl").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// One row per (buyer, product). Backs the buyer's Library and the "owned" gate
// on product pages. Unique index enforces one purchase per product per user.
export const storePurchase = pgTable(
  "store_purchase",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    productId: integer("productId").notNull(),
    pricePaidCents: integer("pricePaidCents").notNull().default(0),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("store_purchase_user_product_unique").on(t.userId, t.productId),
  }),
)

// --- Shared Live Experience System -----------------------------------------
// Powers the universal resource drawer + floating mini-panels that overlay any
// of the four live formats (broadcast video, conversation video, podcast audio,
// conversation audio) without ever navigating the user away from the live.

// Private, per-user notes captured while inside a live. Every note is tagged
// with the session's host/topic/date so the main-app "Live Notes" section can
// group them Host → Topic → Date. roomName ties the note to the live session it
// was taken in (nullable so a note can outlive the stream row). Scoped by userId
// (no RLS on Neon).
export const liveNote = pgTable(
  "live_note",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    // The LiveKit room key of the session this note was taken in (matches
    // live_chat_message.roomName). Null once decoupled from a live.
    roomName: text("roomName"),
    streamId: integer("streamId"), // liveStream.id snapshot, for linking back
    hostId: text("hostId"),
    hostName: text("hostName"),
    topic: text("topic"), // session topic / title line used for grouping
    sessionTitle: text("sessionTitle"),
    mode: text("mode"), // "audio" | "video" snapshot of the live format
    body: text("body").notNull().default(""),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: uniqueIndex("live_note_id_user_idx").on(t.id, t.userId),
  }),
)

// Host-pinned resources for a live room. Participants read them from the
// resource drawer. kind ∈ verse|pdf|book|devotional|link|session. meta carries
// kind-specific payload (e.g. a verseId, productId, or episode slug).
export const pinnedResource = pgTable("pinned_resource", {
  id: serial("id").primaryKey(),
  roomName: text("roomName").notNull(),
  pinnedBy: text("pinnedBy").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  url: text("url"),
  refId: text("refId"),
  meta: jsonb("meta"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Prayer requests submitted by participants inside a live. userId is nullable so
// signed-out viewers can still post (as authorName / anonymous). prayedCount is
// a simple "I prayed" tally.
export const prayerRequest = pgTable("prayer_request", {
  id: serial("id").primaryKey(),
  roomName: text("roomName").notNull(),
  userId: text("userId"),
  authorName: text("authorName").notNull(),
  body: text("body").notNull(),
  isAnonymous: boolean("isAnonymous").notNull().default(false),
  prayedCount: integer("prayedCount").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Per-user verse bookmarks from the mini-Bible panel. verseId matches
// bibleHighlight/bibleNote's "bookIndex:chapter:verse" format; reference is the
// human label (e.g. "John 3:16") cached for list display. One bookmark per verse
// per user (unique index) so toggling is idempotent.
export const bibleBookmark = pgTable(
  "bible_bookmark",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    verseId: text("verseId").notNull(),
    reference: text("reference").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    userVerseUnique: uniqueIndex("bible_bookmark_user_verse_idx").on(t.userId, t.verseId),
  }),
)

// --- Articles (long-form writing / blog) -----------------------------------
// A long-form article any signed-in member can write and publish. The body is
// sanitized HTML (see lib/article-sanitize.ts) produced by the rich editor.
// `status` gates visibility: only "published" rows appear in the public hub;
// "draft"/"archived" are visible only to the author. Engagement counters
// (likeCount/commentCount/viewCount) are denormalized and kept in sync from the
// shared `like`/`share` tables + the article_comment table. Authorship is real:
// authorId scopes "my articles" and the writer profile.
export const article = pgTable("article", {
  id: serial("id").primaryKey(),
  authorId: text("authorId").notNull(),
  authorName: text("authorName").notNull(),
  authorHandle: text("authorHandle").notNull(),
  authorImage: text("authorImage"),
  title: text("title").notNull(),
  // Short plain-text summary shown on cards + used for SEO/meta. Derived from
  // the body on save when the author leaves it blank.
  excerpt: text("excerpt").notNull().default(""),
  // Sanitized HTML body. Never rendered without passing through the sanitizer.
  bodyHtml: text("bodyHtml").notNull().default(""),
  coverUrl: text("coverUrl"),
  category: text("category").notNull().default("General"),
  // Free-text comma-free tags stored as a JSON array of strings.
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  // Resolved @mentions inside `bodyHtml`, in appearance order. Each item is
  // { userId, name } for a user who passed the privacy check at publish time.
  // Drives notifications; the clickable links live in the sanitized HTML.
  mentions: jsonb("mentions").$type<{ userId: string; name: string }[]>(),
  // "draft" | "published" | "archived"
  status: text("status").notNull().default("draft"),
  // Estimated read time in minutes, derived from word count on save.
  readMinutes: integer("readMinutes").notNull().default(1),
  featured: boolean("featured").notNull().default(false),
  likeCount: integer("likeCount").notNull().default(0),
  commentCount: integer("commentCount").notNull().default(0),
  viewCount: integer("viewCount").notNull().default(0),
  // Set the moment status first flips to "published"; drives sort + display.
  publishedAt: timestamp("publishedAt"),
  editedAt: timestamp("editedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// Threaded comments on an article. parentId is null for top-level comments and
// points at another comment for one level of replies. likes is denormalized and
// backed by the shared `like` table (targetType "article_comment").
export const articleComment = pgTable("article_comment", {
  id: serial("id").primaryKey(),
  articleId: integer("articleId").notNull(),
  parentId: integer("parentId"),
  userId: text("userId").notNull(),
  userName: text("userName").notNull(),
  userImage: text("userImage"),
  body: text("body").notNull(),
  likes: integer("likes").notNull().default(0),
  deleted: boolean("deleted").notNull().default(false),
  editedAt: timestamp("editedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Writer-subscribe graph, kept SEPARATE from the social `follow` table so a
// member can follow someone's articles without following their social profile
// (and vice-versa). One row per (writer, follower).
export const articleFollow = pgTable(
  "article_follow",
  {
    id: serial("id").primaryKey(),
    writerId: text("writerId").notNull(),
    followerId: text("followerId").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("article_follow_writer_follower_unique").on(t.writerId, t.followerId),
  }),
)

// Per-user reading progress for an article. One row per (user, article), upserted
// as the reader scrolls. Powers the Library's "Continue Reading" (in-progress) and
// "Reading History" (everything opened, with a completed flag) sections.
export const articleReadingProgress = pgTable(
  "article_reading_progress",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    articleId: integer("articleId").notNull(),
    // Furthest scroll depth reached, 0-100. Used to restore position + show bars.
    percent: integer("percent").notNull().default(0),
    // True once the reader reaches (near) the end — differentiates finished reads.
    completed: boolean("completed").notNull().default(false),
    lastReadAt: timestamp("lastReadAt").notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("article_reading_progress_user_article_unique").on(t.userId, t.articleId),
  }),
)

// Comment reports for lightweight moderation. One row per (reporter, comment).
export const articleCommentReport = pgTable(
  "article_comment_report",
  {
    id: serial("id").primaryKey(),
    commentId: integer("commentId").notNull(),
    reporterId: text("reporterId").notNull(),
    reason: text("reason").notNull().default(""),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("article_comment_report_unique").on(t.commentId, t.reporterId),
  }),
)

// --- Admin Console ----------------------------------------------------------
// Operational tables for the Frequency Admin Console. Identity is always the
// permanent user.id (never a display name). Created via scripts/setup-admin-console.mjs.

// Role-based access control: who is an admin and at what level.
export const adminMember = pgTable("admin_member", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().unique(),
  role: text("role").notNull().default("moderator"),
  createdBy: text("createdBy"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// User-submitted reports against any content type, profile, or message.
export const contentReport = pgTable("content_report", {
  id: text("id").primaryKey(),
  contentType: text("contentType").notNull(),
  contentId: text("contentId").notNull(),
  reporterId: text("reporterId"),
  reason: text("reason").notNull(),
  details: text("details"),
  status: text("status").notNull().default("pending"),
  resolvedBy: text("resolvedBy"),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Permanent, append-only moderation history.
export const moderationAction = pgTable("moderation_action", {
  id: text("id").primaryKey(),
  targetType: text("targetType").notNull(),
  targetId: text("targetId").notNull(),
  action: text("action").notNull(),
  reason: text("reason"),
  adminId: text("adminId").notNull(),
  reportId: text("reportId"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Current moderation status per user.
export const userModerationState = pgTable("user_moderation_state", {
  userId: text("userId").primaryKey(),
  status: text("status").notNull().default("active"),
  verified: boolean("verified").notNull().default(false),
  warnings: integer("warnings").notNull().default(0),
  suspendedUntil: timestamp("suspendedUntil"),
  reason: text("reason"),
  updatedBy: text("updatedBy"),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// Universal moderation state for any piece of content, keyed by (type, id).
// Lets moderators hide/remove/restore posts, articles, episodes, comments, etc.
// without adding a column to every content table. "visible" rows are omitted in
// practice — absence of a row means visible.
export const contentModerationState = pgTable(
  "content_moderation_state",
  {
    contentType: text("contentType").notNull(),
    contentId: text("contentId").notNull(),
    state: text("state").notNull().default("visible"), // "visible" | "hidden" | "removed"
    reason: text("reason"),
    moderatedBy: text("moderatedBy"),
    moderatedAt: timestamp("moderatedAt").notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.contentType, t.contentId] }) }),
)

// Support / complaints / feedback ticketing.
export const supportTicket = pgTable("support_ticket", {
  id: text("id").primaryKey(),
  userId: text("userId"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  category: text("category").notNull().default("complaint"),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("open"),
  assignedTo: text("assignedTo"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// Mandatory pre-publication approval workflow for books.
export const bookSubmission = pgTable("book_submission", {
  id: text("id").primaryKey(),
  productId: text("productId").notNull(),
  status: text("status").notNull().default("pending"),
  reviewedBy: text("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  feedback: text("feedback"),
  internalNotes: text("internalNotes"),
  submissionCount: integer("submissionCount").notNull().default(1),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// Broadcast Centre: announcements, maintenance notices, emergency, banners.
export const broadcast = pgTable("broadcast", {
  id: text("id").primaryKey(),
  type: text("type").notNull().default("announcement"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  audience: text("audience").notNull().default("everyone"),
  status: text("status").notNull().default("draft"),
  scheduledFor: timestamp("scheduledFor"),
  sentAt: timestamp("sentAt"),
  createdBy: text("createdBy").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Targeted push notification campaigns.
export const pushCampaign = pgTable("push_campaign", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  audience: text("audience").notNull().default("everyone"),
  status: text("status").notNull().default("draft"),
  scheduledFor: timestamp("scheduledFor"),
  sentAt: timestamp("sentAt"),
  recipientCount: integer("recipientCount"),
  createdBy: text("createdBy").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Append-only audit trail for every admin action.
export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  adminId: text("adminId").notNull(),
  action: text("action").notNull(),
  targetType: text("targetType"),
  targetId: text("targetId"),
  result: text("result").notNull().default("success"),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// --- Question of the Day ---------------------------------------------------
// One thought-provoking Christian/life question published by an admin for a
// focused daily community discussion. Only admins create/publish these; regular
// users only view and respond. Responses live in feed_post with
// channel = "qotd:<id>", so they reuse the whole feed engagement + media stack.
// Lifecycle mirrors devotionals: draft | scheduled | published | archived.
// Exactly one question is the live/featured one at a time (the most recently
// published, non-archived row); publishing a new one archives the previous.
export const qotdQuestion = pgTable("qotd_question", {
  id: serial("id").primaryKey(),
  adminId: text("adminId").notNull(),
  adminName: text("adminName").notNull(),
  questionText: text("questionText").notNull(),
  // Optional admin-uploaded image, shown with the featured question. Uses the
  // existing Frequency image upload + cropping flow.
  image: text("image"),
  status: text("status").notNull().default("draft"),
  // The publication / active date (YYYY-MM-DD), per the scheduling system.
  activeDate: text("activeDate").notNull(),
  scheduledFor: timestamp("scheduledFor"),
  publishedAt: timestamp("publishedAt"),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Global "who is online right now" heartbeat. One row per signed-in user,
// upserted every ~25s by a client heartbeat while the app tab is visible. A
// user counts as online only while their lastSeenAt is fresh (last minute), so
// the admin "Online now" figure is a true real-time count rather than a tally
// of long-lived login sessions.
export const onlinePresence = pgTable("online_presence", {
  userId: text("userId")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  lastSeenAt: timestamp("lastSeenAt").notNull().defaultNow(),
})
