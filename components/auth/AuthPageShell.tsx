'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Copy, Loader2, ShieldCheck } from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import Footer from '@/components/Footer';
import GoogleIcon from '@/components/icons/GoogleIcon';

export { GoogleIcon };

interface AuthPageShellProps {
  children: React.ReactNode;
  badgeText?: string;
}

export default function AuthPageShell({
  children,
  badgeText = 'Secure Neon Auth',
}: AuthPageShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#171622]">
      <header className="h-16 border-b border-[#171622]/8 px-4 sm:px-6 lg:px-8 bg-[#FAF9F6]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between">
          <BrandMark />
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-[#EBE8F8]/70 px-2.5 py-1 text-xs font-medium text-[#171622]/80">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{badgeText}</span>
            </span>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-[#171622]/75 hover:text-[#171622] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#171622] rounded-xs"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to home</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <Footer />
    </div>
  );
}

export function OriginConfigHelpBanner() {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : '';
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const urlsToWhitelist: string[] = [];
  if (origin) {
    urlsToWhitelist.push(origin);
    if (origin.includes('https://ais-dev-')) {
      urlsToWhitelist.push(origin.replace('https://ais-dev-', 'https://ais-pre-'));
    } else if (origin.includes('https://ais-pre-')) {
      urlsToWhitelist.push(origin.replace('https://ais-pre-', 'https://ais-dev-'));
    }
  }

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch {
      // Fallback selection handled via select-all class
    }
  };

  return (
    <div
      role="region"
      aria-label="Neon Auth Trusted Domain setup instructions"
      className="mt-3 rounded-xl border border-[#171622]/15 bg-[#FAF9F6] p-3.5 text-xs leading-relaxed text-[#171622]/85 space-y-2.5"
    >
      <div className="flex items-center gap-2 font-semibold text-[#171622]">
        <GoogleIcon className="h-4 w-4 shrink-0" />
        <span>One-time Google OAuth setup in Neon Console</span>
      </div>
      <p>
        For Google Sign-In to redirect back to this preview, add the URL below in{' '}
        <span className="font-semibold">
          Neon Console → Auth → Configuration → Trusted Domains
        </span>
        :
      </p>
      {urlsToWhitelist.map((url) => (
        <div
          key={url}
          className="flex items-center justify-between gap-2 rounded-lg border border-[#171622]/12 bg-white px-2.5 py-1.5"
        >
          <code className="font-mono text-[11px] text-[#171622] break-all select-all">
            {url}
          </code>
          <button
            type="button"
            onClick={() => handleCopy(url)}
            className="inline-flex items-center gap-1 shrink-0 rounded-md bg-[#EBE8F8]/70 px-2 py-1 text-[11px] font-semibold text-[#171622] hover:bg-[#EBE8F8] transition-colors"
          >
            {copiedUrl === url ? (
              <>
                <Check className="h-3 w-3" aria-hidden="true" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" aria-hidden="true" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      ))}
      <p className="text-[11px] text-[#171622]/70">
        Tip: Email &amp; Password sign-up and sign-in below work immediately without waiting for Trusted Domain configuration.
      </p>
    </div>
  );
}

export function GoogleContinueButton({
  onClick,
  disabled,
  isLoading,
  label = 'Continue with Google',
}: {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl border border-[#171622]/15 bg-white px-4 py-2.5 text-sm font-medium text-[#171622] hover:bg-[#FAF9F6] transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-[#171622]/80 shrink-0" aria-hidden="true" />
      ) : (
        <GoogleIcon className="h-4 w-4 shrink-0" />
      )}
      <span>{isLoading ? 'Connecting to Google...' : label}</span>
    </button>
  );
}
