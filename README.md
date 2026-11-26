# Arus Kas UMKM

Responsive cash flow prototype for UMKM owners and authorized managers. It records transactions and obligations, shows period balances and rule-based alerts, and projects cash over 7, 14, or 30 days. The interface is in Bahasa Indonesia.

This is a capstone prototype. The cash difference is not accounting profit, and projections are not guarantees or financial advice.

## Accounting expansion

[PRD v2](PRD_ACCOUNTING_V2.md) describes the general-purpose UMKM accounting system. All twenty-one migrations are applied to production and the separate `arus-accounting-dev` project. The owner-only accounting UI includes a chart of accounts, opening balances with customer/supplier details, cash and credit transactions, contacts, products and services, stock with moving-average HPP, fixed assets and monthly depreciation, a trial balance, general ledger, monthly closing, audited corrections, and draft financial statements. The production demo business has reconciled accounting data starting 30 October 2026. See [DEMO_GUIDE.md](DEMO_GUIDE.md) for the account and walkthrough. These accounting reports remain drafts pending business-specific review and final SAK EMKM assessment.

The `/accounting/statements` route shows draft income and financial-position statements with prior-year comparisons and concise notes. It checks journal balance and note reconciliation. PDF and Excel exports identify the business, period, generation time, currency, and draft status. The legacy cash ledger remains a separate historical view; the demo accounting opening balance reconciles its cash position at 30 October 2026 and later selected cash transactions were mirrored into journals.

## Stack

Next.js 16, React 19, Tailwind CSS 4, Supabase Auth and PostgreSQL with Row Level Security. The production application is at [www.arus-kas.online](https://www.arus-kas.online).

## Local setup

1. Install dependencies: `npm ci`.
2. Copy `.env.example` to `.env.local` and enter the Supabase project URL and publishable key. Keep `.env.local` out of Git.
3. Apply the migrations in `supabase/migrations` to the intended Supabase project. See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for the Auth and project setup.
4. Start the app: `npm run dev` and open `http://localhost:3000`.

Without Supabase environment variables, the app opens in demo mode with sample data.

For accounting development on this checkout, run `npm run dev:accounting`. It reads the Git-ignored `.env.accounting-dev.local` file and refuses to start if its project ref equals the production project currently linked to the CLI. It supplies only the development URL and publishable key to Next.js; `.env.local` remains the production configuration. Open `/accounting/accounts` after signing in as a development business owner, then visit **Saldo pembuka**, **Catat transaksi**, **Kontak**, **Penjualan & pembelian tempo**, **Produk & stok**, **Aset tetap**, and **Buku besar & neraca saldo**. Before the first stock or asset event, reconcile the respective opening register with its general-ledger accounts. Monthly depreciation is calculated and posted when the owner runs that month from **Aset tetap**. Use `npm run build:accounting` for a local build with development settings. If Turbopack cannot bind a port in a restricted environment, use `npm run build:accounting -- --webpack`.

## Project documents

- [prd.md](prd.md): submitted product requirements and acceptance targets.
- [PRD_ACCOUNTING_V2.md](PRD_ACCOUNTING_V2.md): accounting expansion requirements and implementation sequence.
- [ACCOUNTING_EXAMPLES.md](ACCOUNTING_EXAMPLES.md): hand-calculated journal and report reference case.
- [DEMO_GUIDE.md](DEMO_GUIDE.md): production demo account and feature walkthrough.
- [ARCHITECTURE.md](ARCHITECTURE.md): implementation structure and design decisions.
- [CASH_RULES.md](CASH_RULES.md): balance, obligation, and projection rules.
- [PHASE6_REVIEW.md](PHASE6_REVIEW.md): internal checks and remaining PRD evidence.
- [PERFORMANCE_REVIEW.md](PERFORMANCE_REVIEW.md): deployed speed measurement and raw samples.
- [AVAILABILITY_MONITOR.md](AVAILABILITY_MONITOR.md): seven-day hourly measurement window and method.
- [USABILITY_REVIEW.md](USABILITY_REVIEW.md): usability test tasks.

## Checks

Run `npm run build:accounting`, `npm run lint`, and `node --test tests/*.test.cjs`. The accounting test covers journal balance, account roles, opening balances, a restaurant example, and a service example. `tests/accounting_database_smoke.sql` checks posting, balances, reports, permissions, and cleanup inside a rolled-back transaction on the development database. `tests/accounting_api_smoke.mjs` checks the same path through Supabase Auth and PostgREST when supplied with development-only test keys. The Phase 6 review records the lint limitation that existed before the CommonJS test override was added.
