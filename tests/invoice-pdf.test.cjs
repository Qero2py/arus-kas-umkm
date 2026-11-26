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

const { createInvoicePdf } = require("../lib/invoice-pdf.ts");

test("invoice PDF fits 58 mm and 80 mm paper and carries the document identity", async () => {
  const invoice = {
    id: "invoice", businessName: "Kedai Arus", documentNo: "INV-001", issueDate: "2026-11-26",
    dueDate: "2026-12-03", description: "Pesanan makan siang", customerName: "Pelanggan Satu",
    phone: "081234567890", address: "Jalan Contoh 1", amount: 125000, paid: 25000, outstanding: 100000,
  };
  for (const paper of [58, 80]) {
    const bytes = await createInvoicePdf(invoice, paper);
    assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("ascii"), "%PDF-");
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    assert.ok(Math.abs(pdf.getPage(0).getWidth() - paper * 72 / 25.4) < 1);
    assert.match(pdf.getTitle(), /INV-001/);
  }
});
