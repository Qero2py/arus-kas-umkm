const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  module._compile(compiled.outputText, filename);
};

const { DEFAULT_ACCOUNTS, journalForEvent, openingJournal, trialBalance } = require("../lib/accounting.ts");
const { buildFinancialStatements } = require("../lib/financial-statements.ts");
const { assetRegisterMatches, buildAccountingNotes } = require("../lib/accounting-notes.ts");

function event(date, type, id, amount, fields) {
  return journalForEvent({ date, type, sourceId: id, description: id, amount, ...fields }, DEFAULT_ACCOUNTS);
}

function asSnapshot(journals, asOf) {
  return trialBalance(journals.filter((journal) => journal.date <= asOf), DEFAULT_ACCOUNTS)
    .map((row) => ({ code: row.code, name: row.name, class: row.class, role: row.role,
      totalDebit: row.debit, totalCredit: row.credit }));
}

test("comparative reports reconcile profit, prior earnings and position across years", () => {
  const journals = [
    openingJournal("2025-01-01", [
      { accountCode: "1010", debit: 100, credit: 0 },
      { accountCode: "3100", debit: 0, credit: 100 },
    ], DEFAULT_ACCOUNTS),
    event("2025-06-01", "cash_sale", "sale-2025-a", 30, { cash: "1010", revenue: "4100" }),
    event("2025-06-02", "cash_expense", "expense-2025", 10, { cash: "1010", expense: "6100" }),
    event("2025-12-15", "cash_sale", "sale-2025-b", 20, { cash: "1010", revenue: "4100" }),
    event("2026-01-10", "cash_sale", "sale-2026", 50, { cash: "1010", revenue: "4100" }),
    event("2026-01-12", "cash_expense", "expense-2026", 15, { cash: "1010", expense: "6100" }),
    event("2026-01-15", "owner_draw", "draw-2026", 5, { cash: "1010", drawings: "3200" }),
  ];
  const result = buildFinancialStatements({
    current: asSnapshot(journals, "2026-06-30"),
    prior: asSnapshot(journals, "2025-06-30"),
    currentYearOpening: asSnapshot(journals, "2025-12-31"),
    priorYearOpening: asSnapshot(journals, "2024-12-31"),
  });
  assert.deepEqual(result.income.netProfit, { current: 35, prior: 20 });
  assert.deepEqual(result.position.priorYearsResult, { current: 40, prior: 0 });
  assert.deepEqual(result.position.totalAssets, { current: 170, prior: 120 });
  assert.deepEqual(result.position.totalEquity, { current: 170, prior: 120 });
  assert.deepEqual(result.position.totalLiabilitiesAndEquity, result.position.totalAssets);
  assert.equal(result.position.equityAccounts.find((row) => row.code === "3200").current, -5);
});

test("restaurant reference case matches the published October 2026 figures", () => {
  const day = "2026-10-31";
  const journals = [
    openingJournal("2026-10-01", [
      { accountCode: "1010", debit: 1_000_000, credit: 0 },
      { accountCode: "1020", debit: 4_000_000, credit: 0 },
      { accountCode: "1200", debit: 600_000, credit: 0 },
      { accountCode: "1500", debit: 3_000_000, credit: 0 },
      { accountCode: "2100", debit: 0, credit: 500_000 },
      { accountCode: "3100", debit: 0, credit: 8_100_000 },
    ], DEFAULT_ACCOUNTS),
    event(day, "cash_sale", "sale-cash", 200_000, { cash: "1010", revenue: "4100" }),
    event(day, "credit_sale", "sale-credit", 150_000, { receivable: "1100", revenue: "4100" }),
    event(day, "receivable_receipt", "customer-pay", 100_000, { cash: "1020", receivable: "1100" }),
    event(day, "credit_inventory_purchase", "stock-buy", 300_000, { inventory: "1200", payable: "2100" }),
    event(day, "payable_payment", "supplier-pay", 400_000, { payable: "2100", cash: "1020" }),
    event(day, "cash_expense", "operating-cost", 80_000, { expense: "6100", cash: "1010" }),
    event(day, "capital_contribution", "capital", 500_000, { cash: "1020", capital: "3100" }),
    event(day, "owner_draw", "draw", 120_000, { drawings: "3200", cash: "1010" }),
    event(day, "cash_transfer", "transfer", 300_000, { fromCash: "1010", toCash: "1020" }),
    event(day, "periodic_cogs", "cogs", 200_000, { cogs: "5100", inventory: "1200" }),
    event(day, "depreciation", "depreciation", 50_000,
      { expense: "6200", accumulatedDepreciation: "1590" }),
  ];
  const statements = buildFinancialStatements({
    current: asSnapshot(journals, day), prior: asSnapshot(journals, "2025-10-31"),
    currentYearOpening: asSnapshot(journals, "2025-12-31"),
    priorYearOpening: asSnapshot(journals, "2024-12-31"),
  });
  assert.deepEqual(statements.income.totalRevenue, { current: 350_000, prior: 0 });
  assert.deepEqual(statements.income.totalCogs, { current: 200_000, prior: 0 });
  assert.deepEqual(statements.income.totalExpenses, { current: 130_000, prior: 0 });
  assert.deepEqual(statements.income.netProfit, { current: 20_000, prior: 0 });
  assert.deepEqual(statements.position.totalAssets, { current: 8_900_000, prior: 0 });
  assert.deepEqual(statements.position.totalLiabilities, { current: 400_000, prior: 0 });
  assert.deepEqual(statements.position.totalEquity, { current: 8_500_000, prior: 0 });
  assert.equal(statements.position.assets.find((row) => row.code === "1590").current, -50_000);
  const notes = buildAccountingNotes(statements);
  assert.deepEqual(notes.cashTotal, { current: 5_200_000, prior: 0 });
  assert.deepEqual(notes.receivablesTotal, { current: 50_000, prior: 0 });
  assert.deepEqual(notes.inventoryTotal, { current: 700_000, prior: 0 });
  assert.deepEqual(notes.netFixedAssets, { current: 2_950_000, prior: 0 });
  assert.deepEqual(notes.payablesTotal, { current: 400_000, prior: 0 });
});

test("reports reject an unbalanced trial balance instead of displaying it", () => {
  const empty = asSnapshot([], "2025-12-31");
  const invalid = empty.map((row) => row.code === "1010" ? { ...row, totalDebit: 1 } : row);
  assert.throws(() => buildFinancialStatements({ current: invalid, prior: empty,
    currentYearOpening: empty, priorYearOpening: empty }), /tidak seimbang/);
});

test("asset details appear only when their totals reconcile with the ledger", () => {
  const assets = [{ cost: 3_000_000, accumulated: 50_000 }];
  assert.equal(assetRegisterMatches(assets, 3_000_000, 50_000), true);
  assert.equal(assetRegisterMatches(assets, 3_000_000, 49_999), false);
  assert.equal(assetRegisterMatches([{ cost: 100, accumulated: 101 }], 100, 101), false);
});
