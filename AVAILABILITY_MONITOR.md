# Seven-day availability measurement

This checks the PRD's proposed target of at least 160 successful hourly checks out of 168. It does not claim that the target has already been met.

| Item | Definition |
|---|---|
| Window | 2026-10-29 08:17 UTC to 2026-11-05 08:17 UTC, end exclusive (29 October 15:17 to 5 November 15:17 WIB) |
| Expected slots | 168, one at minute 17 of each hour |
| Probe | Unauthenticated HTTPS GET `https://arus-kas-umkm.vercel.app/login` from a GitHub-hosted runner |
| Success | Curl exit 0, final HTTP 200, and response contains `Masuk ke Arus` |
| Failure | Any other result, or an expected hourly slot with no completed scheduled probe |
| Evidence | GitHub Actions workflow `PRD seven-day availability`; each active run uploads `availability-result.json` for 14 days |

The workflow is also manually runnable for a preflight. Manual runs do not count toward the 168 slots. At or after the end of the window, the next scheduled run attempts to disable the workflow. If that API call fails, disable it manually after collecting the results.

After the window, review the 168 hourly slots and the scheduled runs in the [Actions workflow](https://github.com/Qero2py/arus-kas-umkm/actions/workflows/availability.yml). Count at most one successful scheduled probe per slot; missing slots count as failures. Report the numerator, denominator, time window, any failed or missing slots, and the GitHub Actions scheduling limitation. A successful `/login` check verifies public reachability and the page body, not authenticated database functions or all routes.

GitHub warns that scheduled workflows can be delayed or dropped during high load. A missing run therefore shows that this monitoring method could not verify that hour; it does not by itself prove that Vercel was down. Do not treat the 160/168 result as a service-level availability claim without separating app failures from monitor failures.
