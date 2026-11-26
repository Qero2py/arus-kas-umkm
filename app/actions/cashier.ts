"use server";

import type { CashierProduct } from "@/lib/supabase/cashier";
import { ownerContext } from "@/lib/supabase/workspace";

export async function searchCashierProducts(query: string) {
  if (typeof query !== "string" || query.length > 80)
    return { ok: false as const, message: "Kata pencarian terlalu panjang." };
  const context = await ownerContext();
  if (context.status !== "ok")
    return { ok: false as const, message: "Masuk ke usaha untuk mencari produk." };
  const result = await context.supabase.rpc("get_cashier_catalog", {
    p_business_id: context.business.id, p_query: query.trim(),
  });
  if (result.error || !result.data) return { ok: false as const, message: "Produk belum dapat dicari." };
  const products = (result.data as { products?: CashierProduct[] }).products;
  if (!Array.isArray(products)) return { ok: false as const, message: "Hasil pencarian produk tidak valid." };
  return { ok: true as const, products };
}
