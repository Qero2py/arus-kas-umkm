import { connection } from "next/server";
import { Suspense } from "react";
import { CashierView } from "@/components/cashier-view";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { loadCashier } from "@/lib/supabase/cashier";
import { todayInJakarta } from "@/lib/supabase/workspace";

export default function CashierPage() {
  return <Suspense fallback={<p role="status">Memuat Kasir…</p>}><Content /></Suspense>;
}

async function Content() {
  await connection();
  if (!isSupabaseConfigured())
    return <p role="status" className="rounded-xl border border-border bg-card p-6 text-sm">Kasir tersedia setelah masuk ke usaha yang terhubung.</p>;
  const result = await loadCashier();
  if (!result.ok) return <p role="alert" className="rounded-xl border border-border bg-card p-6 text-sm">{result.message}</p>;
  return <CashierView {...result} today={todayInJakarta()} />;
}
