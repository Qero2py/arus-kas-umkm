"use server";

import { revalidatePath } from "next/cache";
import { parseQuantity } from "@/lib/inventory";
import { ownerContext, todayInJakarta } from "@/lib/supabase/workspace";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const code = /^[0-9A-Z._-]{2,20}$/;
const documentNo = /^[A-Z0-9][A-Z0-9._/-]{0,39}$/;

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function refresh() {
  for (const path of ["/accounting/inventory", "/accounting/reports", "/accounting/credit"])
    revalidatePath(path);
}
async function owner() {
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner")
    return { ok: false as const, message: "Hanya pemilik yang dapat mengelola persediaan." };
  return { ok: true as const, context };
}

export async function createInventoryProduct(input: {
  kind: "stock" | "service"; sku: string; name: string; unit: string;
  purchasePrice: number; salePrice: number; minQty: string;
  inventoryAccountCode: string; cogsAccountCode: string; revenueAccountCode: string;
}) {
  const kind = input?.kind;
  const sku = typeof input?.sku === "string" ? input.sku.trim().toUpperCase() : "";
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const unit = typeof input?.unit === "string" ? input.unit.trim() : "";
  const minQty = parseQuantity(input?.minQty ?? "");
  if (!["stock", "service"].includes(kind) || !documentNo.test(sku) || !name || name.length > 100
    || !unit || unit.length > 20 || minQty === null || (kind === "service" && minQty !== 0)
    || !Number.isSafeInteger(input?.purchasePrice) || input.purchasePrice < 0
    || !Number.isSafeInteger(input?.salePrice) || input.salePrice < 0
    || !code.test(input?.revenueAccountCode ?? "")
    || (kind === "stock" && (!code.test(input?.inventoryAccountCode ?? "")
      || !code.test(input?.cogsAccountCode ?? ""))))
    return { ok: false as const, message: "Periksa jenis, SKU, nama, satuan, harga, batas stok, dan akun." };
  const user = await owner();
  if (!user.ok) return user;
  const { error } = await user.context.supabase.rpc("create_inventory_product", {
    p_business_id: user.context.business.id, p_kind: kind, p_sku: sku, p_name: name, p_unit: unit,
    p_purchase_price: input.purchasePrice, p_sale_price: input.salePrice, p_min_qty_milli: minQty,
    p_inventory_account_code: kind === "stock" ? input.inventoryAccountCode : null,
    p_cogs_account_code: kind === "stock" ? input.cogsAccountCode : null,
    p_revenue_account_code: input.revenueAccountCode,
  });
  if (error) return { ok: false as const, message: error.code === "23505" ? "SKU sudah digunakan."
    : "Produk belum tersimpan. Periksa akun dan koneksi lalu coba lagi." };
  refresh();
  return { ok: true as const };
}

export async function activateInventory(openings: { productId: string; qty: string; value: number }[]) {
  if (!Array.isArray(openings) || openings.length > 10000 || openings.some((item) =>
    !uuid.test(item?.productId ?? "") || parseQuantity(item?.qty ?? "") === null
    || !Number.isSafeInteger(item?.value) || item.value < 0))
    return { ok: false as const, message: "Periksa semua kuantitas dan nilai stok awal." };
  const user = await owner();
  if (!user.ok) return user;
  const { error } = await user.context.supabase.rpc("activate_inventory", {
    p_business_id: user.context.business.id,
    p_openings: openings.map((item) => ({ productId: item.productId,
      qtyMilli: String(parseQuantity(item.qty)), value: String(item.value) })),
  });
  if (error) return { ok: false as const, message: error.code === "23514"
    ? "Nilai stok awal harus sama dengan saldo akun Persediaan di buku besar. Isi semua produk, termasuk yang saldonya nol."
    : "Stok awal belum aktif. Periksa data dan koneksi lalu coba lagi." };
  refresh();
  return { ok: true as const };
}

export async function postInventoryEvent(input: {
  id: string; kind: "purchase" | "sale" | "opname"; productId: string;
  date: string; qty: string; amount: number; payment: "cash" | "credit";
  cashAccountCode: string; controlAccountCode: string; expenseAccountCode: string;
  contactId: string; documentNo: string; dueDate: string;
}) {
  const qty = parseQuantity(input?.qty ?? "");
  const number = typeof input?.documentNo === "string" ? input.documentNo.trim().toUpperCase() : "";
  const invalidPayment = input?.kind !== "opname" && (
    !["cash", "credit"].includes(input?.payment)
    || (input.payment === "cash" && !code.test(input?.cashAccountCode ?? ""))
    || (input.payment === "credit" && (!uuid.test(input?.contactId ?? "")
      || !documentNo.test(number) || !validDate(input?.dueDate ?? "")
      || input.dueDate < input.date || !code.test(input?.controlAccountCode ?? "")))
  );
  if (!uuid.test(input?.id ?? "") || !uuid.test(input?.productId ?? "")
    || !["purchase", "sale", "opname"].includes(input?.kind)
    || !validDate(input?.date ?? "") || input.date > todayInJakarta()
    || qty === null || (input.kind !== "opname" && qty === 0)
    || !Number.isSafeInteger(input?.amount) || input.amount < 0
    || (input.kind !== "opname" && input.amount === 0)
    || (input.kind === "opname" && !code.test(input?.expenseAccountCode ?? ""))
    || invalidPayment)
    return { ok: false as const, message: "Periksa produk, tanggal, kuantitas, nominal, pembayaran, dan akun." };
  const user = await owner();
  if (!user.ok) return user;
  const { error } = await user.context.supabase.rpc("post_inventory_event", {
    p_business_id: user.context.business.id, p_event_id: input.id,
    p_payload: { kind: input.kind, productId: input.productId, date: input.date,
      qtyMilli: String(qty), amount: String(input.amount), payment: input.payment,
      cashAccountCode: input.cashAccountCode, controlAccountCode: input.controlAccountCode,
      expenseAccountCode: input.expenseAccountCode, contactId: input.contactId,
      documentNo: number, dueDate: input.dueDate },
  });
  if (error) return { ok: false as const, message: error.code === "23505"
    ? "Transaksi atau nomor dokumen sudah digunakan. Periksa daftar sebelum mengulang."
    : error.code === "23514"
      ? "Transaksi ditolak: periksa stok tersedia, urutan tanggal, akun, dan kecocokan nilai persediaan dengan buku besar."
      : "Transaksi stok belum dibukukan. Periksa data dan koneksi lalu coba lagi." };
  refresh();
  return { ok: true as const };
}

export async function correctCashInventoryEvent(input: {
  correctionId: string; originalMovementId: string; replacementEventId: string;
  productId: string; kind: "purchase" | "sale" | "opname"; date: string;
  qty: string; amount: number; cashAccountCode: string; expenseAccountCode: string;
  reason: string;
}) {
  const qty = parseQuantity(input?.qty ?? "");
  const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
  if (!uuid.test(input?.correctionId ?? "") || !uuid.test(input?.originalMovementId ?? "")
    || !uuid.test(input?.replacementEventId ?? "") || !uuid.test(input?.productId ?? "")
    || !["purchase", "sale", "opname"].includes(input?.kind)
    || !validDate(input?.date ?? "") || input.date > todayInJakarta()
    || qty === null || (input.kind !== "opname" && qty <= 0)
    || !Number.isSafeInteger(input?.amount) || input.amount < 0
    || (input.kind !== "opname" && input.amount === 0)
    || (input.kind === "opname" && !code.test(input?.expenseAccountCode ?? ""))
    || (input.kind !== "opname" && !code.test(input?.cashAccountCode ?? ""))
    || reason.length < 10 || reason.length > 500)
    return { ok: false as const, message: "Periksa jumlah, nominal, akun, tanggal, dan alasan koreksi." };
  const user = await owner();
  if (!user.ok) return user;
  const { error } = await user.context.supabase.rpc("correct_cash_inventory_event", {
    p_business_id: user.context.business.id, p_correction_id: input.correctionId,
    p_original_movement_id: input.originalMovementId,
    p_replacement_event_id: input.replacementEventId, p_correction_date: input.date,
    p_reason: reason, p_payload: { kind: input.kind, productId: input.productId,
      qtyMilli: String(qty), amount: String(input.amount), payment: "cash",
      cashAccountCode: input.cashAccountCode, expenseAccountCode: input.expenseAccountCode },
  });
  if (error) return { ok: false as const, message: error.code === "23514" || error.code === "22023"
    ? "Koreksi ditolak. Hanya mutasi tunai terakhir pada produk dan bulan terbuka yang dapat dikoreksi; periksa stok serta akun."
    : error.code === "23505" ? "Nomor koreksi sudah digunakan. Muat ulang kartu stok."
      : "Koreksi stok belum tersimpan. Periksa koneksi lalu coba lagi." };
  refresh();
  return { ok: true as const };
}
