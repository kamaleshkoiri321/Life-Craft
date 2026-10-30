<div align="center">

# LifeCraft 🌿

**Your tasks, habits, goals, notes, and reading library — all in one calm space. Build a life you love.**

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-blue?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Clerk](https://img.shields.io/badge/Auth-Clerk_Core_3-6C47FF?style=flat&logo=clerk)](https://clerk.com/)
[![PostgreSQL](https://img.shields.io/badge/Database-Neon_PostgreSQL-00E599?style=flat&logo=postgresql)](https://neon.tech/)
[![ORM](https://img.shields.io/badge/ORM-Drizzle_ORM-C5F74F?style=flat&logo=drizzle)](https://orm.drizzle.team/)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind_CSS_v4-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Tests-62%20passed-brightgreen?style=flat&logo=node.js)](https://nodejs.org/api/test.html)
[![Security](https://img.shields.io/badge/Security-Hardened-success?style=flat&logo=shield)](https://github.com/)

[Overview](#overview) • [Key Features](#key-features) • [Tech Stack](#tech-stack) • [Getting Started](#getting-started) • [Environment Configuration](#environment-configuration) • [Database Migrations](#database-migrations) • [Security Architecture](#security-architecture) • [Testing](#testing) • [Deployment](#deployment)

---

</div>

## Overview

**LifeCraft** is a modern, high-performance personal life management platform designed to replace fragmented tools. Instead of juggling separate apps for your to-do lists, habit trackers, long-term goals, personal journals, reading library, and focus timers, LifeCraft unifies them into a cohesive, distraction-free environment.

Built with the Next.js 15 App Router and React 19, LifeCraft provides instantaneous 0ms section navigation, server-side data isolation, and end-to-end cryptographic security.

---

## Key Features

### 📋 Task Management
- **Priorities & Statuses:** Organize tasks by `low`, `medium`, `high`, or `urgent` priorities and track them across `pending`, `in_progress`, and `completed`.
- **Hourly Scheduling:** Allocate specific time windows with calendar integration or mark items as flexible all-day tasks.
- **Search & Filter:** Instant multi-parameter filtering by date, schedule, priority, and text query.

### 🔄 Habit Tracking & Routines
- **Weekday Targeting:** Custom schedules (e.g., Monday/Wednesday/Friday or daily commitments).
- **Streak Calculation:** Resilient streak algorithms that account for non-scheduled days without breaking your progress momentum.
- **12-Week Heatmap:** Visual historical check-in density inspired by GitHub-style contribution graphs.

### 🎯 Goals & Milestones
- **Multi-Level Tracking:** Break expansive life visions into bite-sized, sequential milestones.
- **Automatic Progress Calculation:** Goal completion percentages compute dynamically from milestone achievements.
- **Status Lifecycle:** Transition seamlessly between `not_started`, `in_progress`, `completed`, and `archived`.

### 📝 Notes & Personal Journaling
- **Safe Markdown Rendering:** Custom AST-based markdown parser rendering headers, checklists, quotes, and syntax blocks without dangerous `innerHTML` injection.
- **Flexible Taxonomy:** Organize thoughts through custom user-defined folders and color-coded tag hierarchies.

### 📚 Personal Library & Document Studio
- **Dual-Format Reader:** Direct upload and reading support for both PDF and EPUB files.
- **Binary Magic-Byte Inspection:** Enforces strict server-side binary header verification (`%PDF` and `PK\x03\x04`), neutralizing file extension spoofing and disguised scripts.
- **Reading Collections & Bookmarks:** Organize books into collections and preserve reading positions across sessions.

### ⏱️ Focus Studio & Stopwatch
- **Pomodoro Timer:** Built-in presets for Standard Pomodoro (25m), Deep Focus (50m), Extended Focus (90m), and customized intervals.
- **Precision Stopwatch:** High-accuracy split and lap tracking with historical session logging.
- **State Recovery:** Persists active countdowns across accidental browser refreshes.

### 📅 Calendar & Google Calendar Sync
- **Unified Schedule:** View daily, weekly, and monthly time blocks with complete timezone awareness.
- **Google Calendar Export:** One-click task synchronization with Google Calendar via OAuth 2.0.
- **At-Rest Token Encryption:** Google OAuth tokens are stored using AES-256-GCM authenticated cipher with HMAC-SHA-256 signed states.

### ⚙️ User Settings & Personalization
- **Clerk Core 3 Synchronization:** Synchronize display names, profile avatars, verified email addresses, passwords, and connected Google accounts natively with Clerk.
- **Timezone Intelligence:** Automatic timezone resolution supporting international IANA zones with fallback defaults.

---

## Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | [Next.js 15 (App Router)](https://nextjs.org/) | Hybrid Server/Client rendering, Route Handlers, Server Actions |
| **Runtime & Language** | [Node.js 20+](https://nodejs.org/) & [TypeScript 5.9](https://www.typescriptlang.org/) | Type-safe end-to-end development |
| **Frontend Library** | [React 19](https://react.dev/) | React Server Components, Suspense, and Concurrent features |
| **Styling & UI** | [Tailwind CSS v4](https://tailwindcss.com/) & [Lucide Icons](https://lucide.dev/) | Utility-first styling with responsive, accessible components |
| **Authentication** | [Clerk Core 3](https://clerk.com/) | Verified session tokens, OAuth, `<UserProfile />`, and Webhooks |
| **Database** | [Neon Serverless PostgreSQL](https://neon.tech/) | Cloud-native serverless PostgreSQL with connection pooling |
| **ORM & Migrations** | [Drizzle ORM](https://orm.drizzle.team/) & Drizzle Kit | Type-safe SQL queries, schema definitions, and migration runner |
| **Storage** | S3-Compatible Storage / Private Vault | Scalable document storage for uploaded library materials |
| **Testing** | Node.js Test Runner (`node --test`) & `tsx` | Fast, zero-dependency unit and security test suite |

---

## Getting Started

### Prerequisites
- **Node.js**: `v20.x` or higher
- **npm**: `v10.x` or higher
- **Neon PostgreSQL Account**: [neon.tech](https://neon.tech)
- **Clerk Account**: [clerk.com](https://clerk.com)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/your-username/lifecraft.git
cd lifecraft
npm install
```

### 2. Configure Environment Variables

Create your local environment file from the template:

```bash
cp .env.example .env.local
```

Open `.env.local` and add your credentials (see [Environment Configuration](#environment-configuration)).

### 3. Run Database Migrations

Apply the database schema to your Neon PostgreSQL database:

```bash
npm run db:migrate
```

*(Optional)* Seed initial development data:

```bash
npm run db:seed:dev
```

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Environment Configuration

| Variable | Required | Description |
| :--- | :---: | :--- |
| `APP_URL` | **Yes** | Fully qualified base URL (e.g., `http://localhost:3000` or `https://yourdomain.com`). |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | **Yes** | Public publishable key from your Clerk Dashboard (`pk_test_...` or `pk_live_...`). |
| `CLERK_SECRET_KEY` | **Yes** | Server-only secret key from Clerk Dashboard (`sk_test_...` or `sk_live_...`). |
| `CLERK_WEBHOOK_SIGNING_SECRET` | **Yes** | Svix webhook secret for verifying Clerk lifecycle events (`whsec_...`). |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | **Yes** | Sign-in route path (`/sign-in`). |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | **Yes** | Sign-up route path (`/sign-up`). |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | **Yes** | Post-auth redirection destination (`/app`). |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | **Yes** | Post-registration redirection destination (`/app`). |
| `DATABASE_URL` | **Yes** | Neon PostgreSQL connection string with SSL (`postgresql://...?sslmode=require`). |
| `GOOGLE_CALENDAR_CLIENT_ID` | Optional | Google OAuth 2.0 Web Client ID for Google Calendar sync. |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Optional | Google OAuth 2.0 Web Client Secret. |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Optional | Exact OAuth callback URI registered in Google Cloud Console. |
| `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` | Optional | 32+ character key for AES-256-GCM encryption of stored OAuth tokens. |
| `AWS_ACCESS_KEY_ID` | Optional | S3-compatible access key for Neon Object Storage. |
| `AWS_SECRET_ACCESS_KEY` | Optional | S3-compatible secret key for Neon Object Storage. |
| `AWS_ENDPOINT_URL_S3` | Optional | S3-compatible storage endpoint URL. |

---

## Available Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Starts the Next.js development server with IPv4 priority. |
| `npm run build` | Compiles an optimized production build. |
| `npm run start` | Boots the compiled Next.js production server. |
| `npm run test` | Executes the 62-suite automated unit, timezone, and security tests. |
| `npm run lint` | Runs ESLint analysis across TypeScript and React code. |
| `npm run db:migrate` | Runs tracked SQL migrations from `./drizzle/*.sql` against the database. |
| `npm run db:generate`| Generates new SQL migration files based on schema changes. |
| `npm run db:seed:dev` | Populates the database with demo tasks, habits, and goals for local testing. |

---

## Security Architecture

LifeCraft adheres to a zero-trust, defense-in-depth security model:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          INCOMING HTTP REQUEST                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
         ┌──────────────────────────────────────────────────────┐
         │ Next.js Middleware (Clerk Core 3 Edge Middleware)    │
         └──────────────────────────┬───────────────────────────┘
                                    │
                                    ▼
         ┌──────────────────────────────────────────────────────┐
         │ Server Route Guards (await auth.protect())           │
         │ - 100% of /app/* pages gated on verified sessions    │
         └──────────────────────────┬───────────────────────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
       [API Mutation Handler]               [Page Component]
                  │                                   │
                  ▼                                   ▼
       ┌────────────────────────┐           ┌───────────────────┐
       │ CSRF / Origin Guard    │           │ User Isolation    │
       │ Rate Limiting (429)    │           │ Multi-Tenant Check│
       └──────────┬─────────────┘           └─────────┬─────────┘
                  │                                   │
                  └─────────────────┬─────────────────┘
                                    │
                                    ▼
         ┌──────────────────────────────────────────────────────┐
         │ Parameterized Drizzle ORM Queries                    │
         │ eq(table.userId, authUser.id) enforced on all tables │
         └──────────────────────────┬───────────────────────────┘
                                    │
                                    ▼
         ┌──────────────────────────────────────────────────────┐
         │ Sanitized Client Response (No raw SQL or stacktrace) │
         └──────────────────────────────────────────────────────┘
```

1. **Server-Side Authentication:** Client-supplied user IDs are never trusted. All operations extract identity from verified server sessions via `auth()`.
2. **Strict Multi-Tenant Isolation:** All database tables enforce foreign keys with `user_profiles.user_id`. Every SQL query is parameter-scoped to the active user.
3. **CSRF & Same-Origin Verification:** All state-changing mutation endpoints verify request origin headers and reject cross-site submissions (`verifySameOriginMutation`).
4. **Rate Limiting:** Sliding-window rate limiters prevent automated credential stuffing and resource exhaustion.
5. **No Secrets in Bundles:** Zero private keys or database connection strings are prefixed with `NEXT_PUBLIC_` or included in frontend bundles.
6. **Encrypted Third-Party Tokens:** Google Calendar OAuth tokens are encrypted at rest with AES-256-GCM.
7. **Document Upload Sandboxing:** Uploaded library documents are inspected for binary magic bytes, served with strict CSP sandbox headers, and prevented from executing scripts.
8. **Svix Webhook Verification:** Clerk webhook events are verified cryptographically using Svix signatures before modifying user records.

---

## Testing

LifeCraft features a comprehensive automated test suite testing validation, timezones, security guards, crypto, and models:

```bash
npm run test
```

```
✔ Phase 2 authentication validation & security helpers (5 tests)
✔ Calendar scheduling, hourly grid & timezone handling (3 tests)
✔ Google Calendar token crypto & OAuth state verification (3 tests)
✔ Focus Studio Pomodoro countdown, stopwatch & laps (4 tests)
✔ Goals, milestones & completion percentage tracking (5 tests)
✔ Habits streak calculations, weekday schedules & heatmaps (4 tests)
✔ Document library magic-byte inspection & storage security (6 tests)
✔ Notes markdown AST parsing & XSS sanitization (5 tests)
✔ Dashboard payload generation & timezone boundaries (7 tests)
✔ Security guards: rate limiting, CSRF origin verification (3 tests)
✔ Settings, timezones & account deletion validation (4 tests)
✔ Tasks validation, status transitions & sorting (8 tests)

Total: 62 passed, 0 failed (100% pass rate)
```

---

## Deployment

### Vercel / Cloud Run / Node.js Production Runbook

1. **Deploy Repository:** Connect your Git repository to your deployment provider (Vercel, Google Cloud Run, Railway, or AWS).
2. **Inject Secrets:** Configure production values for all environment variables from `.env.example`.
3. **Execute Migrations:**
   ```bash
   npm run db:migrate
   ```
4. **Configure Clerk Production Instance:**
   - Switch from Test Keys (`pk_test_...`, `sk_test_...`) to Production Keys (`pk_live_...`, `sk_live_...`).
   - Add your production domain in the Clerk Dashboard.
   - Point the Clerk Webhook endpoint to `https://yourdomain.com/api/webhooks/clerk`.
5. **Build & Launch:**
   ```bash
   npm run build
   npm run start
   ```

---

## License

This project is licensed under the [MIT License](LICENSE).
