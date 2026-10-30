import { ClerkProvider } from '@clerk/nextjs';
import type {Metadata} from 'next';
import {Plus_Jakarta_Sans, DM_Sans, JetBrains_Mono} from 'next/font/google';
import {AuthProvider} from '@/components/auth/AuthProvider';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'LifeCraft — Build a life you love',
  description:
    'Your tasks, habits, goals, and ideas in one calm space. Spend less time organizing your life and more time living it.',
  icons: {
    icon: [
      { url: '/icon.svg?v=3', type: 'image/svg+xml' },
      { url: '/icon-32.png?v=3', sizes: '32x32', type: 'image/png' },
      { url: '/icon.png?v=3', sizes: '64x64', type: 'image/png' },
    ],
    shortcut: '/favicon.ico?v=3',
    apple: [
      { url: '/apple-icon.png?v=3', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'LifeCraft — Build a life you love',
    description:
      'Your tasks, habits, goals, and ideas — all in one calm space. Spend less time organizing your life and more time living it.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LifeCraft — Build a life you love',
    description:
      'Your tasks, habits, goals, and ideas — all in one calm space. Spend less time organizing your life and more time living it.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${dmSans.variable} ${jetbrainsMono.variable} scroll-smooth`}
    >
      <head>
        <link rel="icon" href="/icon.svg?v=3" type="image/svg+xml" />
        <link rel="icon" href="/icon-32.png?v=3" type="image/png" sizes="32x32" />
        <link rel="icon" href="/icon.png?v=3" type="image/png" sizes="64x64" />
        <link rel="apple-touch-icon" href="/apple-icon.png?v=3" sizes="180x180" />
        <link rel="shortcut icon" href="/favicon.ico?v=3" />
      </head>
      <body
        suppressHydrationWarning
        className="bg-[#FAF9F6] text-[#171622] antialiased selection:bg-[#C8F27C] selection:text-[#171622]"
      >
        <ClerkProvider
          signInFallbackRedirectUrl="/app"
          signUpFallbackRedirectUrl="/app"
          signInForceRedirectUrl="/app"
          signUpForceRedirectUrl="/app"
        >
          <AuthProvider>{children}</AuthProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}