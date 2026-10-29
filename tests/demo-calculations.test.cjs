const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8").replace('from "@/lib/demo-data"', 'from "./demo-data"');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  module._compile(compiled.outputText, filename);
};

const { DEMO_DATE, demoObligations, demoTransactions } = require("../lib/demo-data.ts");
const { getCashSummary, getProjection, getBalance, getCashTrend, getDueSoon, entriesForPeriod, isValidIsoDate } = require("../lib/demo-calculations.ts");

function entry(id, date, type, amount) {
  return { id, date, dateLabel: date, title: id, category: "Test", type, amount, method: "Tunai" };
}

function obligation(id, kind, dueDate, amount, settled = 0) {
  return { id, kind, party: "Test", description: "Test", dueDate, dueLabel: dueDate, dueInDays: 0, amount, settled };
}

test("sample balance and period totals match the ledger", () => {
  const all = getCashSummary(demoTransactions, 12_500_000, "all");
  assert.equal(all.incoming, 9_120_000);
  assert.equal(all.outgoing, 11_032_000);
  assert.equal(all.net, -1_912_000);
  assert.equal(all.balance, 10_588_000);
  const sevenDays = getCashSummary(demoTransactions, 12_500_000, 7);
  assert.equal(sevenDays.incoming, 7_570_000);
  assert.equal(sevenDays.outgoing, 4_532_000);
  assert.equal(sevenDays.net, 3_038_000);
  assert.equal(entriesForPeriod(demoTransactions, 7).every((entry) => entry.date >= "2026-10-21"), true);
});

test("forecast uses outstanding obligations and excludes receivables in cautious mode", () => {
  const result = getProjection(demoTransactions, demoObligations, 12_500_000, 30);
  assert.equal(result.sufficient, true);
  assert.equal(result.historyDays, 30);
  assert.equal(result.opening, 10_588_000);
  assert.equal(result.dailyNet, -67_067);
  assert.equal(result.payables, 6_700_000);
  assert.equal(result.receivables, 2_150_000);
  assert.equal(result.points[30].cautious, 1_875_990);
  assert.equal(result.points[30].scheduled, 4_025_990);
});

test("a recorded payable payment moves cash today and removes the same future amount", () => {
  const paid = 200_000;
  const payment = { id: "payment-test", date: DEMO_DATE, dateLabel: "27 Okt 2026", title: "Pembayaran", category: "Pembayaran utang", type: "out", amount: paid, method: "Transfer", linkedObligationId: "OB-01" };
  const obligations = demoObligations.map((item) => item.id === "OB-01" ? { ...item, settled: item.settled + paid } : item);
  const before = getProjection(demoTransactions, demoObligations, 12_500_000, 30);
  const after = getProjection([payment, ...demoTransactions], obligations, 12_500_000, 30);
  assert.equal(getBalance([payment, ...demoTransactions], 12_500_000), before.opening - paid);
  assert.equal(after.payables, before.payables - paid);
  assert.equal(after.dailyNet, before.dailyNet);
  assert.equal(after.points[30].scheduled, before.points[30].scheduled);
  assert.equal(after.points[30].cautious, before.points[30].cautious);
});

test("short history does not produce a forecast", () => {
  const result = getProjection(demoTransactions.filter((entry) => entry.date >= "2026-10-24"), demoObligations, 12_500_000, 30);
  assert.equal(result.sufficient, false);
  assert.equal(result.points.length, 1);
});

test("date-only validation rejects impossible dates", () => {
  assert.equal(isValidIsoDate("2026-02-30"), false);
  assert.equal(isValidIsoDate("2026-10-27"), true);
});

test("future entries stay out of actual cash and the seven-day boundary is inclusive", () => {
  const entries = [
    entry("old", "2026-10-20", "in", 100),
    entry("boundary", "2026-10-21", "in", 200),
    entry("today", "2026-10-27", "out", 50),
    entry("future", "2026-10-28", "in", 500),
  ];
  // Hand calculation: 1,000 + 100 + 200 - 50 = 1,250.
  assert.deepEqual(getCashSummary(entries, 1000, "all"), { incoming: 300, outgoing: 50, net: 250, balance: 1250, count: 3 });
  assert.deepEqual(getCashSummary(entries, 1000, 7), { incoming: 200, outgoing: 50, net: 150, balance: 1250, count: 2 });
  assert.equal(getCashTrend(entries, 1000, "all").at(-1).value, 1250);
  assert.equal(getProjection(entries, [], 1000, 7).opening, 1250);
});

test("partial receivable affects only the scheduled forecast, using the full 30-day divisor", () => {
  const entries = [entry("start", "2026-10-14", "in", 300), entry("future", "2026-10-28", "in", 500)];
  const receivables = [obligation("r", "piutang", "2026-10-29", 500, 200)];
  const result = getProjection(entries, receivables, 1000, 7);
  // Hand calculation: actual 1,300; routine 300 / 30 = 10 per day;
  // day 2 cautious 1,320; scheduled adds the unpaid 300 = 1,620.
  assert.equal(result.sufficient, true);
  assert.equal(result.historyDays, 14);
  assert.equal(result.dailyNet, 10);
  assert.equal(result.opening, 1300);
  assert.equal(result.receivables, 300);
  assert.equal(result.points[2].cautious, 1320);
  assert.equal(result.points[2].scheduled, 1620);
});

test("due warning includes overdue and the third day, but excludes settled and fourth-day items", () => {
  const items = [
    obligation("overdue", "utang", "2026-10-26", 100),
    obligation("today", "utang", "2026-10-27", 100),
    obligation("three", "utang", "2026-10-30", 100),
    obligation("four", "utang", "2026-10-31", 100),
    obligation("settled", "utang", "2026-10-27", 100, 100),
    obligation("receivable", "piutang", "2026-10-27", 100),
  ];
  assert.deepEqual(getDueSoon(items).map((item) => item.id), ["overdue", "today", "three"]);
});
