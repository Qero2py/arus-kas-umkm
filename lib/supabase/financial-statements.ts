import "server-only";

import type { AccountClass, AccountRole } from "@/lib/accounting";
import { assetRegisterMatches, buildAccountingNotes } from "@/lib/accounting-notes";
import { buildFinancialStatements, type StatementBalance } from "@/lib/financial-statements";
import { ownerContext, todayInJakarta } from "@/lib/supabase/workspace";

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function rupiah(value: unknown) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value))
    throw new Error("Nilai laporan bukan angka Rupiah bulat.");
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("Nilai laporan melebihi batas tampilan yang aman.");
  return number;
}

type AssetDetail = {
  id: string; asset_code: string; name: string; category: string;
  ready_on: string; cost: number; accumulated: number; life_months: number | null;
};

async function loadCurrentAssetRegister(context: Extract<Awaited<ReturnType<typeof ownerContext>>, { status: "ok" }>,
  expectedCost: number, expectedAccumulated: number) {
  const book = await context.supabase.from("accounting_fixed_asset_books")
    .select("started_month").eq("business_id", context.business.id).maybeSingle();
  if (book.error) return { status: "unavailable" as const, assets: [] as AssetDetail[] };
  if (!book.data) return { status: "inactive" as const, assets: [] as AssetDetail[] };
  const assets: AssetDetail[] = [];
  for (let offset = 0; offset <= 10000; offset += 500) {
    if (offset === 10000) return { status: "too_many" as const, assets: [] as AssetDetail[] };
    const batch = await context.supabase.from("accounting_fixed_assets")
      .select("id,asset_code,name,category,ready_on,cost,accumulated,life_months")
      .eq("business_id", context.business.id).order("asset_code").range(offset, offset + 499);
    if (batch.error) return { status: "unavailable" as const, assets: [] as AssetDetail[] };
    for (const row of batch.data ?? []) {
      if (!Number.isSafeInteger(row.cost) || !Number.isSafeInteger(row.accumulated))
        return { status: "unavailable" as const, assets: [] as AssetDetail[] };
      assets.push(row as AssetDetail);
    }
    if ((batch.data ?? []).length < 500) break;
  }
  if (!assetRegisterMatches(assets, expectedCost, expectedAccumulated))
    return { status: "unreconciled" as const, assets: [] as AssetDetail[] };
  return { status: "ready" as const, assets };
}

export function comparativeDates(asOf: string) {
  if (!validDate(asOf)) throw new Error("Tanggal laporan tidak valid.");
  const date = new Date(`${asOf}T00:00:00Z`);
  const year = date.getUTCFullYear();
  if (year < 1902) throw new Error("Tahun laporan belum didukung.");
  const month = date.getUTCMonth() + 1;
  const lastPriorDay = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastPriorDay);
  const priorAsOf = `${year - 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { asOf, priorAsOf, currentStart: `${year}-01-01`, priorStart: `${year - 1}-01-01`,
    currentYearOpening: `${year - 1}-12-31`, priorYearOpening: `${year - 2}-12-31` };
}

export async function loadFinancialStatements(asOf: string) {
  if (!validDate(asOf) || asOf > todayInJakarta())
    return { ok: false as const, message: "Tanggal laporan tidak valid." };
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner")
    return { ok: false as const, message: "Hanya pemilik yang dapat membuka laporan keuangan." };
  try {
    const dates = comparativeDates(asOf);
    const queries = [dates.asOf, dates.priorAsOf, dates.currentYearOpening, dates.priorYearOpening];
    const results = await Promise.all(queries.map((date) => context.supabase.rpc("get_accounting_trial_balance", {
      p_business_id: context.business.id, p_as_of_date: date,
    })));
    if (results.some((result) => result.error || !Array.isArray(result.data)))
      return { ok: false as const, message: "Saldo jurnal untuk periode pembanding belum dapat dimuat." };
    const snapshots = results.map((result) => (result.data ?? []).map((row: Record<string, unknown>): StatementBalance => ({
      code: String(row.code), name: String(row.name), class: row.class as AccountClass,
      role: row.role as AccountRole, totalDebit: rupiah(row.total_debit), totalCredit: rupiah(row.total_credit),
    })));
    const statements = buildFinancialStatements({ current: snapshots[0], prior: snapshots[1],
      currentYearOpening: snapshots[2], priorYearOpening: snapshots[3] });
    const notes = buildAccountingNotes(statements);
    const assetRegister = asOf === todayInJakarta()
      ? await loadCurrentAssetRegister(context, notes.fixedCostTotal.current,
        -notes.accumulatedTotal.current)
      : { status: "historical" as const, assets: [] as AssetDetail[] };
    return { ok: true as const, businessName: context.business.name, dates, statements, notes, assetRegister };
  } catch (error) {
    return { ok: false as const,
      message: error instanceof Error ? error.message : "Laporan belum dapat disusun." };
  }
}
