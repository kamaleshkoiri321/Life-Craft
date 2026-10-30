import Image from 'next/image';
import { HOW_IT_WORKS_STEPS } from '@/lib/sample-data';
import Footer from './Footer';

export default function HowItWorksSection() {
  return (
    <>
      <section
        id="how-it-works"
        aria-labelledby="how-it-works-heading"
        className="scroll-mt-16 border-t border-[#171622]/8 min-h-[calc(100vh-4rem)] flex flex-col justify-center py-10 lg:py-12"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#171622]/70">
              How it works
            </p>
            <h2
              id="how-it-works-heading"
              className="font-display text-2xl font-bold tracking-tight text-[#171622] sm:text-3xl lg:text-4xl text-balance"
            >
              A simple rhythm that adapts to your week.
            </h2>
            <p className="text-sm sm:text-base leading-relaxed text-[#171622]/75">
              No complicated setup or rigid frameworks. Start with what is on
              your plate today and build from there.
            </p>
          </div>

          <ol className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {HOW_IT_WORKS_STEPS.map((step) => (
              <li
                key={step.stepNumber}
                className="flex flex-col justify-between overflow-hidden rounded-2xl border border-[#171622]/10 bg-white p-4 sm:p-5 shadow-xs hover:shadow-md transition-shadow duration-200"
              >
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-[#171622]/8 pb-2.5">
                    <span className="font-mono text-sm font-semibold text-[#171622] tabular-nums">
                      Step {step.stepNumber}
                    </span>
                    <span className="text-xs text-[#171622]/55">
                      {step.exampleContext}
                    </span>
                  </div>

                  {/* Supporting visual thumbnail */}
                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-[#171622]/8 bg-[#FAF9F6]">
                    <Image
                      src={step.imageSrc}
                      alt={step.imageAlt}
                      fill
                      loading="lazy"
                      sizes="(max-width: 768px) 100vw, 33vw"
                      referrerPolicy="no-referrer"
                      className="object-cover object-center"
                    />
                  </div>

                  <h3 className="font-display text-base sm:text-lg font-semibold text-[#171622]">
                    {step.title}
                  </h3>

                  <p className="text-xs sm:text-sm leading-relaxed text-[#171622]/70">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* About Section & Footer combined in one screen */}
      <section
        id="about"
        aria-labelledby="about-heading"
        className="scroll-mt-16 border-t border-[#171622]/10 bg-[#F0F7DE] min-h-[calc(100vh-4rem)] flex flex-col justify-between"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full my-auto py-10 sm:py-14">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#171622]/70">
                About LifeCraft
              </p>
              <h2
                id="about-heading"
                className="font-display text-2xl font-bold tracking-tight text-[#171622] sm:text-3xl lg:text-4xl text-balance"
              >
                Designed for calm clarity, not endless busywork.
              </h2>
            </div>

            <div className="lg:col-span-7 space-y-4 text-base leading-relaxed text-[#171622]/80">
              <p>
                Between classes, early-career projects, personal habits, and
                reading lists, life rarely fits neatly into a rigid corporate
                project manager. Scattered notes apps and overcomplicated
                templates often make staying organized feel like a second job.
              </p>
              <p>
                LifeCraft brings your daily tasks, steady routines, long-term
                goals, and reference materials together into a single, calm
                environment. Our philosophy is simple:{' '}
                <strong className="font-semibold text-[#171622]">
                  Build a life you love
                </strong>{' '}
                at a pace that feels sustainable for you.
              </p>
            </div>
          </div>
        </div>

        {/* Footer sharing the exact same screen */}
        <Footer />
      </section>
    </>
  );
}
