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

const { DEFAULT_ACCOUNTS, createJournal, openingJournal, journalForEvent, trialBalance, incomeStatement, financialPosition, periodicCogs } = require("../lib/accounting.ts");

const date = "2026-10-31";
function event(type, sourceId, amount, fields) {
  return journalForEvent({ type, sourceId, amount, date, description: sourceId, ...fields }, DEFAULT_ACCOUNTS);
}

function balance(rows, code) {
  return rows.find((row) => row.code === code).balance;
}

test("restaurant example reconciles cash, profit and financial position", () => {
  const opening = createJournal({
    date: "2026-10-01", sourceType: "opening", sourceId: "opening-2026-10-01", description: "Saldo pembuka",
    lines: [
      { accountCode: "1010", debit: 1_000_000, credit: 0 },
      { accountCode: "1020", debit: 4_000_000, credit: 0 },
      { accountCode: "1200", debit: 600_000, credit: 0 },
      { accountCode: "1500", debit: 3_000_000, credit: 0 },
      { accountCode: "2100", debit: 0, credit: 500_000 },
      { accountCode: "3100", debit: 0, credit: 8_100_000 },
    ],
  }, DEFAULT_ACCOUNTS);
  const journals = [
    opening,
    event("cash_sale", "sale-1", 200_000, { cash: "1010", revenue: "4100" }),
    event("credit_sale", "sale-2", 150_000, { receivable: "1100", revenue: "4100" }),
    event("receivable_receipt", "receipt-1", 100_000, { cash: "1020", receivable: "1100" }),
    event("credit_inventory_purchase", "purchase-1", 300_000, { inventory: "1200", payable: "2100" }),
    event("payable_payment", "payment-1", 400_000, { payable: "2100", cash: "1020" }),
    event("cash_expense", "expense-1", 80_000, { expense: "6100", cash: "1010" }),
    event("capital_contribution", "capital-1", 500_000, { cash: "1020", capital: "3100" }),
    event("owner_draw", "draw-1", 120_000, { drawings: "3200", cash: "1010" }),
    event("cash_transfer", "transfer-1", 300_000, { fromCash: "1010", toCash: "1020" }),
    event("periodic_cogs", "cogs-1", periodicCogs(600_000, 300_000, 700_000), { cogs: "5100", inventory: "1200" }),
    event("depreciation", "depreciation-1", 50_000, { expense: "6200", accumulatedDepreciation: "1590" }),
  ];
  const rows = trialBalance(journals, DEFAULT_ACCOUNTS);
  assert.equal(balance(rows, "1010"), 700_000);
  assert.equal(balance(rows, "1020"), 4_500_000);
  assert.equal(balance(rows, "1100"), 50_000);
  assert.equal(balance(rows, "1200"), 700_000);
  assert.equal(balance(rows, "1590"), 50_000);
  assert.equal(balance(rows, "2100"), 400_000);
  assert.equal(balance(rows, "3200"), 120_000);
  assert.deepEqual(incomeStatement(rows), { revenue: 350_000, cogs: 200_000, otherExpenses: 130_000, profit: 20_000 });
  assert.deepEqual(financialPosition(rows), { assets: 8_900_000, liabilities: 400_000, equity: 8_500_000, balanced: true });
  assert.equal(rows.reduce((sum, row) => sum + row.debit, 0), rows.reduce((sum, row) => sum + row.credit, 0));
  assert.equal(rows.reduce((sum, row) => sum + row.endingDebit, 0), rows.reduce((sum, row) => sum + row.endingCredit, 0));
});

test("service business can use the same journal engine without stock", () => {
  const journals = [
    event("capital_contribution", "service-capital", 1_000_000, { cash: "1020", capital: "3100" }),
    event("credit_sale", "service-invoice", 200_000, { receivable: "1100", revenue: "4200" }),
    event("receivable_receipt", "service-receipt", 80_000, { cash: "1020", receivable: "1100" }),
    event("cash_expense", "service-expense", 30_000, { expense: "6100", cash: "1020" }),
  ];
  const rows = trialBalance(journals, DEFAULT_ACCOUNTS);
  assert.equal(balance(rows, "1200"), 0);
  assert.equal(balance(rows, "1100"), 120_000);
  assert.equal(balance(rows, "1020"), 1_050_000);
  assert.equal(incomeStatement(rows).profit, 170_000);
  assert.equal(financialPosition(rows).balanced, true);
});

test("unbalanced, repeated and invalid journals are rejected", () => {
  const sale = event("cash_sale", "sale-1", 100, { cash: "1010", revenue: "4100" });
  assert.throws(() => createJournal({ ...sale, lines: [{ accountCode: "1010", debit: 100, credit: 0 }, { accountCode: "4100", debit: 0, credit: 99 }] }, DEFAULT_ACCOUNTS), /tidak seimbang/);
  assert.throws(() => trialBalance([sale, sale], DEFAULT_ACCOUNTS), /dua kali/);
  assert.throws(() => event("cash_sale", "zero", 0, { cash: "1010", revenue: "4100" }), /positif/);
  assert.throws(() => event("cash_sale", "float", 1.5, { cash: "1010", revenue: "4100" }), /positif/);
  assert.throws(() => event("cash_sale", "wrong-account", 100, { cash: "2100", revenue: "4100" }), /tidak cocok/);
  assert.throws(() => event("cash_transfer", "same-wallet", 100, { fromCash: "1010", toCash: "1010" }), /berbeda/);
  assert.throws(() => event("cash_sale", "bad-date", 100, { cash: "1010", revenue: "4100", date: "2026-02-30" }), /Tanggal/);
  const inactiveAccounts = DEFAULT_ACCOUNTS.map((account) => account.code === "1010" ? { ...account, active: false } : account);
  assert.throws(() => journalForEvent({ type: "cash_sale", sourceId: "inactive", amount: 100, date, description: "inactive", cash: "1010", revenue: "4100" }, inactiveAccounts), /tidak cocok/);
  const invalidAccounts = DEFAULT_ACCOUNTS.map((account) => account.code === "1010" ? { ...account, class: "revenue" } : account);
  assert.throws(() => trialBalance([], invalidAccounts), /Klasifikasi/);
});

test("periodic cost of sales rejects impossible inventory values", () => {
  assert.equal(periodicCogs(600, 300, 700), 200);
  assert.throws(() => periodicCogs(100, 0, 101), /melebihi/);
  assert.throws(() => periodicCogs(100, -1, 0), /nonnegatif/);
});

test("opening balances accept only balanced position accounts", () => {
  const opening = openingJournal(date, [
    { accountCode: "1010", debit: 100_000, credit: 0 },
    { accountCode: "3100", debit: 0, credit: 100_000 },
  ], DEFAULT_ACCOUNTS);
  assert.equal(opening.sourceType, "opening_balance");
  assert.equal(opening.sourceId, "initial");
  assert.throws(() => openingJournal(date, [
    { accountCode: "1010", debit: 100_000, credit: 0 },
    { accountCode: "4100", debit: 0, credit: 100_000 },
  ], DEFAULT_ACCOUNTS), /tidak dapat digunakan/);
  assert.throws(() => openingJournal(date, [
    { accountCode: "1010", debit: 100_000, credit: 0 },
    { accountCode: "3100", debit: 0, credit: 99_999 },
  ], DEFAULT_ACCOUNTS), /tidak seimbang/);
  assert.throws(() => openingJournal("2026-13-40", opening.lines, DEFAULT_ACCOUNTS), /Tanggal/);
});
