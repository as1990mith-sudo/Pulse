import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Sora } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { SkinProvider, SKIN_INIT_SCRIPT } from '@/components/skin-provider'
import { LiveSessionProvider } from '@/components/live-session'
import { EpisodePlayerProvider } from '@/components/episode-player-provider'
import { AutoRefresh } from '@/components/auto-refresh'
import './globals.css'

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
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
          themes={['light', 'dark', 'mid', 'charcoal', 'grass']}
          value={{
            light: 'theme-light',
            dark: 'dark',
            mid: 'theme-mid',
            charcoal: 'theme-charcoal',
            grass: 'theme-grass',
          }}
          enableSystem={false}
          disableTransitionOnChange
        >
          <SkinProvider>
            <LiveSessionProvider>
              <EpisodePlayerProvider>
                {/* Keeps server-rendered data (feed, adverts, live status, …)
                    continuously fresh so users never have to manually reload. */}
                <AutoRefresh />
                {children}
                {process.env.NODE_ENV === 'production' && <Analytics />}
              </EpisodePlayerProvider>
            </LiveSessionProvider>
          </SkinProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
