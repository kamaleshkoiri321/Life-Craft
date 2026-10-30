import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import Footer from '@/components/Footer';

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#171622]">
      <header className="h-16 border-b border-[#171622]/8 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between">
          <BrandMark />
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#171622]/75 hover:text-[#171622] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#171622] rounded-xs"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back to home</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-[#171622]/12 bg-white p-6 sm:p-10 space-y-5">
          <p className="text-xs font-medium text-[#171622]/60">
            Phase 1 Placeholder
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#171622]">
            Terms of Use (Draft Placeholder)
          </h1>
          <p className="text-sm sm:text-base leading-relaxed text-[#171622]/75">
            This page is a placeholder for LifeCraft’s future Terms of Service.
            During Phase 1, this application serves solely as an interactive UI
            and design system preview using local sample data.
          </p>
          <p className="text-sm sm:text-base leading-relaxed text-[#171622]/75">
            Official terms of use will be provided prior to launching user
            registration and production services.
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-5 py-2.5 text-sm font-medium text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
            >
              Return to landing page
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
