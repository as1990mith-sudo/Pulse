import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Sora } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { SkinProvider, SKIN_INIT_SCRIPT } from '@/components/skin-provider'
import { LiveSessionProvider } from '@/components/live-session'
import { EpisodePlayerProvider } from '@/components/episode-player-provider'
import { LiveProcessingProvider } from '@/components/live-processing-provider'
import { AutoRefresh } from '@/components/auto-refresh'
import { PresenceHeartbeat } from '@/components/presence-heartbeat'
import { BottomNav } from '@/components/bottom-nav'
import { HomeContextProvider, type ActiveHomeSummary } from '@/components/home/home-context'
import { getActiveHomeContext } from '@/lib/home/active-home'
import { DEFAULT_HOME_ACCENT } from '@/lib/home/accent'
import './globals.css'

// Every route in this app is personalized (session + live database reads), so
// none of it should be statically prerendered at build time — that would both
// bake in a logged-out shell and fail the build when the DB is unreachable
// during `next build`. Setting `dynamic` here cascades to all child segments,
// so each page is rendered per-request instead. (Applies to the whole app.)
export const dynamic = 'force-dynamic'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})
// Distinctive display face used for episode titles.
const sora = Sora({ variable: '--font-sora', subsets: ['latin'], weight: ['600', '700'] })

export const metadata: Metadata = {
  title: 'Frequency',
  description:
    'Go live, build your audience, and stream audio + video podcasts in real time. Listen in, chat, and call in to the conversation.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0c0c0f',
  width: 'device-width',
  initialScale: 1,
  // Let content extend into the iOS notch / home-indicator area; we then pad
  // with safe-area insets so nothing important sits under the cutouts.
  viewportFit: 'cover',
  // Allow pinch-zoom for accessibility, but don't auto-zoom on input focus.
  maximumScale: 5,
  // When the on-screen keyboard opens, shrink the layout viewport (and `dvh`)
  // instead of just the visual viewport. This keeps fixed full-height surfaces
  // — like the immersive live room and its chat composer — pinned above the
  // keyboard so the input stays static instead of being shoved up the screen.
  interactiveWidget: 'resizes-content',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Resolve the viewer's active Home once, server-side, and thread a client-safe
  // summary through the tree. Every Home-scoped surface reads the same context.
  const { home, membership } = await getActiveHomeContext()
  const activeHome: ActiveHomeSummary = home
    ? {
        handle: home.handle,
        name: home.name,
        logo: home.orgLogo,
        initials: home.orgInitials,
        accent: home.accentColor || DEFAULT_HOME_ACCENT,
        role: membership?.role ?? "member",
        memberCount: home.memberCount,
      }
    : null

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sora.variable} bg-background`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <script dangerouslySetInnerHTML={{ __html: SKIN_INIT_SCRIPT }} />
        <ThemeProvider
          attribute="class"
          defaultTheme="charcoal"
          themes={['light', 'dark', 'charcoal']}
          value={{
            light: 'theme-light',
            dark: 'dark',
            charcoal: 'theme-charcoal',
          }}
          enableSystem={false}
          disableTransitionOnChange
        >
          <SkinProvider>
            {/* Drives non-blocking background upload + processing of saved live
                replays. MUST wrap LiveSessionProvider: the live studio consoles
                (which call useLiveProcessing().enqueue to save a replay) are
                rendered *by* LiveSessionProvider as a sibling of the app tree, so
                this provider has to be their ancestor. When it wasn't, the video
                console silently got the no-op fallback and video replays were
                never saved. Placed high so uploads (and their status dock) keep
                running as the host navigates anywhere. */}
            <LiveProcessingProvider>
              <LiveSessionProvider>
                <EpisodePlayerProvider>
                  {/* Keeps server-rendered data (feed, adverts, live status, …)
                      continuously fresh so users never have to manually reload. */}
                  <AutoRefresh />
                  {/* Reports the signed-in user as online (no-op when signed out)
                      so the admin dashboard shows a true real-time presence count. */}
                  <PresenceHeartbeat />
                  {/* The whole app shell gently slides right (micro-parallax) when
                      the left navigation drawer opens. The Home context provider
                      wraps it so the header, menu and switcher all read the same
                      active-Home context. */}
                  <HomeContextProvider initialActiveHome={activeHome}>
                    <div id="app-shell" className="app-shell">
                      {children}
                      {/* Persistent, flagship-quality tab bar. Lives in the layout so
                          it never remounts on navigation — the active capsule morphs
                          between tabs and per-tab state/scroll are preserved. */}
                      <BottomNav />
                    </div>
                  </HomeContextProvider>
                  {process.env.NODE_ENV === 'production' && <Analytics />}
                </EpisodePlayerProvider>
              </LiveSessionProvider>
            </LiveProcessingProvider>
          </SkinProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
