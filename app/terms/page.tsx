import React from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, CheckCircle, FileText, Scale, ShieldAlert } from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Terms of Service — LifeCraft',
  description:
    'Read the LifeCraft Terms of Service outlining account usage, content ownership, acceptable use, and service policies.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#171622]">
      {/* Navigation Header */}
      <header className="h-16 border-b border-[#171622]/8 px-4 sm:px-6 lg:px-8 bg-white/70 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between">
          <BrandMark />
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#171622]/75 hover:text-[#171622] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#171622] rounded-lg px-3 py-1.5 hover:bg-[#171622]/5"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back to home</span>
          </Link>
        </div>
      </header>

      {/* Main Terms Document */}
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-12 sm:py-16 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-[#171622]/10 bg-white p-6 sm:p-12 shadow-sm space-y-10">
          {/* Header */}
          <div className="border-b border-[#171622]/10 pb-8 space-y-3">
            <div className="inline-flex items-center gap-2 rounded-xl bg-[#C8F27C]/40 px-3 py-1 text-xs font-semibold text-[#171622]">
              <Scale className="h-3.5 w-3.5 text-[#171622]" aria-hidden="true" />
              <span>Terms of Service</span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-[#171622]">
              LifeCraft Terms of Service
            </h1>
            <p className="text-xs sm:text-sm text-[#171622]/60">
              Effective Date: October 31, 2026 · Last Updated: October 31, 2026
            </p>
          </div>

          {/* Key Principles Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-[#171622]/8 bg-[#FAF9F6] p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#171622]">
                <FileText className="h-4 w-4 text-[#5938B5]" />
                <span>Your Content Stays Yours</span>
              </div>
              <p className="text-xs text-[#171622]/70 leading-relaxed">
                You retain full copyright and ownership of every task, note, goal, and book you add to LifeCraft.
              </p>
            </div>
            <div className="rounded-2xl border border-[#171622]/8 bg-[#FAF9F6] p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#171622]">
                <BookOpen className="h-4 w-4 text-[#2F6B1E]" />
                <span>Transparent Service</span>
              </div>
              <p className="text-xs text-[#171622]/70 leading-relaxed">
                No hidden catches, no lock-in. You can export your data or delete your account whenever you choose.
              </p>
            </div>
            <div className="rounded-2xl border border-[#171622]/8 bg-[#FAF9F6] p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#171622]">
                <CheckCircle className="h-4 w-4 text-[#171622]" />
                <span>Fair & Respectful Use</span>
              </div>
              <p className="text-xs text-[#171622]/70 leading-relaxed">
                Our platform is built for personal growth and calm focus. We expect users to respect others and service integrity.
              </p>
            </div>
          </div>

          {/* Terms Content */}
          <div className="prose prose-slate max-w-none space-y-8 text-sm sm:text-base leading-relaxed text-[#171622]/80">
            {/* 1. Acceptance of Terms */}
            <section className="space-y-3">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#171622]">
                1. Acceptance of Terms
              </h2>
              <p>
                Welcome to LifeCraft! These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the LifeCraft web application, APIs, and associated services (collectively, the &ldquo;Service&rdquo;), provided by LifeCraft (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
              </p>
              <p>
                By creating an account, accessing, or using the Service, you confirm that you have read, understood, and agreed to be bound by these Terms and our{' '}
                <Link href="/privacy" className="font-semibold text-[#5938B5] underline underline-offset-2">
                  Privacy Policy
                </Link>
                . If you do not agree to these Terms, you may not access or use the Service.
              </p>
            </section>

            {/* 2. Eligibility & Account Security */}
            <section className="space-y-3">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#171622]">
                2. Eligibility and Account Security
              </h2>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
                <li><strong>Age Requirement:</strong> You must be at least 13 years old (or 16 in the European Economic Area) to use the Service. By registering, you warrant that you meet this minimum age requirement.</li>
                <li><strong>Account Accuracy:</strong> You agree to provide accurate and complete registration information and to keep your account profile updated.</li>
                <li><strong>Credential Security:</strong> Authentication is handled by Clerk. You are responsible for safeguarding your login credentials and for all activities that occur under your account. Notify us immediately of any unauthorized access.</li>
              </ul>
            </section>

            {/* 3. Description of the Service */}
            <section className="space-y-3">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#171622]">
                3. Description of the Service
              </h2>
              <p>
                LifeCraft is a personal productivity and life operating system providing:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
                <li>Personal task management, scheduling, and hourly calendar views.</li>
                <li>Habit tracking, check-ins, routine consistency, and streak statistics.</li>
                <li>Long-term goal and milestone tracking with progress calculation.</li>
                <li>Personal markdown notes and journal entries with folder organization and tags.</li>
                <li>Pomodoro Focus Studio and stopwatch sessions for intentional work.</li>
                <li>Personal library for document reading (PDF/EPUB) and progress bookmarks.</li>
                <li>Optional Google Calendar OAuth integration for viewing primary calendar events.</li>
              </ul>
              <p>
                We reserve the right to improve, modify, update, or discontinue features of the Service to enhance performance, reliability, and security.
              </p>
            </section>

            {/* 4. User Content & Intellectual Property Ownership */}
            <section className="space-y-3">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#171622]">
                4. User Content and Intellectual Property
              </h2>
              <h3 className="font-semibold text-[#171622] pt-1">A. You Own Your Content</h3>
              <p>
                You retain complete, exclusive intellectual property ownership of all tasks, notes, journal entries, goals, habits, thoughts, and documents you upload or create within LifeCraft (&ldquo;User Content&rdquo;). LifeCraft does not claim any ownership rights over your User Content.
              </p>

              <h3 className="font-semibold text-[#171622] pt-1">B. Limited License to LifeCraft</h3>
              <p>
                Solely for the technical purpose of hosting and operating the Service, you grant LifeCraft a limited, non-exclusive, worldwide, royalty-free license to store, process, display, and transmit your User Content back to you across your authorized devices. We do not use your User Content for advertising or public AI model training.
              </p>

              <h3 className="font-semibold text-[#171622] pt-1">C. LifeCraft Intellectual Property</h3>
              <p>
                The LifeCraft design system, brand marks, logos, user interface layout, code, styling, and graphics are the exclusive property of LifeCraft and are protected by applicable intellectual property laws.
              </p>
            </section>

            {/* 5. Acceptable Use Policy */}
            <section className="space-y-3">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#171622]">
                5. Acceptable Use Policy
              </h2>
              <p>When using LifeCraft, you agree not to:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
                <li>Use the Service for any unlawful, fraudulent, or harmful purpose.</li>
                <li>Upload documents containing malicious code, malware, viruses, or corrupted files.</li>
                <li>Attempt to bypass, disable, or tamper with security features, authorization checks, or rate limits.</li>
                <li>Reverse-engineer, decompile, or disassemble any part of the Service infrastructure.</li>
                <li>Scrape, crawl, or harvest data from the Service using automated scripts or bots.</li>
                <li>Impersonate another individual or access another user&rsquo;s account without authorization.</li>
              </ul>
            </section>

            {/* 6. Third-Party Integrations & Services */}
            <section className="space-y-3">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#171622]">
                6. Third-Party Services & Google Calendar
              </h2>
              <p>
                The Service integrates with third-party providers including Google Calendar and Clerk. Your use of these third-party services is subject to their respective terms and policies:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
                <li>Google Calendar access is subject to the <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#5938B5] underline">Google Terms of Service</a> and <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#5938B5] underline">Google API Services User Data Policy</a>.</li>
                <li>Authentication is powered by Clerk and subject to the Clerk terms.</li>
                <li>LifeCraft is not liable for service interruptions, changes, or downtime caused by third-party platforms.</li>
              </ul>
            </section>

            {/* 7. Disclaimers & Limitation of Liability */}
            <section className="space-y-3 rounded-2xl border border-[#171622]/15 bg-[#FAF9F6] p-5 sm:p-6">
              <h2 className="font-display text-lg sm:text-xl font-bold text-[#171622] flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-[#B42318]" />
                <span>7. Disclaimers and Limitation of Liability</span>
              </h2>
              <p className="text-xs sm:text-sm leading-relaxed">
                THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
              </p>
              <p className="text-xs sm:text-sm leading-relaxed">
                LIFECRAFT IS A PRODUCTIVITY AID AND DOES NOT PROVIDE MEDICAL, PSYCHOLOGICAL, OR PROFESSIONAL HEALTH ADVICE. HABIT TRACKING AND FOCUS TOOLS ARE DESIGNED FOR GENERAL ORGANIZATIONAL PURPOSES ONLY.
              </p>
              <p className="text-xs sm:text-sm leading-relaxed">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, LIFECRAFT SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR USE ARISING OUT OF YOUR USE OF THE SERVICE.
              </p>
            </section>

            {/* 8. Account Termination */}
            <section className="space-y-3">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#171622]">
                8. Account Termination
              </h2>
              <p>
                You may terminate these Terms at any time by deleting your account inside <strong>Settings &rarr; Account</strong>. Upon confirmation, your account and all stored productivity data will be permanently deleted from our primary databases.
              </p>
              <p>
                We reserve the right to suspend or terminate accounts that repeatedly violate these Terms, engage in abuse or security tampering, or create operational risks for other users.
              </p>
            </section>

            {/* 9. Modifications to Terms */}
            <section className="space-y-3">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#171622]">
                9. Changes to These Terms
              </h2>
              <p>
                We may revise these Terms from time to time. When changes are made, we will update the &ldquo;Last Updated&rdquo; date at the top of this document. Continued use of LifeCraft following the posting of revised Terms means that you accept and agree to the changes.
              </p>
            </section>

            {/* 10. Contact Information */}
            <section className="space-y-3 pt-4 border-t border-[#171622]/10">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#171622]">
                10. Contact Us
              </h2>
              <p>
                If you have any questions or feedback regarding these Terms of Service, please reach out to:
              </p>
              <div className="rounded-xl border border-[#171622]/10 bg-[#FAF9F6] p-4 text-xs sm:text-sm space-y-1">
                <p className="font-bold text-[#171622]">LifeCraft Legal & Support Team</p>
                <p className="text-[#171622]/75">Email: <a href="mailto:support@lifecraft.app" className="font-semibold text-[#5938B5] underline">support@lifecraft.app</a></p>
                <p className="text-[#171622]/75">Website: <a href="https://lifecraft-hero.vercel.app" className="font-semibold text-[#5938B5] underline">https://lifecraft-hero.vercel.app</a></p>
              </div>
            </section>
          </div>

          {/* Footer Back CTA */}
          <div className="pt-6 border-t border-[#171622]/10 flex flex-wrap items-center justify-between gap-4">
            <Link
              href="/privacy"
              className="text-xs sm:text-sm font-semibold text-[#5938B5] hover:text-[#171622] underline underline-offset-2"
            >
              &larr; View Privacy Policy
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-6 py-2.5 text-xs sm:text-sm font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
            >
              Return to LifeCraft
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}