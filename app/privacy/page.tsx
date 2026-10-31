import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, Database, Lock, Shield, UserCheck } from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Privacy Policy — LifeCraft',
  description:
    'Learn how LifeCraft protects your privacy, secures your workspace data, and ensures complete user control.',
};

export default function PrivacyPage() {
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

      {/* Main Privacy Document */}
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-12 sm:py-16 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-[#171622]/10 bg-white p-6 sm:p-12 shadow-sm space-y-10">
          {/* Header */}
          <div className="border-b border-[#171622]/10 pb-8 space-y-3">
            <div className="inline-flex items-center gap-2 rounded-xl bg-[#C8F27C]/40 px-3 py-1 text-xs font-semibold text-[#171622]">
              <Shield className="h-3.5 w-3.5 text-[#171622]" aria-hidden="true" />
              <span>Security & Privacy First</span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-[#171622]">
              LifeCraft Privacy Policy
            </h1>
            <p className="text-xs sm:text-sm text-[#171622]/60">
              Effective Date: October 31, 2026 · Last Updated: October 31, 2026
            </p>
          </div>

          {/* Quick Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-[#171622]/8 bg-[#FAF9F6] p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#171622]">
                <Lock className="h-4 w-4 text-[#5938B5]" />
                <span>Zero Data Monetization</span>
              </div>
              <p className="text-xs text-[#171622]/70 leading-relaxed">
                We never sell, rent, or broker your personal data, tasks, notes, or uploaded documents to advertisers or data brokers.
              </p>
            </div>
            <div className="rounded-2xl border border-[#171622]/8 bg-[#FAF9F6] p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#171622]">
                <Calendar className="h-4 w-4 text-[#2F6B1E]" />
                <span>Native Private Schedule</span>
              </div>
              <p className="text-xs text-[#171622]/70 leading-relaxed">
                Your calendar events and tasks remain 100% in your private database with zero external calendar tracking.
              </p>
            </div>
            <div className="rounded-2xl border border-[#171622]/8 bg-[#FAF9F6] p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#171622]">
                <UserCheck className="h-4 w-4 text-[#171622]" />
                <span>Full User Control</span>
              </div>
              <p className="text-xs text-[#171622]/70 leading-relaxed">
                You own 100% of your content. You can export or permanently delete your account and all associated records with one click.
              </p>
            </div>
          </div>

          {/* Document Content */}
          <div className="prose prose-slate max-w-none space-y-8 text-sm sm:text-base leading-relaxed text-[#171622]/80">
            {/* 1. Introduction */}
            <section className="space-y-3">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#171622]">
                1. Introduction
              </h2>
              <p>
                LifeCraft (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is an intentional personal life management platform designed to help individuals organize tasks, build positive habits, pursue goals, record personal notes, and focus on meaningful work.
              </p>
              <p>
                We believe that productivity tools should be calm, trustworthy, and respectful of personal privacy. This Privacy Policy outlines what information we collect, how it is used, how it is protected, and your choices regarding your data when using LifeCraft and its associated services.
              </p>
            </section>

            {/* 2. Information We Collect */}
            <section className="space-y-3">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#171622]">
                2. Information We Collect
              </h2>
              <p>We collect only the minimum information necessary to provide our productivity features:</p>
              
              <h3 className="font-semibold text-[#171622] pt-2">A. Account Information</h3>
              <p>
                When you register an account, authentication is processed securely by our authentication partner, <strong>Clerk</strong>. We receive basic profile information including your full name, email address, profile avatar image, and verified account identifiers. Passwords are never stored on LifeCraft servers.
              </p>

              <h3 className="font-semibold text-[#171622] pt-2">B. Workspace & Productivity Data</h3>
              <p>
                To provide your personal dashboard, we store the data you create within the platform, including:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
                <li><strong>Tasks:</strong> Titles, descriptions, priorities, due dates, and hourly schedule allocations.</li>
                <li><strong>Habits & Routines:</strong> Habit names, frequencies, weekly targets, check-in history, and completion streaks.</li>
                <li><strong>Goals & Milestones:</strong> Objectives, target dates, progress percentages, and milestone checklists.</li>
                <li><strong>Notes & Journals:</strong> Markdown notes, personal journals, folders, tags, and pinned items.</li>
                <li><strong>Focus Studio Sessions:</strong> Pomodoro and stopwatch durations, session timestamps, and associated tasks.</li>
                <li><strong>Personal Library:</strong> Reading status, bookmarks, and private reading documents (PDF/EPUB) uploaded to your encrypted storage.</li>
              </ul>

              <h3 className="font-semibold text-[#171622] pt-2">C. Native Calendar & Schedule Data</h3>
              <p>
                LifeCraft provides a native custom calendar for scheduling time-blocks and managing task deadlines. All scheduled blocks, start and end times, and duration records are stored directly in your private PostgreSQL database. No third-party calendar accounts or external APIs are connected or required.
              </p>
            </section>

            {/* 4. How We Use Information */}
            <section className="space-y-3">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#171622]">
                4. How We Use Your Information
              </h2>
              <p>We use your information exclusively to operate and deliver LifeCraft features:</p>
              <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm">
                <li>Authenticating your session and verifying your identity.</li>
                <li>Synchronizing your tasks, habits, notes, and calendar timeline across your devices.</li>
                <li>Calculating personal progress analytics, streaks, and focus studio summaries.</li>
                <li>Ensuring the technical security, integrity, and performance of our infrastructure.</li>
              </ul>
            </section>

            {/* 5. Data Storage, Security & Encryption */}
            <section className="space-y-3">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#171622]">
                5. Data Storage and Security
              </h2>
              <p>
                We implement robust security controls designed to protect your personal data from unauthorized access, alteration, or disclosure:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
                <li><strong>Encryption in Transit:</strong> All web traffic and API calls use HTTPS with TLS 1.3 encryption.</li>
                <li><strong>Database Security:</strong> LifeCraft application data is hosted on serverless PostgreSQL (Neon) with strict row-level user ownership isolation.</li>
                <li><strong>Encryption at Rest:</strong> Sensitive authentication tokens and private OAuth secrets are encrypted at rest using AES-256-GCM.</li>
                <li><strong>Private Storage:</strong> Document uploads (PDF/EPUB) are stored in private object storage accessible only by authenticated session owners via scoped access tokens.</li>
              </ul>
            </section>

            {/* 6. Third-Party Service Providers */}
            <section className="space-y-3">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#171622]">
                6. Trusted Third-Party Infrastructure
              </h2>
              <p>
                We partner with reputable infrastructure providers to deliver our service:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
                <li><strong>Clerk Inc.:</strong> User identity management, session token verification, and multi-factor authentication.</li>
                <li><strong>Neon Inc.:</strong> Managed serverless PostgreSQL database hosting and encrypted storage.</li>
                <li><strong>Google LLC:</strong> Optional federated Sign-In with Google authentication via Clerk.</li>
                <li><strong>Vercel Inc.:</strong> Edge hosting, serverless compute, and static content delivery.</li>
              </ul>
            </section>

            {/* 7. Data Retention & Permanent Deletion */}
            <section className="space-y-3">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#171622]">
                7. Data Retention and Your Deletion Rights
              </h2>
              <p>
                You retain complete sovereignty over your data:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
                <li><strong>Individual Item Deletion:</strong> You can delete any individual task, habit log, note, or library file directly in the app at any time.</li>
                <li><strong>Permanent Account Deletion:</strong> You can permanently delete your entire LifeCraft account under <strong>Settings &rarr; Account</strong>. This initiates an immediate cascading deletion of all your tasks, habits, goals, notes, library files, focus sessions, and preferences across our database and storage buckets.</li>
              </ul>
            </section>

            {/* 8. Children's Privacy */}
            <section className="space-y-3">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#171622]">
                8. Children&rsquo;s Privacy
              </h2>
              <p>
                LifeCraft is not directed to individuals under the age of 13 (or under 16 in certain jurisdictions). We do not knowingly collect personal information from children. If we discover that a child has provided us with personal information, we will delete it promptly.
              </p>
            </section>

            {/* 9. Updates to this Policy */}
            <section className="space-y-3">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#171622]">
                9. Changes to this Privacy Policy
              </h2>
              <p>
                We may periodically update this Privacy Policy to reflect enhancements in our features or changes in legal regulations. When updates are published, we will revise the &ldquo;Last Updated&rdquo; date at the top of this document. Continued use of LifeCraft after any changes constitutes acceptance of the revised policy.
              </p>
            </section>

            {/* 10. Contact Us */}
            <section className="space-y-3 pt-4 border-t border-[#171622]/10">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#171622]">
                10. Contacting Us
              </h2>
              <p>
                If you have questions, feedback, or data privacy requests regarding this Privacy Policy, please contact our privacy team at:
              </p>
              <div className="rounded-xl border border-[#171622]/10 bg-[#FAF9F6] p-4 text-xs sm:text-sm space-y-1">
                <p className="font-bold text-[#171622]">LifeCraft Privacy & Security Team</p>
                <p className="text-[#171622]/75">Email: <a href="mailto:privacy@lifecraft.app" className="font-semibold text-[#5938B5] underline">privacy@lifecraft.app</a></p>
                <p className="text-[#171622]/75">Website: <a href="https://lifecraft-hero.vercel.app" className="font-semibold text-[#5938B5] underline">https://lifecraft-hero.vercel.app</a></p>
              </div>
            </section>
          </div>

          {/* Footer Back CTA */}
          <div className="pt-6 border-t border-[#171622]/10 flex flex-wrap items-center justify-between gap-4">
            <Link
              href="/terms"
              className="text-xs sm:text-sm font-semibold text-[#5938B5] hover:text-[#171622] underline underline-offset-2"
            >
              View Terms of Service &rarr;
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