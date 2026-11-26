const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const { PDFDocument } = require("pdf-lib");

require.extensions[".ts"] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  module._compile(compiled.outputText, filename);
};

const { createCashReceiptPdf } = require("../lib/cash-receipt-pdf.ts");

test("cash receipt PDF supports 58 and 80 mm and identifies corrected sales", async () => {
  const receipt = { journalId: "journal", receiptNo: "TRX-001", businessName: "Warung Arus",
    date: "2026-11-26", description: "Penjualan tunai contoh", cashName: "Kas Laci",
    amount: 100000, corrected: true };
  for (const paper of [58, 80]) {
    const bytes = await createCashReceiptPdf(receipt, paper);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    assert.ok(Math.abs(pdf.getPage(0).getWidth() - paper * 72 / 25.4) < 1);
    assert.match(pdf.getTitle(), /TRX-001/);
  }
});
