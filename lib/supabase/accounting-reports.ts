import "server-only";

import type { Account } from "@/lib/accounting";
import { ownerContext, todayInJakarta } from "@/lib/supabase/workspace";

export type TrialBalanceRow = Account & {
  totalDebit: number;
  totalCredit: number;
  endingDebit: number;
  endingCredit: number;
};

export type LedgerRow = {
  entryDate: string;
  description: string;
  sourceType: string;
  sourceId: string;
  lineNo: number;
  debit: number;
  credit: number;
  runningBalance: number;
};

function rupiah(value: unknown) {
  if (typeof value !== "string" || !/^-?(0|[1-9]\d*)$/.test(value)) throw new Error("Nilai laporan bukan angka Rupiah bulat.");
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("Nilai laporan melebihi batas tampilan yang aman.");
  return number;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function loadAccountingReport(asOf: string, requestedCode: string, page: number) {
  if (!validDate(asOf) || asOf > todayInJakarta() || !Number.isSafeInteger(page) || page < 1 || page > 10000)
    return { ok: false as const, message: "Tanggal atau halaman laporan tidak valid." };
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner")
    return { ok: false as const, message: "Hanya pemilik yang dapat membuka laporan akuntansi." };

  const { data: trialData, error: trialError } = await context.supabase.rpc("get_accounting_trial_balance", {
    p_business_id: context.business.id, p_as_of_date: asOf,
  });
  if (trialError || !Array.isArray(trialData))
    return { ok: false as const, message: "Neraca saldo belum dapat dimuat dari database development." };

  try {
    const balances: TrialBalanceRow[] = trialData.map((row: Record<string, unknown>) => ({
      code: String(row.code), name: String(row.name), class: row.class as Account["class"],
      role: row.role as Account["role"], normal: row.normal as Account["normal"], active: Boolean(row.active),
      totalDebit: rupiah(row.total_debit), totalCredit: rupiah(row.total_credit),
      endingDebit: rupiah(row.ending_debit), endingCredit: rupiah(row.ending_credit),
    }));
    const accountCode = balances.some((row) => row.code === requestedCode) ? requestedCode
      : (balances.find((row) => row.role === "cash") ?? balances[0])?.code ?? "";
    const { data: ledgerData, error: ledgerError } = accountCode
      ? await context.supabase.rpc("get_accounting_ledger", {
        p_business_id: context.business.id, p_account_code: accountCode,
        p_as_of_date: asOf, p_limit: 101, p_offset: (page - 1) * 100,
      })
      : { data: [], error: null };
    if (ledgerError || !Array.isArray(ledgerData))
      return { ok: false as const, message: "Buku besar belum dapat dimuat dari database development." };
    const ledger: LedgerRow[] = ledgerData.slice(0, 100).map((row: Record<string, unknown>) => ({
      entryDate: String(row.entry_date), description: String(row.description),
      sourceType: String(row.source_type), sourceId: String(row.source_id), lineNo: Number(row.line_no),
      debit: rupiah(row.debit), credit: rupiah(row.credit), runningBalance: rupiah(row.running_balance),
    }));
    const sum = (field: "endingDebit" | "endingCredit") => {
      const value = balances.reduce((total, row) => total + row[field], 0);
      if (!Number.isSafeInteger(value)) throw new Error("Total laporan melebihi batas tampilan yang aman.");
      return value;
    };
    const debit = sum("endingDebit");
    const credit = sum("endingCredit");
    return { ok: true as const, businessName: context.business.name, asOf, balances,
      accountCode, ledger, page, hasMore: ledgerData.length > 100, debit, credit, balanced: debit === credit };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "Data laporan tidak valid." };
  }
}
