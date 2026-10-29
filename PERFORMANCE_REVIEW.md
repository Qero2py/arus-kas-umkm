# Deployed performance measurement

**29 October 2026.** This is a single-client measurement of the Vercel production app at `https://arus-kas-umkm.vercel.app`. It checks PRD NFR-03 under the conditions below; it is not a concurrency or long-term service-level test.

| Condition | Value |
|---|---|
| Client | Headless Chrome 150 on the local Mac, 1280 × 800 viewport |
| Account | Disposable authenticated owner, deleted after the run |
| Dataset | One synthetic business with Rp5,000,000 opening cash, 30 days of history, 63 realized transactions, and three obligations |
| Expected actual cash | Rp6,802,000, visible on both tested pages |
| Procedure | Three warm-up reloads per route, then 20 serial full reloads per route with browser assets cached |
| Timer | Browser `performance.now()` from each navigation's time origin until the route heading and live Rp6,802,000 balance were visible |
| Network | From this Mac to Vercel and the linked Supabase development project; no concurrent load was generated |
| Target | p95 ≤ 3,000 ms for dashboard and projection |

| Route | Samples | p50 | p95 | Maximum | Result |
|---|---:|---:|---:|---:|---|
| `/dashboard` | 20 | 1,480 ms | **1,904 ms** | 2,192 ms | Met target |
| `/projection` | 20 | 1,757 ms | **2,482 ms** | 2,485 ms | Met target |

The p95 is the 19th value after sorting each set of 20 measurements. Raw durations in milliseconds, in collection order:

- Dashboard: 1712, 1904, 1661, 2192, 1895, 1567, 1687, 1061, 1562, 1279, 1699, 1480, 1008, 1051, 1887, 1460, 1234, 1060, 1360, 1240.
- Projection: 1657, 1843, 1341, 1874, 2316, 1431, 1597, 1761, 2030, 1722, 1867, 2482, 1424, 2074, 1232, 1568, 2485, 1442, 1757, 1868.

The synthetic account, business, transactions, and obligations were removed; a database query confirmed zero remaining rows for those IDs. Production runtime logs showed zero errors in the checked window after the run. The result may differ on slower devices, networks, larger datasets, or concurrent traffic.
