import type { StatementLine } from "@/lib/financial-statements";
import type { buildFinancialStatements } from "@/lib/financial-statements";

type Statements = ReturnType<typeof buildFinancialStatements>;
type Pair = { current: number; prior: number };

export const ACCOUNTING_NOTE_POLICIES = [
  "Transaksi tunai dan tempo diakui melalui jurnal pada tanggal pembukuan; pembayaran piutang/utang tidak mengakui pendapatan/beban kedua kali.",
  "Jika buku persediaan aktif, biaya barang yang keluar dihitung dengan rata-rata bergerak berdasarkan mutasi produk.",
  "Aset selain tanah disusutkan dengan metode garis lurus per bulan saat pemilik menjalankan penyusutan; tanah tidak disusutkan.",
  "Prive mengurangi ekuitas. Periode tertutup menolak pembukuan baru pada bulan tersebut.",
] as const;

function safe(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error("Rincian CaLK melebihi batas Rupiah yang aman.");
  return value;
}

function total(rows: readonly Pair[]): Pair {
  return {
    current: rows.reduce((sum, row) => safe(sum + row.current), 0),
    prior: rows.reduce((sum, row) => safe(sum + row.prior), 0),
  };
}

export function buildAccountingNotes(statements: Statements) {
  const byRole = (rows: StatementLine[], role: StatementLine["role"]) =>
    rows.filter((row) => row.role === role);
  const assets = statements.position.assets;
  const liabilities = statements.position.liabilities;
  const cash = byRole(assets, "cash");
  const receivables = byRole(assets, "receivable");
  const inventory = byRole(assets, "inventory");
  const fixedCost = byRole(assets, "fixed_asset");
  const accumulatedDepreciation = byRole(assets, "accumulated_depreciation");
  const payables = byRole(liabilities, "payable");
  const cashTotal = total(cash);
  const receivablesTotal = total(receivables);
  const inventoryTotal = total(inventory);
  const fixedCostTotal = total(fixedCost);
  const accumulatedTotal = total(accumulatedDepreciation);
  const netFixedAssets: Pair = {
    current: safe(fixedCostTotal.current + accumulatedTotal.current),
    prior: safe(fixedCostTotal.prior + accumulatedTotal.prior),
  };
  const payablesTotal = total(payables);
  const allAssets = total([cashTotal, receivablesTotal, inventoryTotal, netFixedAssets]);
  if (allAssets.current !== statements.position.totalAssets.current
    || allAssets.prior !== statements.position.totalAssets.prior
    || payablesTotal.current !== statements.position.totalLiabilities.current
    || payablesTotal.prior !== statements.position.totalLiabilities.prior)
    throw new Error("Rincian CaLK tidak cocok dengan laporan posisi keuangan.");
  return { cash, cashTotal, receivables, receivablesTotal, inventory, inventoryTotal,
    fixedCost, fixedCostTotal, accumulatedDepreciation, accumulatedTotal, netFixedAssets,
    payables, payablesTotal };
}

export function assetRegisterMatches(rows: readonly { cost: number; accumulated: number }[],
  expectedCost: number, expectedAccumulated: number) {
  if (!Number.isSafeInteger(expectedCost) || !Number.isSafeInteger(expectedAccumulated)) return false;
  let cost = 0;
  let accumulated = 0;
  for (const row of rows) {
    if (!Number.isSafeInteger(row.cost) || !Number.isSafeInteger(row.accumulated)
      || row.cost < 1 || row.accumulated < 0 || row.accumulated > row.cost) return false;
    cost += row.cost;
    accumulated += row.accumulated;
    if (!Number.isSafeInteger(cost) || !Number.isSafeInteger(accumulated)) return false;
  }
  return cost === expectedCost && accumulated === expectedAccumulated;
}
