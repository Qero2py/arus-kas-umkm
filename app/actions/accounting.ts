"use server";

import {
  ACCOUNT_ROLE_DEFAULTS, BASIC_ACCOUNTING_EVENT_TYPES, journalForEvent, openingJournal,
  type Account, type AccountRole, type BasicAccountingEvent, type JournalLine,
} from "@/lib/accounting";
import { validateOpeningCreditDetails, type OpeningCreditDetail } from "@/lib/opening-credits";
import { ownerContext, todayInJakarta } from "@/lib/supabase/workspace";
import { revalidatePath } from "next/cache";

type AccountInput = { code: string; name: string; role: AccountRole };

async function accountingOwner() {
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner")
    return { ok: false as const, message: "Hanya pemilik yang dapat membuka pembukuan akuntansi." };
  const { data, error } = await context.supabase.from("accounting_accounts")
    .select("code, name, class, role, normal, active")
    .eq("business_id", context.business.id).order("code", { ascending: true });
  if (error) return { ok: false as const, message: "Daftar akun belum tersedia pada database usaha." };
  return { ok: true as const, context, accounts: (data ?? []) as Account[] };
}

function refreshAccountingPages() {
  for (const path of ["/accounting/accounts", "/accounting/opening", "/accounting/entries", "/accounting/reports"])
    revalidatePath(path);
}

export async function listAccountingAccounts() {
  const result = await accountingOwner();
  return result.ok ? { ok: true as const, accounts: result.accounts }
    : { ok: false as const, message: result.message };
}

export async function addAccountingAccount(input: AccountInput) {
  const code = typeof input?.code === "string" ? input.code.trim().toUpperCase() : "";
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const profile = ACCOUNT_ROLE_DEFAULTS[input?.role];
  if (!/^[0-9A-Z._-]{2,20}$/.test(code) || name.length < 1 || name.length > 100 || !profile)
    return { ok: false as const, message: "Periksa kode, nama, dan jenis akun." };
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner")
    return { ok: false as const, message: "Hanya pemilik yang dapat menambah akun." };
  const { error } = await context.supabase.from("accounting_accounts").insert({
    business_id: context.business.id, code, name, class: profile.class,
    role: input.role, normal: profile.normal, active: true,
  });
  if (error?.code === "23505") return { ok: false as const, message: "Kode akun sudah digunakan." };
  if (error) return { ok: false as const, message: "Akun belum tersimpan. Periksa koneksi atau skema database." };
  refreshAccountingPages();
  return { ok: true as const };
}

export async function postOpeningBalances(input: { date: string; lines: JournalLine[]; documents: OpeningCreditDetail[] }) {
  if (typeof input?.date !== "string" || !Array.isArray(input.lines)
    || input.lines.some((line) => !line || typeof line.accountCode !== "string"
      || typeof line.debit !== "number" || typeof line.credit !== "number"))
    return { ok: false as const, message: "Periksa tanggal dan nominal saldo pembuka." };
  const owner = await accountingOwner();
  if (!owner.ok) return { ok: false as const, message: owner.message };
  let journal;
  try {
    journal = openingJournal(input.date, input.lines, owner.accounts);
    validateOpeningCreditDetails(journal.date, journal.lines, owner.accounts, input.documents);
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "Saldo pembuka tidak valid." };
  }
  if (journal.date > todayInJakarta()) return { ok: false as const, message: "Tanggal saldo pembuka tidak boleh di masa depan." };
  const { error } = await owner.context.supabase.rpc("post_accounting_opening_with_details", {
    p_business_id: owner.context.business.id, p_entry_date: journal.date,
    p_lines: journal.lines, p_documents: input.documents.map((document) => ({
      ...document, documentNo: document.documentNo.toUpperCase(),
      description: document.description.trim(),
    })),
  });
  if (error) return { ok: false as const, message: error.code === "23505" || error.code === "23514"
    ? "Saldo pembuka ditolak. Periksa rincian piutang/utang dan pastikan belum ada jurnal lain."
    : "Saldo pembuka belum tersimpan. Periksa akun dan koneksi lalu coba lagi." };
  refreshAccountingPages();
  return { ok: true as const };
}

export async function postBasicAccountingEvent(input: BasicAccountingEvent) {
  if (!input || !BASIC_ACCOUNTING_EVENT_TYPES.includes(input.type)
    || typeof input.sourceId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.sourceId))
    return { ok: false as const, message: "Jenis atau nomor transaksi tidak valid." };
  const owner = await accountingOwner();
  if (!owner.ok) return { ok: false as const, message: owner.message };
  let journal;
  try {
    journal = journalForEvent(input, owner.accounts);
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "Transaksi tidak valid." };
  }
  if (journal.date > todayInJakarta()) return { ok: false as const, message: "Tanggal transaksi tidak boleh di masa depan." };
  const { error } = await owner.context.supabase.rpc("post_accounting_journal", {
    p_business_id: owner.context.business.id, p_entry_date: journal.date,
    p_source_type: journal.sourceType, p_source_id: journal.sourceId,
    p_description: journal.description, p_lines: journal.lines,
  });
  if (error) return { ok: false as const, message: error.code === "23505"
    ? "Transaksi ini sudah dibukukan. Muat ulang laporan untuk melihat hasilnya."
    : error.code === "23514" ? "Tanggal transaksi mendahului saldo pembuka atau jurnal ditolak."
      : "Transaksi belum dibukukan. Periksa akun dan koneksi lalu coba lagi." };
  refreshAccountingPages();
  return { ok: true as const };
}
