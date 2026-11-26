import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { InventoryView } from "@/components/inventory-view";
import { InventoryCorrectionView } from "@/components/inventory-correction-view";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { loadInventory } from "@/lib/supabase/inventory";
import { todayInJakarta } from "@/lib/supabase/workspace";

type Filters = Promise<{ page?: string | string[]; product?: string | string[] }>;

export default function InventoryPage({ searchParams }: { searchParams: Filters }) {
  return <Suspense fallback={<p role="status">Memuat persediaan…</p>}><Content searchParams={searchParams} /></Suspense>;
}

async function Content({ searchParams }: { searchParams: Filters }) {
  await connection();
  if (!isSupabaseConfigured()) return <p role="status">Persediaan tersedia setelah masuk ke usaha yang terhubung.</p>;
  const filters = await searchParams;
  const page = filters.page === undefined ? 1 : Number(filters.page);
  const result = await loadInventory(page, typeof filters.product === "string" ? filters.product : "");
  if (!result.ok) return <p role="alert" className="rounded-xl border border-border bg-card p-6 text-sm">{result.message}</p>;
  return <>
    <InventoryView {...result} today={todayInJakarta()} />
    <InventoryCorrectionView key={`${result.selectedId}:${result.movements[0]?.id ?? ""}`}
      product={result.products.find((item) => item.id === result.selectedId)}
      latest={result.movements[0]} accounts={result.accounts} today={todayInJakarta()} />
    {(result.page > 1 || result.hasMore) && <div className="mt-5 flex justify-between text-sm">
      {result.page > 1 ? <Link href={`/accounting/inventory?page=${result.page - 1}`} className="font-semibold text-primary underline">Sebelumnya</Link> : <span />}
      {result.hasMore && <Link href={`/accounting/inventory?page=${result.page + 1}`} className="font-semibold text-primary underline">Berikutnya</Link>}
    </div>}
  </>;
}
