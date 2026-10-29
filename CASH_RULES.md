# Cash calculation rules and reference examples

These examples use synthetic amounts in Rupiah and `27 October 2026` as the current date. They are arithmetic references for the calculation checks, not business data.

## Rules

- Actual cash = opening balance + realized inflows − realized outflows dated on or before the current date. Future-dated entries do not affect actual cash.
- A seven-day period includes the current date and the six preceding calendar dates. “All dates” still stops at the current date.
- The routine daily amount is the net of non-obligation transactions in the latest 30 calendar days, divided by **30**, including days with no recorded transaction. A projection is shown only when the recorded routine history spans at least 14 calendar days. Missing records can distort this estimate.
- Remaining debt or receivable = original amount − linked payments or receipts. A linked payment affects actual cash once and reduces the future obligation by the same amount.
- The scheduled forecast includes remaining receivables on their due dates; the cautious forecast excludes them. Both include remaining debts.
- A debt is flagged from three days before its due date until it is fully paid, including overdue dates. Actual cash below the safe threshold is flagged even when there is too little history for a forecast. “Below” means strictly less than the threshold.

## Hand-calculated examples

| Case | Inputs | Expected result |
|---|---|---|
| Actual cash and period boundary | Opening 1,000; +100 on 20 Oct; +200 on 21 Oct; −50 on 27 Oct; +500 dated 28 Oct | Actual cash: 1,000 + 100 + 200 − 50 = **1,250**. Seven-day inflow: **200**; outflow: **50**. The future +500 is excluded. |
| Partial receivable | Opening 1,000; routine +300 on 14 Oct; receivable 500 due 29 Oct, of which 200 already received | Actual cash: **1,300**. Routine daily amount: 300 ÷ 30 = **10**. On day 2, cautious: 1,300 + 2 × 10 = **1,320**; scheduled: 1,320 + (500 − 200) = **1,620**. |
| Current low cash without a forecast | Opening 500; −1,000 today; safe threshold 0; less than 14 days of routine history | Actual cash: **−500**. Show a current-balance warning and a separate “insufficient history” message; do not show forecast figures. |
| Due-date boundary | Unpaid debts due yesterday, today, in 3 days, and in 4 days | Flag the first three. Exclude the fourth-day debt and any fully paid debt. |
