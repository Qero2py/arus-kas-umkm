import { DEMO_DATE, type CashEntry, type Obligation, type ProjectionPoint } from "@/lib/demo-data";

export type Period = 7 | 30 | "all";

function dateNumber(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function daysBetweenDates(from: string, to: string) {
  return Math.round((dateNumber(to) - dateNumber(from)) / 86_400_000);
}

export function dateFromDemoDay(day: number, asOf = DEMO_DATE) {
  return new Date(dateNumber(asOf) + day * 86_400_000).toISOString().slice(0, 10);
}

export function formatDemoDate(date: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function formatShortDemoDate(date: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function isValidIsoDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(dateNumber(date)).toISOString().slice(0, 10) === date;
}

export function isValidDemoDate(date: string, asOf = DEMO_DATE) {
  return isValidIsoDate(date) && date <= asOf;
}

export function entryValue(entry: CashEntry) {
  return entry.type === "in" ? entry.amount : -entry.amount;
}

export function getBalance(entries: CashEntry[], openingBalance: number, asOf = DEMO_DATE) {
  return openingBalance + entries.filter((entry) => entry.date <= asOf).reduce((sum, entry) => sum + entryValue(entry), 0);
}

export function entriesForPeriod(entries: CashEntry[], period: Period, asOf = DEMO_DATE) {
  return entries.filter((entry) => entry.date <= asOf && (period === "all" || daysBetweenDates(entry.date, asOf) < period));
}

export function getCashSummary(entries: CashEntry[], openingBalance: number, period: Period, asOf = DEMO_DATE) {
  const selected = entriesForPeriod(entries, period, asOf);
  const incoming = selected.filter((entry) => entry.type === "in").reduce((sum, entry) => sum + entry.amount, 0);
  const outgoing = selected.filter((entry) => entry.type === "out").reduce((sum, entry) => sum + entry.amount, 0);
  return { incoming, outgoing, net: incoming - outgoing, balance: getBalance(entries, openingBalance, asOf), count: selected.length };
}

export function getCashTrend(entries: CashEntry[], openingBalance: number, period: Period, asOf = DEMO_DATE) {
  const firstDate = entries.reduce((earliest, entry) => entry.date < earliest ? entry.date : earliest, asOf);
  const startDay = period === "all" ? -daysBetweenDates(firstDate, asOf) : -(period - 1);
  const offsets = Array.from(new Set([0, 1, 2, 3, 4].map((index) => Math.round(startDay + ((0 - startDay) * index) / 4))));
  return offsets.map((day) => {
    const date = dateFromDemoDay(day, asOf);
    const balance = openingBalance + entries.filter((entry) => entry.date <= date).reduce((sum, entry) => sum + entryValue(entry), 0);
    return { date, label: formatShortDemoDate(date), value: balance };
  });
}

export function getDueSoon(obligations: Obligation[], asOf = DEMO_DATE) {
  return obligations.filter((item) => item.kind === "utang" && item.amount > item.settled && daysBetweenDates(asOf, item.dueDate) <= 3).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function getProjection(entries: CashEntry[], obligations: Obligation[], openingBalance: number, horizon: 7 | 14 | 30, asOf = DEMO_DATE) {
  const history = entries.filter((entry) => {
    const age = daysBetweenDates(entry.date, asOf);
    return age >= 0 && age < 30;
  });
  const routineHistory = history.filter((entry) => !entry.linkedObligationId);
  const earliest = routineHistory.reduce<string | null>((date, entry) => date === null || entry.date < date ? entry.date : date, null);
  const historyDays = earliest ? Math.min(30, daysBetweenDates(earliest, asOf) + 1) : 0;
  const dailyNet = Math.round(routineHistory.reduce((sum, entry) => sum + entryValue(entry), 0) / 30);
  const opening = getBalance(entries, openingBalance, asOf);
  const sufficient = historyDays >= 14;
  const points: ProjectionPoint[] = [{ label: formatShortDemoDate(asOf), day: 0, scheduled: opening, cautious: opening }];
  let scheduled = opening;
  let cautious = opening;

  if (sufficient) {
    for (let day = 1; day <= horizon; day += 1) {
      scheduled += dailyNet;
      cautious += dailyNet;
      for (const item of obligations) {
        const remaining = Math.max(item.amount - item.settled, 0);
        const eventDay = Math.max(1, daysBetweenDates(asOf, item.dueDate));
        if (remaining === 0 || eventDay !== day) continue;
        if (item.kind === "utang") {
          scheduled -= remaining;
          cautious -= remaining;
        } else {
          scheduled += remaining;
        }
      }
      points.push({ label: formatShortDemoDate(dateFromDemoDay(day, asOf)), day, scheduled, cautious });
    }
  }

  const payables = obligations.filter((item) => item.kind === "utang" && Math.max(1, daysBetweenDates(asOf, item.dueDate)) <= horizon).reduce((sum, item) => sum + Math.max(item.amount - item.settled, 0), 0);
  const receivables = obligations.filter((item) => item.kind === "piutang" && Math.max(1, daysBetweenDates(asOf, item.dueDate)) <= horizon).reduce((sum, item) => sum + Math.max(item.amount - item.settled, 0), 0);
  return { sufficient, historyDays, dailyNet, opening, points, payables, receivables, horizon };
}
