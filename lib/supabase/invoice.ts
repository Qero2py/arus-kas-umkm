import "server-only";

import { ownerContext } from "@/lib/supabase/workspace";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Nominal invoice tidak valid.");
  return amount;
}

export async function loadInvoice(id: string) {
  if (!uuid.test(id)) return { ok: false as const, message: "Nomor invoice tidak valid." };
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner")
    return { ok: false as const, message: "Hanya pemilik yang dapat membuka invoice." };
  const document = await context.supabase.from("accounting_credit_documents")
    .select("id,kind,contact_id,contact_name,document_no,issue_date,due_date,description,amount,recognition_account_id")
    .eq("id", id).eq("business_id", context.business.id).maybeSingle();
  if (document.error || !document.data || document.data.kind !== "sale" || !document.data.recognition_account_id)
    return { ok: false as const, message: "Invoice penjualan tidak ditemukan." };
  const [contact, payments] = await Promise.all([
    context.supabase.from("accounting_contacts").select("phone,address")
      .eq("id", document.data.contact_id).eq("business_id", context.business.id).maybeSingle(),
    context.supabase.from("accounting_credit_payments").select("amount")
      .eq("document_id", id).eq("business_id", context.business.id),
  ]);
  if (contact.error || payments.error) return { ok: false as const, message: "Rincian invoice belum dapat dimuat." };
  try {
    const amount = safeAmount(document.data.amount);
    const paid = (payments.data ?? []).reduce((sum, row) => sum + safeAmount(row.amount), 0);
    if (!Number.isSafeInteger(paid) || paid > amount) throw new Error("Pembayaran invoice belum cocok dengan tagihan.");
    return { ok: true as const, invoice: {
      id, businessName: context.business.name,
      documentNo: document.data.document_no, issueDate: document.data.issue_date,
      dueDate: document.data.due_date, description: document.data.description,
      customerName: document.data.contact_name, phone: contact.data?.phone ?? "",
      address: contact.data?.address ?? "", amount, paid, outstanding: amount - paid,
    } };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "Invoice tidak valid." };
  }
}

export type Invoice = Extract<Awaited<ReturnType<typeof loadInvoice>>, { ok: true }>["invoice"];
