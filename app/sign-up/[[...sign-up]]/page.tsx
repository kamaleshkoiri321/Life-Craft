import { Suspense } from 'react';
import { SignUp } from '@clerk/nextjs';
import BrandMark from '@/components/BrandMark';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#171622]">
      <header className="h-16 border-b border-[#171622]/8 px-4 sm:px-6 lg:px-8 bg-[#FAF9F6]/90 backdrop-blur-md sticky top-0 z-40">
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

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <Suspense fallback={<div className="text-sm text-[#171622]/60">Loading sign up...</div>}>
          <SignUp forceRedirectUrl="/app" fallbackRedirectUrl="/app" />
        </Suspense>
      </main>
    </div>
  );
}
