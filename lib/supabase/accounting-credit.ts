import "server-only";

import type { Account } from "@/lib/accounting";
import { ownerContext } from "@/lib/supabase/workspace";

export type AccountingContact = {
  id: string;
  kind: "customer" | "supplier" | "both";
  name: string;
  phone: string | null;
  address: string | null;
};

export type CreditDocument = {
  id: string;
  kind: "sale" | "purchase";
  origin: "opening" | "operational";
  contactName: string;
  documentNo: string;
  issueDate: string;
  dueDate: string;
  description: string;
  amount: number;
  paid: number;
  outstanding: number;
  correctable: boolean;
};
export type CreditPayment = {
  id: string; documentId: string; paidDate: string; amount: number; cashAccountCode: string;
};

const pageSize = 50;

function safeRupiah(value: unknown): number {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) throw new Error("Nominal dokumen tidak valid.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("Nominal dokumen melebihi batas tampilan.");
  return parsed;
}

export async function loadAccountingContacts(page: number) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
    return { ok: false as const, message: "Halaman kontak tidak valid." };
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner")
    return { ok: false as const, message: "Hanya pemilik yang dapat membuka kontak akuntansi." };
  const { data, error } = await context.supabase.from("accounting_contacts")
    .select("id, kind, name, phone, address")
    .eq("business_id", context.business.id).order("name").order("id")
    .range((page - 1) * pageSize, page * pageSize);
  if (error) return { ok: false as const, message: "Kontak belum dapat dimuat." };
  return { ok: true as const, contacts: (data ?? []).slice(0, pageSize) as AccountingContact[],
    hasMore: (data ?? []).length > pageSize, page, businessName: context.business.name };
}

export async function loadAccountingCredit(page: number) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
    return { ok: false as const, message: "Halaman dokumen tidak valid." };
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner")
    return { ok: false as const, message: "Hanya pemilik yang dapat membuka dokumen tempo." };
  const [documentsResult, accountsResult, inventoryResult, assetResult] = await Promise.all([
    context.supabase.rpc("get_accounting_credit_documents", {
      p_business_id: context.business.id, p_limit: pageSize + 1, p_offset: (page - 1) * pageSize,
    }),
    context.supabase.from("accounting_accounts").select("id, code, name, class, role, normal, active")
      .eq("business_id", context.business.id).order("code"),
    context.supabase.from("inventory_books").select("business_id")
      .eq("business_id", context.business.id).maybeSingle(),
    context.supabase.from("accounting_fixed_asset_books").select("business_id")
      .eq("business_id", context.business.id).maybeSingle(),
  ]);
  if (documentsResult.error || !Array.isArray(documentsResult.data) || accountsResult.error
    || inventoryResult.error || assetResult.error)
    return { ok: false as const, message: "Dokumen tempo atau daftar akun belum dapat dimuat." };
  try {
    const documentRows = documentsResult.data.slice(0, pageSize);
    const ids = documentRows.map((row: Record<string, unknown>) => String(row.id));
    const [paymentsResult, stockResult, linkedAssetsResult] = ids.length ? await Promise.all([
      context.supabase.from("accounting_credit_payments")
        .select("id,document_id,paid_date,amount,cash_account_id")
        .eq("business_id", context.business.id).in("document_id", ids)
        .order("paid_date", { ascending: false }).limit(1000),
      context.supabase.from("inventory_movements").select("credit_document_id")
        .eq("business_id", context.business.id).in("credit_document_id", ids),
      context.supabase.from("accounting_fixed_assets").select("credit_document_id")
        .eq("business_id", context.business.id).in("credit_document_id", ids),
    ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
    if (paymentsResult.error || stockResult.error || linkedAssetsResult.error)
      return { ok: false as const, message: "Rincian koreksi dokumen belum dapat dimuat." };
    const accountRows = accountsResult.data ?? [];
    const accountCodes = new Map(accountRows.map((row) => [row.id, row.code]));
    const accountRoles = new Map(accountRows.map((row) => [row.code, row.role]));
    const linkedIds = new Set([
      ...(stockResult.data ?? []).map((row) => row.credit_document_id),
      ...(linkedAssetsResult.data ?? []).map((row) => row.credit_document_id),
    ]);
    const documents: CreditDocument[] = documentRows.map((row: Record<string, unknown>) => ({
      id: String(row.id), kind: row.kind as CreditDocument["kind"],
      origin: row.recognition_account_code ? "operational" : "opening",
      contactName: String(row.contact_name), documentNo: String(row.document_no),
      issueDate: String(row.issue_date), dueDate: String(row.due_date),
      description: String(row.description), amount: safeRupiah(row.amount),
      paid: safeRupiah(row.paid), outstanding: safeRupiah(row.outstanding),
      correctable: !linkedIds.has(String(row.id)) &&
        accountRoles.get(String(row.recognition_account_code)) === (row.kind === "sale" ? "revenue" : "expense"),
    }));
    const payments: CreditPayment[] = (paymentsResult.data ?? []).map((row) => ({
      id: row.id, documentId: row.document_id, paidDate: row.paid_date,
      amount: Number(row.amount), cashAccountCode: accountCodes.get(row.cash_account_id) ?? "",
    }));
    return { ok: true as const, documents, hasMore: documentsResult.data.length > pageSize,
      payments, accounts: accountRows as Account[], inventoryActive: Boolean(inventoryResult.data),
      assetActive: Boolean(assetResult.data),
      page, businessName: context.business.name };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "Data dokumen tidak valid." };
  }
}
