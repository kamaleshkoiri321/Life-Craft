'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { Menu, X, ArrowRight } from 'lucide-react';
import { Show, UserButton } from '@clerk/nextjs';
import BrandMark from './BrandMark';

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 h-16 w-full border-b border-[#171622]/12 bg-[#BCE86D]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Brand wordmark + icon */}
        <BrandMark />

        {/* Zone 2: Primary navigation links */}
        <nav
          aria-label="Main navigation"
          className="hidden md:flex items-center gap-8 text-sm font-medium text-[#171622]/80"
        >
          <Link
            href="#features"
            className="hover:text-[#171622] transition-colors duration-150 underline-offset-4 hover:underline whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#171622] rounded-sm"
          >
            Features
          </Link>
          <Link
            href="#how-it-works"
            className="hover:text-[#171622] transition-colors duration-150 underline-offset-4 hover:underline whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#171622] rounded-sm"
          >
            How it works
          </Link>
          <Link
            href="#about"
            className="hover:text-[#171622] transition-colors duration-150 underline-offset-4 hover:underline whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#171622] rounded-sm"
          >
            About
          </Link>
          <Suspense fallback={null}>
            <Show when="signed-out">
              <Link
                href="/sign-in"
                className="hover:text-[#171622] transition-colors duration-150 underline-offset-4 hover:underline whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#171622] rounded-sm"
              >
                Sign in
              </Link>
            </Show>
            <Show when="signed-in">
              <Link
                href="/app"
                className="hover:text-[#171622] transition-colors duration-150 underline-offset-4 hover:underline whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#171622] rounded-sm"
              >
                Dashboard
              </Link>
              <UserButton />
            </Show>
          </Suspense>
        </nav>

        {/* Zone 3: Mobile toggle */}
        <div className="flex items-center md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation-menu"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#171622]/15 text-[#171622] transition-colors duration-150 hover:bg-[#171622]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      {mobileMenuOpen && (
        <div
          id="mobile-navigation-menu"
          className="border-b border-[#171622]/12 bg-[#BCE86D] px-4 pt-2 pb-5 shadow-md md:hidden"
        >
          <nav
            aria-label="Mobile navigation"
            className="flex flex-col space-y-1 text-base font-medium text-[#171622]"
          >
            <Link
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg px-3 py-2.5 hover:bg-[#171622]/10 transition-colors"
            >
              Features
            </Link>
            <Link
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg px-3 py-2.5 hover:bg-[#171622]/10 transition-colors"
            >
              How it works
            </Link>
            <Link
              href="#about"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg px-3 py-2.5 hover:bg-[#171622]/10 transition-colors"
            >
              About
            </Link>
            <Suspense fallback={null}>
              <Show when="signed-out">
                <Link
                  href="/sign-in"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 hover:bg-[#171622]/10 transition-colors"
                >
                  Sign in
                </Link>
                <div className="pt-2">
                  <Link
                    href="/sign-up"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#171622] px-4 py-2.5 text-sm font-medium text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors"
                  >
                    <span>Get started</span>
                    <ArrowRight className="h-4 w-4 text-[#C8F27C]" aria-hidden="true" />
                  </Link>
                </div>
              </Show>
              <Show when="signed-in">
                <Link
                  href="/app"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 hover:bg-[#171622]/10 transition-colors"
                >
                  Dashboard
                </Link>
                <div className="pt-2 px-3 flex items-center gap-2">
                  <UserButton />
                  <span className="text-sm font-medium text-[#171622]">Manage account</span>
                </div>
              </Show>
            </Suspense>
          </nav>
        </div>
      )}
    </header>
  );
}
