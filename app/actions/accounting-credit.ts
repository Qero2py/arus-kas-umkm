"use server";

import { revalidatePath } from "next/cache";
import { ownerContext, todayInJakarta } from "@/lib/supabase/workspace";
import type { AccountingContact } from "@/lib/supabase/accounting-credit";

type ContactKind = AccountingContact["kind"];
type CreditKind = "sale" | "purchase";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const accountCode = /^[0-9A-Z._-]{2,20}$/;

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function refresh() {
  for (const path of ["/accounting/contacts", "/accounting/credit", "/accounting/reports", "/accounting/controls"])
    revalidatePath(path);
}

async function accountingOwner() {
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner")
    return { ok: false as const, message: "Hanya pemilik yang dapat mengelola pembukuan akuntansi." };
  return { ok: true as const, context };
}

export async function createAccountingContact(input: { kind: ContactKind; name: string; phone: string; address: string }) {
  const kind = input?.kind;
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const phone = typeof input?.phone === "string" ? input.phone.trim() : "";
  const address = typeof input?.address === "string" ? input.address.trim() : "";
  if (!["customer", "supplier", "both"].includes(kind) || !name || name.length > 100 || phone.length > 30 || address.length > 250)
    return { ok: false as const, message: "Periksa jenis, nama, nomor kontak, dan alamat." };
  const owner = await accountingOwner();
  if (!owner.ok) return owner;
  const { error } = await owner.context.supabase.from("accounting_contacts").insert({
    business_id: owner.context.business.id, kind, name, phone: phone || null, address: address || null,
  });
  if (error) return { ok: false as const, message: "Kontak belum tersimpan. Periksa koneksi lalu coba lagi." };
  refresh();
  return { ok: true as const };
}

export async function updateAccountingContact(input: { id: string; name: string; phone: string; address: string }) {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const phone = typeof input?.phone === "string" ? input.phone.trim() : "";
  const address = typeof input?.address === "string" ? input.address.trim() : "";
  if (!uuid.test(input?.id ?? "") || !name || name.length > 100 || phone.length > 30 || address.length > 250)
    return { ok: false as const, message: "Periksa nama, nomor kontak, dan alamat." };
  const owner = await accountingOwner();
  if (!owner.ok) return owner;
  const { data, error } = await owner.context.supabase.from("accounting_contacts")
    .update({ name, phone: phone || null, address: address || null })
    .eq("id", input.id).eq("business_id", owner.context.business.id).select("id").maybeSingle();
  if (error || !data) return { ok: false as const, message: "Kontak tidak ditemukan atau belum tersimpan." };
  refresh();
  return { ok: true as const };
}

export async function searchAccountingContacts(query: string, kind: CreditKind) {
  if (typeof query !== "string" || query.trim().length < 2 || query.trim().length > 80
    || !["sale", "purchase"].includes(kind))
    return { ok: false as const, message: "Masukkan sedikitnya dua huruf nama kontak." };
  const owner = await accountingOwner();
  if (!owner.ok) return owner;
  const safe = query.trim().replace(/[%_\\]/g, "");
  if (safe.length < 2) return { ok: false as const, message: "Masukkan nama kontak yang valid." };
  const allowed = kind === "sale" ? ["customer", "both"] : ["supplier", "both"];
  const { data, error } = await owner.context.supabase.from("accounting_contacts")
    .select("id, name, kind").eq("business_id", owner.context.business.id)
    .in("kind", allowed).ilike("name", `%${safe}%`).order("name").limit(30);
  if (error) return { ok: false as const, message: "Pencarian kontak gagal." };
  return { ok: true as const, contacts: (data ?? []) as Pick<AccountingContact, "id" | "name" | "kind">[] };
}

export async function createAccountingCreditDocument(input: {
  id: string; kind: CreditKind; contactId: string; documentNo: string; issueDate: string;
  dueDate: string; description: string; amount: number; recognitionAccountCode: string; controlAccountCode: string;
}) {
  const number = typeof input?.documentNo === "string" ? input.documentNo.trim().toUpperCase() : "";
  const description = typeof input?.description === "string" ? input.description.trim() : "";
  if (!uuid.test(input?.id ?? "") || !uuid.test(input?.contactId ?? "")
    || !["sale", "purchase"].includes(input?.kind)
    || !/^[A-Z0-9][A-Z0-9._/-]{0,39}$/.test(number)
    || !validDate(input?.issueDate ?? "") || input.issueDate > todayInJakarta()
    || !validDate(input?.dueDate ?? "") || input.dueDate < input.issueDate
    || !description || description.length > 250
    || !Number.isSafeInteger(input?.amount) || input.amount < 1
    || !accountCode.test(input?.recognitionAccountCode ?? "")
    || !accountCode.test(input?.controlAccountCode ?? ""))
    return { ok: false as const, message: "Periksa kontak, nomor dokumen, tanggal, akun, dan nominal." };
  const owner = await accountingOwner();
  if (!owner.ok) return owner;
  const { error } = await owner.context.supabase.rpc("create_accounting_credit_document", {
    p_business_id: owner.context.business.id, p_document_id: input.id, p_kind: input.kind,
    p_contact_id: input.contactId, p_document_no: number, p_issue_date: input.issueDate,
    p_due_date: input.dueDate, p_description: description, p_amount: input.amount,
    p_recognition_account_code: input.recognitionAccountCode,
    p_control_account_code: input.controlAccountCode,
  });
  if (error) return { ok: false as const, message: error.code === "23505"
    ? "Nomor atau permintaan dokumen sudah digunakan. Muat ulang daftar sebelum mencoba lagi."
    : error.code === "23514" || error.code === "22023"
      ? "Dokumen ditolak. Periksa jenis kontak, akun, tanggal saldo pembuka, dan nominal."
      : "Dokumen belum dibukukan. Periksa koneksi lalu coba lagi." };
  refresh();
  return { ok: true as const };
}

export async function recordAccountingCreditPayment(input: {
  id: string; documentId: string; paidDate: string; amount: number; cashAccountCode: string;
}) {
  if (!uuid.test(input?.id ?? "") || !uuid.test(input?.documentId ?? "")
    || !validDate(input?.paidDate ?? "") || input.paidDate > todayInJakarta()
    || !Number.isSafeInteger(input?.amount) || input.amount < 1
    || !accountCode.test(input?.cashAccountCode ?? ""))
    return { ok: false as const, message: "Periksa tanggal, nominal, dan akun kas/bank." };
  const owner = await accountingOwner();
  if (!owner.ok) return owner;
  const { error } = await owner.context.supabase.rpc("record_accounting_credit_payment", {
    p_business_id: owner.context.business.id, p_payment_id: input.id,
    p_document_id: input.documentId, p_paid_date: input.paidDate,
    p_amount: input.amount, p_cash_account_code: input.cashAccountCode,
  });
  if (error) return { ok: false as const, message: error.code === "23514"
    ? "Pembayaran melebihi sisa tagihan, mendahului tanggal dokumen, atau akun tidak sesuai. Muat ulang daftar."
    : error.code === "23505" ? "Nomor permintaan pembayaran sudah dipakai untuk data lain."
      : "Pembayaran belum dibukukan. Periksa koneksi lalu coba lagi." };
  refresh();
  return { ok: true as const };
}

export async function correctAccountingCreditDocument(input: {
  correctionId: string; documentId: string; correctionDate: string; reason: string;
  amount: number; dueDate: string; description: string;
}) {
  const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
  const description = typeof input?.description === "string" ? input.description.trim() : "";
  if (!uuid.test(input?.correctionId ?? "") || !uuid.test(input?.documentId ?? "")
    || !validDate(input?.correctionDate ?? "") || input.correctionDate > todayInJakarta()
    || !validDate(input?.dueDate ?? "") || !Number.isSafeInteger(input?.amount)
    || input.amount < 1 || reason.length < 10 || reason.length > 500
    || !description || description.length > 250)
    return { ok: false as const, message: "Periksa tanggal, nominal, keterangan, dan alasan koreksi." };
  const owner = await accountingOwner();
  if (!owner.ok) return owner;
  const { error } = await owner.context.supabase.rpc("correct_accounting_credit_document", {
    p_business_id: owner.context.business.id, p_correction_id: input.correctionId,
    p_document_id: input.documentId, p_correction_date: input.correctionDate,
    p_reason: reason, p_amount: input.amount, p_due_date: input.dueDate,
    p_description: description,
  });
  if (error) return { ok: false as const, message: error.code === "23514" || error.code === "22023"
    ? "Koreksi ditolak. Periksa periode terbuka, nominal minimal pembayaran, dan jenis dokumen."
    : error.code === "23505" ? "Nomor koreksi sudah dipakai. Muat ulang halaman."
      : "Koreksi belum tersimpan. Periksa koneksi lalu coba lagi." };
  refresh();
  return { ok: true as const };
}

export async function correctAccountingCreditPayment(input: {
  correctionId: string; paymentId: string; correctionDate: string; reason: string;
  amount: number; cashAccountCode: string;
}) {
  const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
  if (!uuid.test(input?.correctionId ?? "") || !uuid.test(input?.paymentId ?? "")
    || !validDate(input?.correctionDate ?? "") || input.correctionDate > todayInJakarta()
    || !Number.isSafeInteger(input?.amount) || input.amount < 1
    || !accountCode.test(input?.cashAccountCode ?? "")
    || reason.length < 10 || reason.length > 500)
    return { ok: false as const, message: "Periksa tanggal, nominal, akun kas, dan alasan koreksi." };
  const owner = await accountingOwner();
  if (!owner.ok) return owner;
  const { error } = await owner.context.supabase.rpc("correct_accounting_credit_payment", {
    p_business_id: owner.context.business.id, p_correction_id: input.correctionId,
    p_payment_id: input.paymentId, p_correction_date: input.correctionDate,
    p_reason: reason, p_amount: input.amount, p_cash_account_code: input.cashAccountCode,
  });
  if (error) return { ok: false as const, message: error.code === "23514" || error.code === "22023"
    ? "Koreksi ditolak. Periksa periode terbuka, sisa tagihan, tanggal, dan akun kas."
    : error.code === "23505" ? "Nomor koreksi sudah dipakai. Muat ulang halaman."
      : "Koreksi belum tersimpan. Periksa koneksi lalu coba lagi." };
  refresh();
  return { ok: true as const };
}
