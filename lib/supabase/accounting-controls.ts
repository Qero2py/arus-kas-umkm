import "server-only";
import { ownerContext, todayInJakarta } from "@/lib/supabase/workspace";
import { BASIC_ACCOUNTING_EVENT_TYPES, type Account } from "@/lib/accounting";

export type BasicJournalRow = {
  id: string; entryDate: string; type: string; description: string;
  amount: number; debitCode: string; creditCode: string; corrected: boolean; closed: boolean;
};
export type PeriodClosureRow = {
  periodMonth: string; journalCount: number; totalDebit: number; closedAt: string;
};
export type CorrectionHistoryRow = {
  id: string; originalJournalId: string; date: string; reason: string; correctedAt: string;
};

function monthAfter(month: string) {
  const date = new Date(`${month}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

export async function loadAccountingControls(page: number) {
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner")
    return { ok: false as const, message: "Hanya pemilik yang dapat mengelola periode dan koreksi." };
  if (!Number.isInteger(page) || page < 1 || page > 1000)
    return { ok: false as const, message: "Halaman tidak valid." };
  const businessId = context.business.id;
  const [accountsResult, firstResult, closuresResult, journalsResult, historyResult] = await Promise.all([
    context.supabase.from("accounting_accounts").select("id,code,name,class,role,normal,active")
      .eq("business_id", businessId).order("code"),
    context.supabase.from("accounting_journals").select("entry_date")
      .eq("business_id", businessId).order("entry_date", { ascending: true }).limit(1),
    context.supabase.from("accounting_period_closures")
      .select("period_month,journal_count,total_debit,closed_at")
      .eq("business_id", businessId).order("period_month", { ascending: false }),
    context.supabase.from("accounting_journals").select("id,entry_date,source_type,description")
      .eq("business_id", businessId).in("source_type", [...BASIC_ACCOUNTING_EVENT_TYPES])
      .order("entry_date", { ascending: false }).order("created_at", { ascending: false })
      .range((page - 1) * 30, page * 30),
    context.supabase.from("accounting_corrections")
      .select("id,original_journal_id,correction_date,reason,corrected_at")
      .eq("business_id", businessId).order("corrected_at", { ascending: false }).limit(20),
  ]);
  if (accountsResult.error || firstResult.error || closuresResult.error || journalsResult.error || historyResult.error)
    return { ok: false as const, message: "Data periode belum dapat dibaca." };
  const headers = (journalsResult.data ?? []).slice(0, 30);
  const ids = headers.map((row) => row.id);
  const [linesResult, correctedResult] = ids.length ? await Promise.all([
    context.supabase.from("accounting_journal_lines")
      .select("journal_id,account_id,debit,credit").eq("business_id", businessId).in("journal_id", ids),
    context.supabase.from("accounting_corrections").select("original_journal_id")
      .eq("business_id", businessId).in("original_journal_id", ids),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (linesResult.error || correctedResult.error)
    return { ok: false as const, message: "Rincian jurnal belum dapat dibaca." };
  const accountRows = accountsResult.data ?? [];
  const accountById = new Map(accountRows.map((account) => [account.id, account.code]));
  const lines = linesResult.data ?? [];
  const correctedIds = new Set((correctedResult.data ?? []).map((row) => row.original_journal_id));
  const closures: PeriodClosureRow[] = (closuresResult.data ?? []).map((row) => ({
    periodMonth: row.period_month, journalCount: row.journal_count,
    totalDebit: Number(row.total_debit), closedAt: row.closed_at,
  }));
  const latestClosed = closures[0]?.periodMonth ?? "";
  const journals: BasicJournalRow[] = headers.flatMap((row) => {
    const ownLines = lines.filter((line) => line.journal_id === row.id);
    const debit = ownLines.find((line) => Number(line.debit) > 0);
    const credit = ownLines.find((line) => Number(line.credit) > 0);
    if (!debit || !credit || !accountById.has(debit.account_id) || !accountById.has(credit.account_id)) return [];
    return [{ id: row.id, entryDate: row.entry_date, type: row.source_type,
      description: row.description, amount: Number(debit.debit),
      debitCode: accountById.get(debit.account_id)!, creditCode: accountById.get(credit.account_id)!,
      corrected: correctedIds.has(row.id), closed: !!latestClosed && row.entry_date.slice(0, 7) <= latestClosed.slice(0, 7) }];
  });
  const firstMonth = firstResult.data?.[0]?.entry_date?.slice(0, 7).concat("-01") ?? "";
  const nextMonth = latestClosed ? monthAfter(latestClosed) : firstMonth;
  const today = todayInJakarta();
  const history: CorrectionHistoryRow[] = (historyResult.data ?? []).map((row) => ({
    id: row.id, originalJournalId: row.original_journal_id, date: row.correction_date,
    reason: row.reason, correctedAt: row.corrected_at,
  }));
  return { ok: true as const, businessName: context.business.name, today,
    nextClosableMonth: nextMonth && nextMonth < `${today.slice(0, 7)}-01` ? nextMonth : "",
    closures, journals, history, accounts: accountRows as Account[], page,
    hasMore: (journalsResult.data ?? []).length > 30 };
}
