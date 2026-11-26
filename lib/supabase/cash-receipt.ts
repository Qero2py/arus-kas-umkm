import "server-only";

import { ownerContext } from "@/lib/supabase/workspace";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function loadCashReceipt(id: string) {
  if (!uuid.test(id)) return { ok: false as const, message: "Nomor struk tidak valid." };
  const context = await ownerContext();
  if (context.status !== "ok") return { ok: false as const, message: "Masuk ke usaha untuk membuka struk." };
  const { data, error } = await context.supabase.rpc("get_cash_sale_receipt", {
    p_business_id: context.business.id, p_journal_id: id,
  });
  if (error || !data) return { ok: false as const, message: "Struk tidak ditemukan atau akun ini tidak dapat membukanya." };
  const row = data as Record<string, unknown>;
  const amount = Number(row.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(row.date)))
    return { ok: false as const, message: "Data struk tidak valid." };
  return { ok: true as const, receipt: {
    journalId: id, receiptNo: String(row.receiptNo), businessName: String(row.businessName),
    date: String(row.date), description: String(row.description), cashName: String(row.cashName),
    amount, corrected: row.corrected === true,
  } };
}

export type CashReceipt = Extract<Awaited<ReturnType<typeof loadCashReceipt>>, { ok: true }>["receipt"];
