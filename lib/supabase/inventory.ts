import "server-only";

import type { Account } from "@/lib/accounting";
import { ownerContext } from "@/lib/supabase/workspace";

export type InventoryProduct = {
  id: string; kind: "stock" | "service"; sku: string; name: string; unit: string;
  purchase_price: number; sale_price: number; min_qty_milli: number;
  qty_milli: number; stock_value: number;
};
export type InventoryMovement = {
  id: string; event_kind: "opening" | "purchase" | "sale" | "opname" | "correction_reversal";
  event_date: string; qty_delta_milli: number; value_delta: number;
  qty_after_milli: number; value_after: number; credit_document_id: string | null;
};

export async function loadInventory(page: number, requestedProductId: string) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
    return { ok: false as const, message: "Halaman produk tidak valid." };
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner")
    return { ok: false as const, message: "Hanya pemilik yang dapat membuka persediaan." };
  const [bookResult, productResult, accountsResult] = await Promise.all([
    context.supabase.from("inventory_books").select("started_on").eq("business_id", context.business.id).maybeSingle(),
    context.supabase.from("inventory_products")
      .select("id,kind,sku,name,unit,purchase_price,sale_price,min_qty_milli,qty_milli,stock_value")
      .eq("business_id", context.business.id).order("sku").range((page - 1) * 50, page * 50),
    context.supabase.from("accounting_accounts").select("code,name,class,role,normal,active")
      .eq("business_id", context.business.id).order("code"),
  ]);
  if (bookResult.error || productResult.error || accountsResult.error)
    return { ok: false as const, message: "Persediaan belum dapat dimuat." };
  const productRows = (productResult.data ?? []) as InventoryProduct[];
  const products = productRows.slice(0, 50);
  const selectedId = products.find((product) => product.id === requestedProductId)?.id
    ?? products.find((product) => product.kind === "stock")?.id ?? "";
  const movementResult = selectedId ? await context.supabase.from("inventory_movements")
    .select("id,event_kind,event_date,qty_delta_milli,value_delta,qty_after_milli,value_after,credit_document_id")
    .eq("business_id", context.business.id).eq("product_id", selectedId)
    .order("posting_order", { ascending: false }).limit(50) : { data: [], error: null };
  if (movementResult.error) return { ok: false as const, message: "Kartu stok belum dapat dimuat." };
  const openings: InventoryProduct[] = [];
  if (!bookResult.data) {
    for (let offset = 0; offset < 10000; offset += 500) {
      const batch = await context.supabase.from("inventory_products")
        .select("id,kind,sku,name,unit,purchase_price,sale_price,min_qty_milli,qty_milli,stock_value")
        .eq("business_id", context.business.id).eq("kind", "stock").order("sku")
        .range(offset, offset + 499);
      if (batch.error) return { ok: false as const, message: "Produk stok awal belum dapat dimuat." };
      openings.push(...(batch.data ?? []) as InventoryProduct[]);
      if ((batch.data ?? []).length < 500) break;
      if (offset === 9500) return { ok: false as const, message: "Terlalu banyak produk untuk formulir aktivasi stok awal." };
    }
  }
  return { ok: true as const, businessName: context.business.name, products, openings,
    bookDate: bookResult.data?.started_on ?? null, accounts: (accountsResult.data ?? []) as Account[],
    movements: (movementResult.data ?? []) as InventoryMovement[], selectedId,
    page, hasMore: productRows.length > 50 };
}
