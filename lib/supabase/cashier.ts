import "server-only";

import type { Account } from "@/lib/accounting";
import { ownerContext } from "@/lib/supabase/workspace";

export type CashierAccount = Account & { id: string };
export type CashierProduct = {
  id: string; kind: "stock" | "service"; sku: string; name: string; unit: string;
  sale_price: number; qty_milli: number; revenue_account_id: string;
};

export async function loadCashier() {
  const context = await ownerContext();
  if (context.status !== "ok")
    return { ok: false as const, message: "Masuk ke usaha untuk membuka Kasir." };
  const accountsRequest = context.supabase.from("accounting_accounts")
    .select("id,code,name,class,role,normal,active")
    .eq("business_id", context.business.id).order("code");
  const [accounts, catalog] = await Promise.all([accountsRequest,
    context.supabase.rpc("get_cashier_catalog", { p_business_id: context.business.id, p_query: "" })]);
  if (accounts.error || catalog.error || !catalog.data)
    return { ok: false as const, message: "Data Kasir belum dapat dimuat." };
  const payload = catalog.data as { bookDate?: string | null; products?: CashierProduct[] };
  if (!Array.isArray(payload.products))
    return { ok: false as const, message: "Daftar produk Kasir tidak valid." };
  return { ok: true as const, role: context.role, businessName: context.business.name,
    accounts: (accounts.data ?? []) as CashierAccount[],
    products: payload.products, bookDate: payload.bookDate ?? null };
}
