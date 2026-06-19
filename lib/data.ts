export type Host = {
  id: string
  name: string
  avatar: string
  handle: string
}

export type Show = {
  id: string
  title: string
  tagline: string
  cover: string
  category: string
  host: Host
  status: "live" | "upcoming" | "ended"
  listeners: number
  startsAt?: string // human readable for upcoming
  duration?: string // for ended episodes
  publishedAt?: string
  description: string
}

export const hosts: Record<string, Host> = {
  maya: {
    id: "maya",
    name: "Maya Okafor",
    avatar: "/hosts/maya.png",
    handle: "@mayaonair",
  },
  devon: {
    id: "devon",
    name: "Devon Reyes",
    avatar: "/hosts/devon.png",
    handle: "@devonreyes",
  },
}

export const shows: Show[] = [
  {
    id: "culture-cast",
    title: "Culture Cast",
    tagline: "Where music, art, and the internet collide",
    cover: "/shows/culture-cast.png",
    category: "Culture",
    host: hosts.maya,
    status: "live",
    listeners: 2417,
    description:
      "A weekly live deep-dive into the moments shaping culture right now. Tonight Maya breaks down the year in sound with surprise call-in guests.",
  },
  {
    id: "tech-talk",
    title: "Signal & Noise",
    tagline: "The week in technology, unfiltered",
    cover: "/shows/tech-talk.png",
    category: "Technology",
    host: hosts.devon,
    status: "live",
    listeners: 1389,
    description:
      "Two engineers argue about the future every week. Live takes on AI, hardware, and the products you actually use.",
  },
  {
    id: "founder-hours",
    title: "Founder Hours",
    tagline: "Honest conversations with people building things",
    cover: "/shows/founder-hours.png",
    category: "Business",
    host: hosts.devon,
    status: "upcoming",
    listeners: 0,
    startsAt: "Today, 7:00 PM",
    description:
      "Candid interviews with founders about the messy middle of building a company. Bring your questions for the live call-in.",
  },
  {
    id: "sound-lab",
    title: "Sound Lab",
    tagline: "Producers breaking down how records get made",
    cover: "/shows/sound-lab.png",
    category: "Music",
    host: hosts.maya,
    status: "upcoming",
    listeners: 0,
    startsAt: "Tomorrow, 5:30 PM",
    description:
      "Go inside the session. Each week a guest producer rebuilds a track live and takes requests from the room.",
  },
  {
    id: "late-night",
    title: "After Hours",
    tagline: "Late night talk for night owls",
    cover: "/shows/late-night.png",
    category: "Talk",
    host: hosts.maya,
    status: "ended",
    listeners: 0,
    duration: "1h 12m",
    publishedAt: "2 days ago",
    description:
      "Recorded live. A loose, late-night conversation about everything and nothing, with the best call-ins of the week.",
  },
  {
    id: "mind-matters",
    title: "Mind Matters",
    tagline: "Conversations on psychology and being human",
    cover: "/shows/mind-matters.png",
    category: "Wellness",
    host: hosts.devon,
    status: "ended",
    listeners: 0,
    duration: "48m",
    publishedAt: "5 days ago",
    description:
      "A calmer corner of the platform. Recorded live with a psychologist guest and listener stories from the call-in line.",
  },
]

export const episodes: Show[] = [
  shows.find((s) => s.id === "late-night")!,
  shows.find((s) => s.id === "mind-matters")!,
  {
    id: "culture-cast-ep12",
    title: "Culture Cast — Ep. 12",
    tagline: "The summer of remixes",
    cover: "/shows/culture-cast.png",
    category: "Culture",
    host: hosts.maya,
    status: "ended",
    listeners: 0,
    duration: "58m",
    publishedAt: "1 week ago",
    description: "A look back at the tracks that defined the season, plus the wildest call-ins yet.",
  },
  {
    id: "signal-ep30",
    title: "Signal & Noise — Ep. 30",
    tagline: "The great hardware comeback",
    cover: "/shows/tech-talk.png",
    category: "Technology",
    host: hosts.devon,
    status: "ended",
    listeners: 0,
    duration: "1h 04m",
    publishedAt: "1 week ago",
    description: "Why everyone is building devices again, and what it means for software people.",
  },
  {
    id: "founder-ep08",
    title: "Founder Hours — Ep. 8",
    tagline: "Surviving the first year",
    cover: "/shows/founder-hours.png",
    category: "Business",
    host: hosts.devon,
    status: "ended",
    listeners: 0,
    duration: "1h 21m",
    publishedAt: "2 weeks ago",
    description: "A founder shares what almost killed the company, and the call that saved it.",
  },
  {
    id: "soundlab-ep04",
    title: "Sound Lab — Ep. 4",
    tagline: "Rebuilding a classic, live",
    cover: "/shows/sound-lab.png",
    category: "Music",
    host: hosts.maya,
    status: "ended",
    listeners: 0,
    duration: "52m",
    publishedAt: "3 weeks ago",
    description: "A guest producer reconstructs an iconic beat from scratch in real time.",
  },
]

export function getShow(id: string): Show | undefined {
  return [...shows, ...episodes].find((s) => s.id === id)
}

export const liveShows = shows.filter((s) => s.status === "live")
export const upcomingShows = shows.filter((s) => s.status === "upcoming")

export type ChatMessage = {
  id: string
  user: string
  color: string
  text: string
  host?: boolean
}

export const seedChat: ChatMessage[] = [
  { id: "1", user: "rivers", color: "text-chart-2", text: "this opener goes so hard" },
  { id: "2", user: "Maya", color: "text-primary", text: "welcome in everyone, mics are warm", host: true },
  { id: "3", user: "j_dot", color: "text-chart-3", text: "calling in from Lagos, 2am gang" },
  { id: "4", user: "petra", color: "text-chart-2", text: "can you play the remix from last week?" },
  { id: "5", user: "the_archivist", color: "text-chart-3", text: "first time catching this live, love it" },
  { id: "6", user: "nova", color: "text-chart-2", text: "the audio quality is unreal" },
]

export const chatPool: string[] = [
  "this is such a vibe",
  "calling in now!",
  "100% agree with that take",
  "where do you find these guests",
  "the energy tonight is different",
  "can we get a replay link after?",
  "greetings from Berlin",
  "best live show on the platform fr",
  "turn the music up a touch",
  "this guest is incredible",
  "i have a question for the call-in",
  "been here since the start, worth it",
]

export const callInQueue = [
  { id: "c1", name: "Jordan", topic: "Question about the new release", waiting: "0:42" },
  { id: "c2", name: "Priya", topic: "Wants to share a story", waiting: "1:18" },
  { id: "c3", name: "Marcus", topic: "Disagrees with the last point", waiting: "2:05" },
]

export type DevotionalComment = {
  id: string
  user: string
  initials: string
  color: string
  text: string
  postedAt: string
}

export type Devotional = {
  date: string
  title: string
  verseRef: string
  verse: string
  cover: string
  readingMinutes: number
  body: string[]
  prayer: string
  initialLikes: number
  comments: DevotionalComment[]
}

/**
 * Default attribution shown at the end of every devotional. The orderUrl is a
 * placeholder template link — replace it with the real ordering page later.
 */
export const devotionalSource = {
  author: "Andrew Smith",
  name: "A Day With Jesus",
  orderUrl: "https://example.com/order/a-day-with-jesus",
}

export const dailyDevotional: Devotional = {
  date: "Friday, June 19",
  title: "Be Still and Listen",
  verseRef: "Psalm 46:10",
  verse: "Be still, and know that I am God.",
  cover: "/devotional/sunrise.png",
  readingMinutes: 3,
  body: [
    "We live in a world tuned to noise. Notifications, deadlines, and the endless scroll all compete for the same quiet space where peace is meant to grow. Stillness has become something we schedule rather than something we inhabit.",
    "Yet the invitation in this verse is not to do more, but to stop. To be still is an act of trust — a way of saying that the world will keep turning even when we set down our striving for a moment. In that pause, we make room to remember who is actually holding things together.",
    "Today, before the day pulls you in a dozen directions, take a single breath and listen. Not for answers or instructions, but simply to be present. The same voice that calmed storms still speaks in the quiet, and it is often in the silence that we hear most clearly.",
  ],
  prayer:
    "Quiet my restless heart today. Help me to trust that I can stop, that I am held, and that your presence is enough. Teach me to listen in the stillness. Amen.",
  initialLikes: 248,
  comments: [
    {
      id: "d1",
      user: "Grace M.",
      initials: "GM",
      color: "bg-chart-2/20 text-chart-2",
      text: "Needed this today. The line about scheduling stillness instead of living in it hit hard.",
      postedAt: "2h ago",
    },
    {
      id: "d2",
      user: "Daniel O.",
      initials: "DO",
      color: "bg-chart-3/20 text-chart-3",
      text: "Reading this with my morning coffee before the chaos starts. Thank you.",
      postedAt: "4h ago",
    },
    {
      id: "d3",
      user: "Ruth A.",
      initials: "RA",
      color: "bg-primary/20 text-primary",
      text: "Sharing with my small group tonight. Such a timely word.",
      postedAt: "6h ago",
    },
  ],
}

export type FeedComment = {
  id: string
  user: string
  handle: string
  initials: string
  color: string
  text: string
  postedAt: string
}

export type FeedPost = {
  id: string
  user: string
  handle: string
  initials: string
  color: string
  postedAt: string
  text: string
  image?: string
  likes: number
  reposts: number
  comments: FeedComment[]
}

export const feedPosts: FeedPost[] = [
  {
    id: "p1",
    user: "Maya Okafor",
    handle: "@mayaonair",
    initials: "MO",
    color: "bg-primary/20 text-primary",
    postedAt: "32m",
    text: "Going live with Culture Cast tonight at 9. What's the one track that defined your year? Drop it below and I might play it on air.",
    likes: 184,
    reposts: 22,
    comments: [
      {
        id: "p1c1",
        user: "rivers",
        handle: "@riversflow",
        initials: "RV",
        color: "bg-chart-2/20 text-chart-2",
        text: "Easily the summer remix you premiered last month. Still on repeat.",
        postedAt: "20m",
      },
      {
        id: "p1c2",
        user: "j_dot",
        handle: "@jdot",
        initials: "JD",
        color: "bg-chart-3/20 text-chart-3",
        text: "Calling in from Lagos for this one!",
        postedAt: "12m",
      },
    ],
  },
  {
    id: "p2",
    user: "Devon Reyes",
    handle: "@devonreyes",
    initials: "DR",
    color: "bg-chart-3/20 text-chart-3",
    postedAt: "1h",
    text: "Hot take: the best ideas in tech right now aren't about more AI, they're about giving people quieter tools. Build things that get out of the way.",
    likes: 421,
    reposts: 87,
    comments: [
      {
        id: "p2c1",
        user: "nova",
        handle: "@novabuilds",
        initials: "NV",
        color: "bg-chart-2/20 text-chart-2",
        text: "This is exactly why I unsubscribed from half my notifications this week.",
        postedAt: "44m",
      },
    ],
  },
  {
    id: "p3",
    user: "Petra Lindqvist",
    handle: "@petra",
    initials: "PL",
    color: "bg-chart-2/20 text-chart-2",
    postedAt: "3h",
    text: "Caught the sunrise before the studio session this morning. Reminder to look up every now and then.",
    image: "/devotional/sunrise.png",
    likes: 309,
    reposts: 41,
    comments: [],
  },
]
