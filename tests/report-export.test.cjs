const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const { PDFDocument } = require("pdf-lib");
const { unzipSync, strFromU8 } = require("fflate");

require.extensions[".ts"] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  module._compile(compiled.outputText, filename);
};

const { DEFAULT_ACCOUNTS, openingJournal, journalForEvent, trialBalance } = require("../lib/accounting.ts");
const { buildFinancialStatements } = require("../lib/financial-statements.ts");
const { buildAccountingNotes } = require("../lib/accounting-notes.ts");
const { createReportExport } = require("../lib/report-export.ts");
const { createXlsx } = require("../lib/report-xlsx.ts");
const { createPdf } = require("../lib/report-pdf.ts");

function balances(journals) {
  return trialBalance(journals, DEFAULT_ACCOUNTS).map((row) => ({
    code: row.code, name: row.name, class: row.class, role: row.role,
    totalDebit: row.debit, totalCredit: row.credit,
  }));
}

function fixture() {
  const day = "2026-11-26";
  const journals = [
    openingJournal("2026-01-01", [
      { accountCode: "1010", debit: 100_000, credit: 0 },
      { accountCode: "3100", debit: 0, credit: 100_000 },
    ], DEFAULT_ACCOUNTS),
    journalForEvent({ type: "cash_sale", date: day, sourceId: "sale-1", description: "Penjualan",
      amount: 50_000, cash: "1010", revenue: "4100" }, DEFAULT_ACCOUNTS),
    journalForEvent({ type: "cash_expense", date: day, sourceId: "expense-1", description: "Biaya",
      amount: 20_000, cash: "1010", expense: "6100" }, DEFAULT_ACCOUNTS),
  ];
  const empty = balances([]);
  const statements = buildFinancialStatements({ current: balances(journals), prior: empty,
    currentYearOpening: empty, priorYearOpening: empty });
  return createReportExport({ businessName: "Kedai <Arus> & Rekan", dates: {
    asOf: day, priorAsOf: "2025-11-26", currentStart: "2026-01-01", priorStart: "2025-01-01",
  }, statements, notes: buildAccountingNotes(statements),
  assetRegister: { status: "inactive", assets: [] } }, new Date("2026-11-26T08:00:00.000Z"));
}

test("PDF and XLSX exports contain the same reconciled report amounts and draft metadata", async () => {
  const report = fixture();
  assert.equal(report.sheets.length, 3);
  const profit = report.sheets[0].rows.find((row) => row.label === "Laba (rugi) periode");
  const assets = report.sheets[1].rows.find((row) => row.label === "Jumlah aset");
  assert.deepEqual([profit.current, profit.prior], [30_000, 0]);
  assert.deepEqual([assets.current, assets.prior], [130_000, 0]);

  const xlsx = createXlsx(report);
  const archive = unzipSync(xlsx);
  assert.ok(archive["xl/workbook.xml"]);
  assert.ok(archive["xl/worksheets/sheet3.xml"]);
  const incomeXml = strFromU8(archive["xl/worksheets/sheet1.xml"]);
  const positionXml = strFromU8(archive["xl/worksheets/sheet2.xml"]);
  assert.match(incomeXml, /Laba \(rugi\) periode/);
  assert.match(incomeXml, /<v>30000<\/v>/);
  assert.match(positionXml, /Jumlah aset/);
  assert.match(positionXml, /<v>130000<\/v>/);
  assert.match(incomeXml, /Kedai &lt;Arus&gt; &amp; Rekan/);
  assert.doesNotMatch(incomeXml, /<f>/);

  const pdfBytes = await createPdf(report);
  assert.equal(Buffer.from(pdfBytes.subarray(0, 5)).toString("ascii"), "%PDF-");
  const pdf = await PDFDocument.load(pdfBytes);
  assert.ok(pdf.getPageCount() >= 3);
  assert.match(pdf.getTitle(), /Kedai/);
  if (process.env.RENDER_REPORT_SAMPLES === "1") {
    fs.writeFileSync("/private/tmp/arus-report-export-direct.pdf", pdfBytes);
    fs.writeFileSync("/private/tmp/arus-report-export-workbook.xlsx", xlsx);
    fs.writeFileSync("/private/tmp/arus-report-export-position.pdf",
      await createPdf({ ...report, sheets: [report.sheets[1]] }));
    fs.writeFileSync("/private/tmp/arus-report-export-notes.pdf",
      await createPdf({ ...report, sheets: [report.sheets[2]] }));
  }
});
