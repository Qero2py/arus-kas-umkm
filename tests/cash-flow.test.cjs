const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  module._compile(compiled.outputText, filename);
};

const { buildCashFlow } = require("../lib/cash-flow.ts");

test("cash-flow report reconciles opening, external movements, and internal transfers", () => {
  const report = buildCashFlow(1000, [
    { date: "2026-10-30", category: "cash_sale", type: "in", amount: 100 },
    { date: "2026-11-01", category: "cash_sale", type: "in", amount: 300 },
    { date: "2026-11-02", category: "cash_expense", type: "out", amount: 80 },
    { date: "2026-11-03", category: "cash_transfer", type: "out", amount: 200 },
    { date: "2026-11-03", category: "cash_transfer", type: "in", amount: 200 },
    { date: "2026-12-01", category: "cash_sale", type: "in", amount: 999 },
  ], "2026-11-01", "2026-11-30");
  assert.deepEqual({ opening: report.opening, incoming: report.incoming, outgoing: report.outgoing,
    transfers: report.transfers, closing: report.closing },
  { opening: 1100, incoming: 300, outgoing: 80, transfers: 200, closing: 1320 });
  assert.equal(report.groups.length, 2);
});

test("cash-flow report rejects unpaired transfer lines", () => {
  assert.throws(() => buildCashFlow(0, [{ date: "2026-11-01", category: "cash_transfer", type: "out", amount: 1 }], "2026-11-01", "2026-11-30"), /tidak seimbang/);
});

test("reversal of an internal transfer stays internal even when the source is correction", () => {
  const report = buildCashFlow(1000, [
    { journalId: "original", date: "2026-11-01", category: "cash_transfer", type: "out", amount: 200 },
    { journalId: "original", date: "2026-11-01", category: "cash_transfer", type: "in", amount: 200 },
    { journalId: "reversal", date: "2026-11-02", category: "correction_reversal", type: "out", amount: 200 },
    { journalId: "reversal", date: "2026-11-02", category: "correction_reversal", type: "in", amount: 200 },
  ], "2026-11-01", "2026-11-30");
  assert.equal(report.closing, 1000);
  assert.equal(report.incoming, 0);
  assert.equal(report.outgoing, 0);
  assert.equal(report.transfers, 400);
});
