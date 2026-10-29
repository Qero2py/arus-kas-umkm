# Arus Kas UMKM

Responsive cash flow prototype for UMKM owners and authorized managers. It records transactions and obligations, shows period balances and rule-based alerts, and projects cash over 7, 14, or 30 days. The interface is in Bahasa Indonesia.

This is a capstone prototype. The cash difference is not accounting profit, and projections are not guarantees or financial advice.

## Stack

Next.js 16, React 19, Tailwind CSS 4, Supabase Auth and PostgreSQL with Row Level Security. The prototype is deployed on Vercel at [arus-kas-umkm.vercel.app](https://arus-kas-umkm.vercel.app).

## Local setup

1. Install dependencies: `npm ci`.
2. Copy `.env.example` to `.env.local` and enter the Supabase project URL and publishable key. Keep `.env.local` out of Git.
3. Apply the migrations in `supabase/migrations` to the intended Supabase project. See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for the Auth and project setup.
4. Start the app: `npm run dev` and open `http://localhost:3000`.

Without Supabase environment variables, the app opens in demo mode with sample data.

## Project documents

- [prd.md](prd.md): submitted product requirements and acceptance targets.
- [ARCHITECTURE.md](ARCHITECTURE.md): implementation structure and design decisions.
- [CASH_RULES.md](CASH_RULES.md): balance, obligation, and projection rules.
- [PHASE6_REVIEW.md](PHASE6_REVIEW.md): internal checks and remaining PRD evidence.
- [PERFORMANCE_REVIEW.md](PERFORMANCE_REVIEW.md): deployed speed measurement and raw samples.
- [AVAILABILITY_MONITOR.md](AVAILABILITY_MONITOR.md): seven-day hourly measurement window and method.
- [USABILITY_REVIEW.md](USABILITY_REVIEW.md): usability test tasks.

## Checks

Run `npm run build` and `node --test tests/demo-calculations.test.cjs`. The full lint command currently reports `no-require-imports` in the CommonJS test file; this is documented in the Phase 6 review.
