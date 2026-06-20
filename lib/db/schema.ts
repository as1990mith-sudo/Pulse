import { pgTable, text, timestamp, boolean, serial, integer } from "drizzle-orm/pg-core"

// --- Better Auth required tables -------------------------------------------
// Column names are camelCase to match Better Auth's defaults. Do not rename.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
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
  image: text("image"),
  video: text("video"),
  likes: integer("likes").notNull().default(0),
  reposts: integer("reposts").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Follower / following relationships. followerId follows followingId.
export const follow = pgTable("follow", {
  id: serial("id").primaryKey(),
  followerId: text("followerId").notNull(),
  followingId: text("followingId").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const feedComment = pgTable("feed_comment", {
  id: serial("id").primaryKey(),
  postId: integer("postId").notNull(),
  userId: text("userId").notNull(),
  authorName: text("authorName").notNull(),
  authorHandle: text("authorHandle").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const devotionalComment = pgTable("devotional_comment", {
  id: serial("id").primaryKey(),
  devotionalDate: text("devotionalDate").notNull(),
  userId: text("userId").notNull(),
  authorName: text("authorName").notNull(),
  text: text("text").notNull(),
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
  // Set when a host publishes their own streamed session. Null for episodes
  // added by an admin from the content dashboard.
  hostUserId: text("hostUserId"),
  hostHandle: text("hostHandle"),
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
  inviteCode: text("inviteCode").notNull().unique(),
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
  body: text("body"), // nullable — a message can be attachment-only
  attachmentUrl: text("attachmentUrl"),
  attachmentType: text("attachmentType"), // "image" | "video" | "document"
  attachmentName: text("attachmentName"),
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
  title: text("title").notNull(),
  description: text("description"),
  flyer: text("flyer"),
  location: text("location"),
  eventDate: text("eventDate").notNull(), // YYYY-MM-DD
  eventTime: text("eventTime"), // HH:MM (24h), optional
  durationHours: integer("durationHours").notNull().default(12), // 12..72
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "declined"
  declineReason: text("declineReason"),
  publishedAt: timestamp("publishedAt"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// --- Status updates --------------------------------------------------------
// WhatsApp-style ephemeral statuses. A user posts a photo or short video that
// stays visible to everyone for 24 hours (expiresAt). Viewers see the statuses
// of people they're connected to (follow or are followed by) first.
export const statusUpdate = pgTable("status_update", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  authorName: text("authorName").notNull(),
  mediaUrl: text("mediaUrl").notNull(),
  mediaType: text("mediaType").notNull(), // "image" | "video"
  caption: text("caption"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  expiresAt: timestamp("expiresAt").notNull(),
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
