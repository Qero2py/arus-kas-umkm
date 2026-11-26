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

const { DEFAULT_ACCOUNTS, openingJournal } = require("../lib/accounting.ts");
const { validateOpeningCreditDetails } = require("../lib/opening-credits.ts");

const date = "2026-12-01";
const lines = openingJournal(date, [
  { accountCode: "1010", debit: 6_692_000, credit: 0 },
  { accountCode: "1100", debit: 60_000, credit: 0 },
  { accountCode: "2100", debit: 0, credit: 200_000 },
  { accountCode: "3100", debit: 0, credit: 6_552_000 },
], DEFAULT_ACCOUNTS).lines;
const contactId = "b144319b-54b4-4b87-8c9a-76689d1a989b";
const details = [
  { kind: "sale", contactId, documentNo: "INV-LAMA-1", issueDate: "2026-11-01",
    dueDate: "2026-11-02", description: "Sisa pesanan", amount: 60_000, controlAccountCode: "1100" },
  { kind: "purchase", contactId, documentNo: "BILL-LAMA-1", issueDate: "2026-10-20",
    dueDate: "2026-10-31", description: "Sisa bahan", amount: 100_000, controlAccountCode: "2100" },
  { kind: "purchase", contactId, documentNo: "BILL-LAMA-2", issueDate: "2026-10-25",
    dueDate: "2026-11-04", description: "Sisa bahan lain", amount: 100_000, controlAccountCode: "2100" },
];

test("opening credit details reconcile each control account without new revenue", () => {
  assert.deepEqual(validateOpeningCreditDetails(date, lines, DEFAULT_ACCOUNTS, details),
    { receivable: 60_000, payable: 200_000 });
  assert.ok(lines.every((line) => !["4100", "5100", "6100"].includes(line.accountCode)));
});

test("opening credit details reject incomplete, duplicate, or invalid legacy documents", () => {
  assert.throws(() => validateOpeningCreditDetails(date, lines, DEFAULT_ACCOUNTS, details.slice(0, 2)),
    /Jumlah rincian/);
  assert.throws(() => validateOpeningCreditDetails(date, lines, DEFAULT_ACCOUNTS,
    [details[0], { ...details[0] }, ...details.slice(1)]), /ganda/);
  assert.throws(() => validateOpeningCreditDetails(date, lines, DEFAULT_ACCOUNTS,
    [{ ...details[0], issueDate: "2026-12-02" }, ...details.slice(1)]), /Periksa kontak/);
});
