import Image from 'next/image';
import {
  CalendarCheck2,
  Repeat,
  Compass,
  FolderKanban,
} from 'lucide-react';
import { CORE_FEATURES } from '@/lib/sample-data';

const FEATURE_ICONS = [CalendarCheck2, Repeat, Compass, FolderKanban];

export default function FeaturesSection() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="scroll-mt-16 border-t border-[#171622]/10 bg-[#F0F7DE] min-h-[calc(100vh-4rem)] flex flex-col justify-center pt-6 pb-10 sm:pt-7 sm:pb-12 lg:pt-8 lg:pb-12"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
        {/* Section header */}
        <div className="max-w-3xl space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#171622]/70">
            Core features
          </p>
          <h2
            id="features-heading"
            className="font-display text-2xl font-bold tracking-tight text-[#171622] sm:text-3xl lg:text-4xl text-balance"
          >
            Everything you need to stay grounded, without the noise.
          </h2>
          <p className="text-sm sm:text-base leading-relaxed text-[#171622]/80">
            Designed for students, young professionals, and anyone balancing
            coursework, career milestones, and personal wellbeing in a single
            place.
          </p>
        </div>

        {/* 4 Core Features Grid with Lifestyle Photography */}
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CORE_FEATURES.map((feature, index) => {
            const Icon = FEATURE_ICONS[index] || CalendarCheck2;

            return (
              <article
                key={feature.id}
                className="flex flex-col justify-between overflow-hidden rounded-2xl border border-[#171622]/10 bg-white p-4 sm:p-5 shadow-xs hover:shadow-md transition-shadow duration-200"
              >
                <div className="space-y-4">
                  {/* Cohesive 16:10 Lifestyle Photograph */}
                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-[#171622]/8 bg-[#FAF9F6]">
                    <Image
                      src={feature.imageSrc}
                      alt={feature.imageAlt}
                      fill
                      loading="lazy"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      referrerPolicy="no-referrer"
                      className="object-cover object-top brightness-[0.98] contrast-[1.02] saturate-[0.95] transition-transform duration-300 hover:scale-[1.02]"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-0.5">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#171622] text-[#C8F27C]">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="font-mono text-xs font-medium text-[#171622]/45 tabular-nums">
                      {feature.number}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <h3 className="font-display text-base sm:text-lg font-semibold text-[#171622]">
                      {feature.title}
                    </h3>
                    <p className="text-xs sm:text-sm leading-relaxed text-[#171622]/75">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
