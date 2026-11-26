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

const { calculateSaleTotal } = require("../lib/cashier.ts");

test("kasir menghitung harga barang pecahan dan menolak nominal tidak aman", () => {
  assert.equal(calculateSaleTotal("2.5", 12000), 30000);
  assert.equal(calculateSaleTotal("0.125", 1999), 250);
  assert.equal(calculateSaleTotal("0", 12000), null);
  assert.equal(calculateSaleTotal("1.2345", 12000), null);
  assert.equal(calculateSaleTotal("999999999", Number.MAX_SAFE_INTEGER), null);
});
