import "server-only";

import { buildCashFlow, type CashMovement } from "@/lib/cash-flow";
import { ownerContext, todayInJakarta } from "@/lib/supabase/workspace";

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function rupiah(value: unknown) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) throw new Error("Nilai kas tidak valid.");
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("Nilai kas melebihi batas aman.");
  return number;
}

export async function loadCashFlowReport(start: string, end: string) {
  if (!validDate(start) || !validDate(end) || start > end || end > todayInJakarta())
    return { ok: false as const, message: "Pilih rentang tanggal yang valid sampai hari ini." };
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner")
    return { ok: false as const, message: "Hanya pemilik yang dapat membuka laporan arus kas." };
  const [workspace, earliest, trial] = await Promise.all([
    context.supabase.rpc("get_accounting_cash_workspace", { p_business_id: context.business.id }),
    context.supabase.from("accounting_journals").select("entry_date").eq("business_id", context.business.id).order("entry_date", { ascending: true }).limit(1).maybeSingle(),
    context.supabase.rpc("get_accounting_trial_balance", { p_business_id: context.business.id, p_as_of_date: end }),
  ]);
  if (workspace.error || earliest.error || trial.error || !workspace.data || !earliest.data || !Array.isArray(trial.data))
    return { ok: false as const, message: "Laporan arus kas belum dapat dimuat dari jurnal." };
  if (start < earliest.data.entry_date)
    return { ok: false as const, message: `Pembukuan dimulai ${earliest.data.entry_date}. Pilih tanggal awal pada atau sesudahnya.` };
  try {
    const payload = workspace.data as {
      openingBalance: string;
      entries: { journalId: string; date: string; category: string; type: "in" | "out"; amount: string }[];
    };
    if (!Array.isArray(payload.entries)) throw new Error("Mutasi kas tidak lengkap.");
    const movements: CashMovement[] = payload.entries.map((entry) => ({
      journalId: entry.journalId, date: entry.date, category: entry.category, type: entry.type, amount: rupiah(entry.amount),
    }));
    const report = buildCashFlow(rupiah(payload.openingBalance), movements, start, end);
    const cashFromTrial = trial.data.filter((row: { role: string }) => row.role === "cash")
      .reduce((sum: number, row: { ending_debit: string; ending_credit: string }) => sum + rupiah(row.ending_debit) - rupiah(row.ending_credit), 0);
    if (!Number.isSafeInteger(cashFromTrial) || cashFromTrial !== report.closing)
      throw new Error("Saldo akhir arus kas belum cocok dengan neraca saldo.");
    return { ok: true as const, businessName: context.business.name, start, end, report };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "Laporan arus kas tidak valid." };
  }
}
