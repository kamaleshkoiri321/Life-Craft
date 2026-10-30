'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Compass } from 'lucide-react';
import { useAuth } from '@clerk/nextjs';

export default function HeroSection() {
  const { isSignedIn } = useAuth();

  return (
    <section className="relative overflow-hidden min-h-[calc(100vh-4rem)] flex flex-col justify-center py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid grid-cols-1 gap-12 lg:gap-14 xl:grid-cols-12 xl:items-center">
          {/* Left column: Hero Copy & CTAs */}
          <div className="xl:col-span-5 space-y-6 sm:space-y-8">
            <p className="text-[11px] sm:text-xs xl:text-sm font-semibold tracking-wide text-[#171622]/65 uppercase whitespace-nowrap">
              Personal life management · Tasks · Habits · Goals · Notes
            </p>

            <h1 className="font-display text-4xl font-bold tracking-tight text-[#171622] sm:text-5xl lg:text-6xl xl:text-[3.6rem] xl:leading-[1.08] text-balance">
              Build a life you love.
            </h1>

            <p className="max-w-xl text-base sm:text-lg lg:text-xl leading-relaxed text-[#171622]/75">
              Your tasks, habits, goals, and ideas in one calm space. Spend less
              time organizing your life and more time living it.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <Link
                href={isSignedIn ? '/app' : '/sign-up'}
                className="inline-flex items-center gap-2.5 rounded-xl bg-[#C8F27C] px-7 py-4 text-base font-semibold text-[#171622] shadow-sm transition-all duration-150 hover:bg-[#bce86d] hover:shadow whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
              >
                <span>{isSignedIn ? 'Go to dashboard' : 'Get started'}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>

              <Link
                href="#features"
                className="inline-flex items-center gap-2 rounded-xl border border-[#171622]/15 bg-white px-6 py-4 text-base font-medium text-[#171622] transition-colors duration-150 hover:bg-[#F0F7DE] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
              >
                <span>Explore features</span>
              </Link>
            </div>

            <div className="flex items-center gap-2 pt-1 text-xs sm:text-sm font-medium text-[#171622]/60">
              <Compass className="h-4 w-4 text-[#171622]/50" aria-hidden="true" />
              <span>Your life, your pace.</span>
            </div>
          </div>

          {/* Right column: Hero Image */}
          <div className="xl:col-span-7 flex items-center justify-center">
            <div className="relative w-full overflow-hidden rounded-3xl border border-[#171622]/12 bg-[#FAF9F6] shadow-md hover:shadow-xl transition-shadow duration-300">
              <Image
                src="/images/hero-landing.jpg"
                alt="A tranquil, sun-dappled terrace surrounded by blooming greenery at dawn, symbolizing an intentional, organized life"
                width={1400}
                height={875}
                priority
                sizes="(max-width: 1280px) 100vw, 58vw"
                className="w-full h-auto object-cover max-h-[520px] transition-transform duration-300 hover:scale-[1.01]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-6 left-6 right-6 text-white pointer-events-none">
                <p className="text-xs sm:text-sm uppercase tracking-widest font-semibold text-white/80">
                  You only have
                </p>
                <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[#FAF9F6]">
                  ONE LIFE. <span className="text-[#F5E68C]">MAKE IT COUNT.</span>
                </h2>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
