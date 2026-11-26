import "server-only";

import { ownerContext, todayInJakarta } from "@/lib/supabase/workspace";

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function safeNumber(value: unknown) {
  if (typeof value !== "string" || !/^-?(0|[1-9]\d*)$/.test(value)) throw new Error("Nilai analisis penjualan tidak valid.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("Nilai analisis penjualan melebihi batas aman.");
  return parsed;
}

export async function loadSalesAnalytics(start: string, end: string) {
  const rangeDays = (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000;
  if (!validDate(start) || !validDate(end) || start > end || end > todayInJakarta() || rangeDays > 366)
    return { ok: false as const, message: "Pilih rentang tanggal sampai satu tahun terakhir." };
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner")
    return { ok: false as const, message: "Hanya pemilik yang dapat membuka analisis penjualan." };
  const [productsResult, customersResult] = await Promise.all([
    context.supabase.rpc("get_accounting_product_sales", { p_business_id: context.business.id, p_start: start, p_end: end }),
    context.supabase.rpc("get_accounting_customer_sales", { p_business_id: context.business.id, p_start: start, p_end: end }),
  ]);
  if (productsResult.error || customersResult.error || !Array.isArray(productsResult.data) || !Array.isArray(customersResult.data))
    return { ok: false as const, message: "Analisis penjualan belum dapat dimuat dari jurnal usaha." };
  try {
    const products = productsResult.data.map((row: Record<string, unknown>) => ({
      id: String(row.product_id), sku: String(row.sku), name: String(row.product_name), unit: String(row.unit),
      quantityMilli: safeNumber(row.quantity_milli), revenue: safeNumber(row.revenue), cogs: safeNumber(row.cogs),
    }));
    if (products.some((row) => !Number.isSafeInteger(row.revenue - row.cogs)))
      throw new Error("Laba kotor produk melebihi batas aman.");
    const customers = customersResult.data.map((row: Record<string, unknown>) => ({
      id: String(row.contact_id), name: String(row.customer_name),
      documentCount: Number(row.document_count), revenue: safeNumber(row.revenue),
    }));
    if (customers.some((row) => !Number.isSafeInteger(row.documentCount) || row.documentCount < 0))
      throw new Error("Jumlah dokumen pelanggan tidak valid.");
    return { ok: true as const, businessName: context.business.name, products, customers, start, end };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "Analisis penjualan tidak valid." };
  }
}
