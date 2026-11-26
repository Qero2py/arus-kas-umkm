"use server";

import { revalidatePath } from "next/cache";
import { ownerContext, todayInJakarta } from "@/lib/supabase/workspace";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function refresh() {
  for (const path of ["/accounting/controls", "/accounting/reports", "/accounting/entries"])
    revalidatePath(path);
}

export async function closeAccountingPeriod(month: string) {
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(month)
    || month >= `${todayInJakarta().slice(0, 7)}-01`)
    return { ok: false as const, message: "Pilih bulan yang sudah selesai." };
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner")
    return { ok: false as const, message: "Hanya pemilik yang dapat menutup periode." };
  const { error } = await context.supabase.rpc("close_accounting_period", {
    p_business_id: context.business.id, p_month: month,
  });
  if (error) return { ok: false as const, message: error.code === "23514"
    ? "Bulan harus ditutup berurutan mulai dari bulan jurnal pertama. Muat ulang halaman."
    : "Periode belum dapat ditutup. Periksa data jurnal dan coba lagi." };
  refresh();
  return { ok: true as const };
}

export async function correctBasicAccountingJournal(input: {
  originalJournalId: string; correctionId: string; date: string; reason: string;
  description: string; amount: number; debitCode: string; creditCode: string;
}) {
  if (!input || !uuid.test(input.originalJournalId) || !uuid.test(input.correctionId)
    || typeof input.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)
    || input.date > todayInJakarta() || typeof input.reason !== "string"
    || input.reason.trim().length < 10 || input.reason.trim().length > 500
    || typeof input.description !== "string" || !input.description.trim()
    || input.description.trim().length > 250 || !Number.isSafeInteger(input.amount)
    || input.amount <= 0 || !/^[0-9A-Za-z._-]{2,20}$/.test(input.debitCode)
    || !/^[0-9A-Za-z._-]{2,20}$/.test(input.creditCode))
    return { ok: false as const, message: "Periksa tanggal, alasan, keterangan, akun, dan nominal koreksi." };
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner")
    return { ok: false as const, message: "Hanya pemilik yang dapat mengoreksi jurnal." };
  const { error } = await context.supabase.rpc("correct_basic_accounting_journal", {
    p_business_id: context.business.id, p_correction_id: input.correctionId,
    p_original_journal_id: input.originalJournalId, p_correction_date: input.date,
    p_reason: input.reason.trim(), p_description: input.description.trim(),
    p_amount: input.amount, p_debit_account_code: input.debitCode,
    p_credit_account_code: input.creditCode,
  });
  if (error) return { ok: false as const, message: error.code === "23505"
    ? "Jurnal ini sudah dikoreksi. Muat ulang halaman."
    : error.code === "23514" || error.code === "22023"
      ? "Koreksi ditolak. Pastikan periode masih terbuka, tanggal satu bulan dengan jurnal asal, dan akun sesuai jenis transaksi."
      : "Koreksi belum tersimpan. Periksa koneksi lalu coba lagi." };
  refresh();
  return { ok: true as const };
}
