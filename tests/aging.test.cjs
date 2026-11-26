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

const { agingBucket, buildAgingSummary } = require("../lib/aging.ts");

test("aging groups unpaid balances by due date without counting settled amounts", () => {
  const asOf = "2026-11-26";
  assert.equal(agingBucket("2026-11-26", asOf), "belum_jatuh_tempo");
  assert.equal(agingBucket("2026-11-25", asOf), "lewat_1_30");
  assert.equal(agingBucket("2026-10-27", asOf), "lewat_1_30");
  assert.equal(agingBucket("2026-10-26", asOf), "lewat_31_60");
  assert.equal(agingBucket("2026-09-26", asOf), "lewat_61_plus");
  const obligations = [
    { kind: "piutang", dueDate: "2026-11-25", amount: 100, settled: 40 },
    { kind: "piutang", dueDate: "2026-12-01", amount: 50, settled: 0 },
    { kind: "utang", dueDate: "2026-10-26", amount: 200, settled: 150 },
    { kind: "utang", dueDate: "2026-09-26", amount: 10, settled: 10 },
  ];
  const result = buildAgingSummary(obligations, asOf);
  assert.equal(result.receivables.lewat_1_30, 60);
  assert.equal(result.receivables.belum_jatuh_tempo, 50);
  assert.equal(result.receivables.total, 110);
  assert.equal(result.payables.lewat_31_60, 50);
  assert.equal(result.payables.lewat_61_plus, 0);
});
