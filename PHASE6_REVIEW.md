# Phase 6 review against `prd.md`

**29 October 2026.** The submitted `prd.md` is the acceptance reference. Internal functional checks passed for the six Must requirements. The five-participant usability target and seven-day availability target have not been measured, so Phase 6 is not fully evidenced.

## Functional requirements

| PRD item | Check and observed result | Status |
|---|---|---|
| FR-01 Transactions | A signed-in manager added an incoming Rp12,345 transaction, then corrected it to Rp12,000. The owner's open dashboard updated without a reload. A zero amount was rejected with a validation message in the isolated browser check. | Passed internally |
| FR-02 Balances and periods | With Rp5,000,000 opening cash, 30 days of Rp100,000 daily income and Rp40,000 daily expense, one Rp50,000 payment, Rp12,000 added income, and one Rp40,000 receipt, the live balance displayed Rp6,802,000. The selected period is visible on the dashboard. | Passed internally |
| FR-03 Obligations | The manager corrected a payable to Rp370,000, paid Rp50,000, and the owner saw Rp320,000 remaining. A second Rp100,000 payable and a Rp100,000 receivable were added; receiving Rp40,000 left Rp60,000 receivable. The due dates were visible. Reducing an obligation below its recorded payment was rejected by the database. | Passed internally |
| FR-04 Period cash difference | Independent calculation cases for income, expense, and cash difference passed; the interface uses “selisih kas”. The live seven-day incoming figure changed from Rp712,345 to Rp712,000 after correction. | Passed internally |
| FR-05 Projection | The owner viewed 7-, 14-, and 30-day horizons with assumptions and data status. On a 30-day horizon, opening cash Rp6,762,000 + routine net Rp1,812,000 − unpaid payables Rp420,000 gave scheduled ending cash Rp8,154,000. On the 14-day view, adding Rp100,000 receivable separated scheduled Rp7,287,600 from cautious Rp7,187,600. After receiving Rp40,000, cautious cash rose to Rp7,227,600 and scheduled cash stayed Rp7,287,600, showing no double count. A new business with no history displayed “data belum cukup” and did not present a reliable projection. | Passed internally |
| FR-06 Alerts | Adding a Rp100,000 payable due on the test date changed the owner's open dashboard to an urgent warning. The warning displayed severity, due date, outstanding value, and trigger explanation. | Passed internally |

The live checks used three disposable accounts in the linked Supabase development project: owner, invited manager, and an unrelated empty-business owner. Synthetic records were removed after testing. The earlier isolated demo check also covered saving an obligation, correction after partial receipt, reload persistence, validation, empty state, and corrupt local storage recovery. `node --test tests/demo-calculations.test.cjs` passed 8 calculation cases, including date boundaries and double-count prevention.

## Access and interface checks

- A manager could edit transactions and obligations for the shared business. Direct navigation to owner-only projection and settings returned to the dashboard; a direct database attempt to change owner settings was denied.
- The manager saw no data from the unrelated business. Unauthenticated access saw no business data. Earlier rollback-only RLS checks covered owner, manager, outsider, and cross-business reads/writes.
- At 460 px, owner, manager, and empty-business views had no horizontal overflow. At 1280 px, dashboard, transactions, obligations, and projection had no horizontal overflow. Loading, empty, success, validation, insufficient-data, and simulated network-error messages were observed; retry recovered after the simulated error ended.
- The production deployment at `https://arus-kas-umkm.vercel.app` returned the live login page over HTTPS. Unauthenticated dashboard, projection, and settings requests redirected to login. A disposable account signed up through the deployed form, reached onboarding, created an empty business, and saw its live dashboard. The test account and business were then deleted. A wider runtime-log review found a Next.js prerendering error during onboarding; the auth check was moved to request time before the next deployment.
- `npm run build` passed after the owner-only route change. A Next.js development overlay warning on the authenticated projection route was fixed by waiting for a request before checking owner access. Targeted ESLint passed. Full `npm run lint` still reports six existing `no-require-imports` errors in `tests/demo-calculations.test.cjs`.

## Nonfunctional requirements

| PRD item | Evidence and limit | Status |
|---|---|---|
| NFR-01 Usability | No five-person UMKM session was available. Scripted browser checks cannot establish whether four of five people finish three tasks unaided. Use the tasks in `USABILITY_REVIEW.md` when participants are available. | Not measured |
| NFR-02 Privacy and access | Live owner/manager/other-business checks and RLS negative checks passed with synthetic accounts. | Passed internally |
| NFR-03 Performance | Local production build on the Mac, authenticated owner, 1280 × 800 headless Chrome, linked Supabase development project, 30 days of synthetic history (63 transactions, three obligations), cached assets, serial page reloads. After three warm-ups, 20 full reloads per route measured from `performance.timeOrigin` until the correct heading and live balance were visible. Dashboard p50 664 ms, p95 983 ms, max 1,020 ms. Projection p50 735 ms, p95 1,053 ms, max 1,202 ms. Both meet the three-second target **under these local conditions**. This does not measure Vercel deployment or concurrent traffic. | Passed locally; deployment unmeasured |
| NFR-04 Transparency and integrity | Period labels, calculation components, assumptions, scenarios, insufficient-data state, and alert reasons were visible. Eight independent calculation cases passed; live values above were reconciled. | Passed internally |
| NFR-05 Availability | The public endpoint is `https://arus-kas-umkm.vercel.app/login`. A seven-day hourly monitor has not yet run, so the proposal's 160-of-168 target cannot be evaluated. | Not measured |
| NFR-06 Security | Server-side input validation, environment-based secrets, and RLS were checked in the application and linked development project. The production HTTPS login and unauthenticated route redirects passed smoke checks. The Supabase security advisor still flags the intentionally callable invite redemption function and disabled leaked-password protection in development Auth settings. | Partly verified; broader production review pending |
| NFR-07 Currency and time | Screens showed Rupiah amounts and Indonesian dates; calculation cases include date boundaries. | Passed internally |

## Remaining PRD evidence

1. Run the three core tasks with five consenting UMKM participants, record unaided completion and comprehension, and report the actual result. Do not infer a pass from internal testing.
2. Monitor the deployed `/login` endpoint hourly for seven days if retaining the proposal's availability target. Record the observation window and failed checks.
3. Measure authenticated dashboard and projection page-load timing on Vercel with a stated dataset; the local production-build result does not establish deployed performance. Complete a broader production security review before real business data is used.

FR-07 and FR-08 are Could/Should items deferred by the PRD's MVP scope; they are not Phase 6 release blockers.
