import Link from 'next/link';
import BrandMark from './BrandMark';

export default function Footer() {
  return (
    <footer className="border-t border-[#171622]/10 bg-white py-6 sm:py-8 w-full">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <BrandMark />
            <p className="text-xs text-[#171622]/60">
              Build a life you love.
            </p>
          </div>

          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap items-center gap-6 text-sm font-medium text-[#171622]/75"
          >
            <Link
              href="/#features"
              className="hover:text-[#171622] transition-colors hover:underline underline-offset-4 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#171622] rounded-xs"
            >
              Features
            </Link>
            <Link
              href="/#about"
              className="hover:text-[#171622] transition-colors hover:underline underline-offset-4 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#171622] rounded-xs"
            >
              About
            </Link>
            <Link
              href="/privacy"
              className="hover:text-[#171622] transition-colors hover:underline underline-offset-4 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#171622] rounded-xs"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="hover:text-[#171622] transition-colors hover:underline underline-offset-4 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#171622] rounded-xs"
            >
              Terms
            </Link>
          </nav>
        </div>

        <div className="mt-6 border-t border-[#171622]/8 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-[#171622]/55">
          <p>© 2026 LifeCraft. All rights reserved.</p>
          <p>Your life, your pace.</p>
        </div>
      </div>
    </footer>
  );
}
