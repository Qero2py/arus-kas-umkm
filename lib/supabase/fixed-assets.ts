import "server-only";

import type { Account } from "@/lib/accounting";
import { ownerContext } from "@/lib/supabase/workspace";

export type FixedAsset = {
  id: string; asset_code: string; name: string;
  category: "land" | "building" | "equipment" | "vehicle" | "other";
  acquired_on: string; ready_on: string; cost: number;
  initial_accumulated: number; accumulated: number; life_months: number | null;
  source_kind: "opening" | "cash" | "credit";
};

export async function loadFixedAssets(page: number) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
    return { ok: false as const, message: "Halaman aset tidak valid." };
  const context = await ownerContext();
  if (context.status !== "ok" || context.role !== "owner")
    return { ok: false as const, message: "Hanya pemilik yang dapat membuka aset tetap." };
  const [assetsResult, bookResult, accountsResult, depreciationResult] = await Promise.all([
    context.supabase.from("accounting_fixed_assets")
      .select("id,asset_code,name,category,acquired_on,ready_on,cost,initial_accumulated,accumulated,life_months,source_kind")
      .eq("business_id", context.business.id).order("asset_code").range((page - 1) * 50, page * 50),
    context.supabase.from("accounting_fixed_asset_books")
      .select("started_month,last_depreciated_month").eq("business_id", context.business.id).maybeSingle(),
    context.supabase.from("accounting_accounts")
      .select("code,name,class,role,normal,active").eq("business_id", context.business.id).order("code"),
    context.supabase.from("accounting_fixed_asset_depreciations")
      .select("id,period_month,amount,posted_on,asset_id")
      .eq("business_id", context.business.id).order("created_at", { ascending: false }).limit(50),
  ]);
  if (assetsResult.error || bookResult.error || accountsResult.error || depreciationResult.error)
    return { ok: false as const, message: "Aset atau jadwal penyusutan belum dapat dimuat." };
  const rows = (assetsResult.data ?? []) as FixedAsset[];
  return { ok: true as const, businessName: context.business.name,
    assets: rows.slice(0, 50), hasMore: rows.length > 50, page,
    book: bookResult.data as { started_month: string; last_depreciated_month: string | null } | null,
    accounts: (accountsResult.data ?? []) as Account[],
    depreciations: (depreciationResult.data ?? []) as {
      id: string; period_month: string; amount: number; posted_on: string; asset_id: string;
    }[],
  };
}
