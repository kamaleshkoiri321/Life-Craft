<div align="center">

# Life-Craft 🌿

**Your tasks, habits, goals, notes, and reading library — all in one calm space. Build a life you love.**

[![GitHub Repo](https://img.shields.io/badge/GitHub-kamaleshkoiri321%2FLife--Craft-181717?style=flat&logo=github)](https://github.com/kamaleshkoiri321/Life-Craft)
[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-blue?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Clerk](https://img.shields.io/badge/Auth-Clerk_Core_3-6C47FF?style=flat&logo=clerk)](https://clerk.com/)
[![PostgreSQL](https://img.shields.io/badge/Database-Neon_PostgreSQL-00E599?style=flat&logo=postgresql)](https://neon.tech/)
[![ORM](https://img.shields.io/badge/ORM-Drizzle_ORM-C5F74F?style=flat&logo=drizzle)](https://orm.drizzle.team/)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind_CSS_v4-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Tests-62%20passed-brightgreen?style=flat&logo=node.js)](https://nodejs.org/api/test.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<br />

<img src="./public/images/hero-landing.jpg" alt="Life-Craft Application Preview" width="100%" style="border-radius: 14px; max-height: 480px; object-fit: cover; box-shadow: 0 10px 30px rgba(0,0,0,0.12);" />

<br />

[Overview](#overview) • [Key Features](#key-features) • [Tech Stack](#tech-stack) • [Getting Started](#getting-started) • [Environment Configuration](#environment-configuration) • [Security Architecture](#security-architecture) • [API & Webhooks](#api--webhooks) • [Testing](#testing) • [Deployment](#deployment) • [Author](#author)

---

</div>

## Overview

**Life-Craft** is a high-performance, all-in-one personal productivity and life management platform designed to replace fragmented tools. Instead of juggling separate applications for your to-dos, habit trackers, milestone goals, personal journals, reading library, and focus studio, Life-Craft unifies them into a single, cohesive, distraction-free environment.

Engineered with the **Next.js 15 App Router** and **React 19**, Life-Craft provides instantaneous 0ms section switching, server-side data isolation, and end-to-end cryptographic security.

---

## Key Features

### 📋 Task Management
- **Priorities & Statuses:** Categorize tasks by `low`, `medium`, `high`, or `urgent` priorities and track them across `pending`, `in_progress`, and `completed`.
- **Hourly Scheduling:** Allocate specific time windows on the daily schedule or mark items as flexible all-day tasks.
- **Search & Filter:** Instant multi-parameter filtering by date, schedule type, priority, and text search.

### 🔄 Habit Tracking & Routines
- **Weekday Targeting:** Flexible schedules (e.g., specific weekdays like Mon/Wed/Fri or daily commitments).
- **Streak Calculation:** Resilient streak algorithms that account for unscheduled rest days without breaking your streak.
- **12-Week Heatmap:** Visual historical check-in density inspired by GitHub-style contribution graphs.

### 🎯 Goals & Milestones
- **Multi-Level Tracking:** Break expansive life visions into structured, sequential milestones.
- **Dynamic Progress:** Goal completion percentages compute dynamically from milestone achievements.
- **Lifecycle Management:** Transition goals seamlessly between `not_started`, `in_progress`, `completed`, and `archived`.

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

### 📅 Native Calendar & Time-Blocking
- **Unified Schedule:** View daily, weekly, and monthly time blocks with complete timezone awareness.
- **Visual Hourly Grid:** 24-hour click time-slot scheduling and side-by-side overlap resolution.
- **Deadline Management:** Clear visual distinction between deadline-only due dates and intentional scheduled work hours.

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
| **Testing** | Node.js Test Runner (`node --test`) & `tsx` | Fast, zero-dependency unit, timezone, and security test suite |

---

## Getting Started

### Prerequisites
- **Node.js**: `v20.x` or higher
- **npm**: `v10.x` or higher
- **Neon PostgreSQL Account**: [neon.tech](https://neon.tech)
- **Clerk Account**: [clerk.com](https://clerk.com)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/kamaleshkoiri321/Life-Craft.git
cd Life-Craft
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

Life-Craft adheres to a zero-trust, defense-in-depth security model:

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
6. **Encrypted Private Data:** Document uploads and user records are securely isolated to the authenticated Clerk user.
7. **Document Upload Sandboxing:** Uploaded library documents are inspected for binary magic bytes, served with strict CSP sandbox headers, and prevented from executing scripts.
8. **Svix Webhook Verification:** Clerk webhook events are verified cryptographically using Svix signatures before modifying user records.

---

## API & Webhooks

### Key Endpoints

| Method | Endpoint | Description | Auth Required | CSRF / Rate Limit |
| :--- | :--- | :--- | :---: | :---: |
| `GET` | `/api/dashboard` | Aggregated overview data | Yes | Read-only |
| `POST` | `/api/tasks` | Create a new task | Yes | Yes (120 req/min) |
| `PATCH` | `/api/tasks/[id]` | Update task status, priority, or schedule | Yes | Yes (120 req/min) |
| `DELETE` | `/api/tasks/[id]` | Delete a task | Yes | Yes (120 req/min) |
| `POST` | `/api/habits` | Create a habit routine | Yes | Yes (120 req/min) |
| `POST` | `/api/habits/[id]/check-in` | Log daily habit completion | Yes | Yes (120 req/min) |
| `POST` | `/api/goals` | Create a life goal | Yes | Yes (120 req/min) |
| `POST` | `/api/goals/[id]/milestones` | Add goal milestone | Yes | Yes (120 req/min) |
| `POST` | `/api/notes` | Create a note or journal entry | Yes | Yes (120 req/min) |
| `POST` | `/api/library/upload/init` | Initiate secure document upload | Yes | Yes (60 req/min) |
| `PUT` | `/api/library/upload/[id]` | Upload binary PDF/EPUB bytes | Yes | Yes (60 req/min) |
| `POST` | `/api/webhooks/clerk` | Svix-verified user lifecycle sync | No (Svix HMAC) | Svix Signature |

---

## Testing

Life-Craft features an automated test suite verifying validation, timezones, security guards, crypto, and data models:

```bash
npm run test
```

```
✔ Phase 2 authentication validation & security helpers (5 tests)
✔ Calendar scheduling, hourly grid & timezone handling (3 tests)
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

## Author

**Kamalesh Koiri**  
GitHub: [@kamaleshkoiri321](https://github.com/kamaleshkoiri321)  
Repository: [kamaleshkoiri321/Life-Craft](https://github.com/kamaleshkoiri321/Life-Craft)

---

## License

This project is licensed under the [MIT License](LICENSE).
