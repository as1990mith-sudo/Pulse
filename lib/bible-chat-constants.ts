// The maximum number of concurrent chat bubbles a reader can have open on their
// Bible page at once. When a reader already holds this many active chats, other
// readers who try to message them are told the reader is unavailable until they
// have a free slot again. Shared by the client (bubble cap) and the server
// (send-time enforcement) so the two never disagree.
export const MAX_BIBLE_CHATS = 4
